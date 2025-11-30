# routes/vision.py
import os
import uuid
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import Chat, Dataset, Message
from rag.pipeline import caption_image

# Optional helpers (we'll use them if present)
try:
    # Typical helper in your codebase; returns a Chroma collection handle
    from rag.vector_store import get_collection as _get_collection
except Exception:
    _get_collection = None

# Optional LLM helpers (use whatever exists)
_llm_funcs = []
try:
    from rag.pipeline import generate_answer as _generate_answer  # (question, context) -> str
    _llm_funcs.append(_generate_answer)
except Exception:
    pass
try:
    from rag.pipeline import answer_with_context as _answer_with_context
    _llm_funcs.append(_answer_with_context)
except Exception:
    pass
try:
    from rag.pipeline import gemini_answer as _gemini_answer
    _llm_funcs.append(_gemini_answer)
except Exception:
    pass

router = APIRouter(prefix="/vision", tags=["vision"])

IMG_DIR = "storage/images"
os.makedirs(IMG_DIR, exist_ok=True)


def _save_image(file: UploadFile) -> str:
    ext = os.path.splitext(file.filename or "")[-1].lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise HTTPException(status_code=400, detail="Unsupported image type")
    img_id = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(IMG_DIR, img_id)
    with open(path, "wb") as f:
        f.write(file.file.read())
    return path


def _retrieve_context(collection_name: str, query: str, k: int = 4) -> str:
    """
    Query Chroma for top-k docs and return a single context string.
    Falls back to empty context if the helper isn't available.
    """
    if not _get_collection:
        return ""
    try:
        coll = _get_collection(collection_name)
        res = coll.query(query_texts=[query], n_results=k, include=["documents"])
        docs = (res or {}).get("documents", [[]])
        docs0 = docs[0] if docs else []
        return "\n\n".join(docs0 or [])
    except Exception:
        return ""


def _llm_grounded_answer(question: str, context: str) -> str:
    """
    Try available LLM helpers in order; if none exist, return a friendly fallback.
    """
    for fn in _llm_funcs:
        try:
            return fn(question, context)
        except Exception:
            continue
    # Fallback (no LLM wired)
    ctx = (context or "")[:1200]
    return f"(LLM not configured) Question: {question}\n\nTop context:\n{ctx}"


@router.post("/caption")
async def caption(file: UploadFile = File(...)):
    """
    Simple image captioning (BLIP). Returns only the caption.
    """
    # Save and read the file via UploadFile async-friendly approach
    ext = os.path.splitext(file.filename or "")[-1].lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise HTTPException(status_code=400, detail="Unsupported image type")
    img_id = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(IMG_DIR, img_id)
    try:
        with open(path, "wb") as f:
            f.write(await file.read())
        cap = caption_image(path)
        return {"caption": cap}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ask")
async def ask_with_image(
    file: UploadFile = File(...),
    user_email: str = Form(...),
    chat_id: str = Form(...),
    question: str = Form(""),
    db: Session = Depends(get_db),
):
    """
    Multimodal ask:
      1) Caption the image with BLIP.
      2) Build a combined text query (user question + caption).
      3) Retrieve top-k context from the dataset bound to the chat.
      4) Generate a grounded answer with your LLM (Gemini or equivalent).
      5) Persist user & assistant messages like the text chat.
    """
    # --- Validate chat & dataset ownership ---
    chat = (
        db.query(Chat)
        .filter(Chat.id == chat_id, Chat.user_email == user_email)
        .first()
    )
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    ds = db.query(Dataset).filter(Dataset.id == chat.dataset_id).first()
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found for this chat")

    # --- Save image & caption ---
    ext = os.path.splitext(file.filename or "")[-1].lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise HTTPException(status_code=400, detail="Unsupported image type")

    img_id = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(IMG_DIR, img_id)
    with open(path, "wb") as f:
        f.write(await file.read())

    try:
        caption = caption_image(path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Captioning failed: {e}")

    # --- Build the query text ---
    q_text = (question or "").strip()
    combined = q_text + (" " if q_text else "") + f"[Image: {caption}]"

    # --- Retrieve context & answer ---
    context = _retrieve_context(ds.collection, combined, k=4)
    answer = _llm_grounded_answer(combined, context)

    # --- Persist messages (user → assistant), mirroring text chat behavior ---
    try:
        umsg = Message(
            id=uuid.uuid4().hex[:20],
            chat_id=chat.id,
            role="user",
            text=(question or f"(image) {caption}"),
        )
        amsg = Message(
            id=uuid.uuid4().hex[:20],
            chat_id=chat.id,
            role="assistant",
            text=answer,
        )
        db.add(umsg)
        db.add(amsg)
        db.commit()
    except Exception:
        db.rollback()  # don't fail the request if logging the messages fails

    return {
        "answer": answer,
        "caption": caption,
        "used_collection": ds.collection,
        "context_preview": (context or "")[:500],
    }


# --- Optional compatibility alias (so old frontend paths keep working) ---
@router.post("/ask-image")
async def ask_image_alias(
    file: UploadFile = File(...),
    user_email: str = Form(...),
    chat_id: str = Form(...),
    question: str = Form(""),
    db: Session = Depends(get_db),
):
    # Reuse the same implementation
    return await ask_with_image(file=file, user_email=user_email, chat_id=chat_id, question=question, db=db)
