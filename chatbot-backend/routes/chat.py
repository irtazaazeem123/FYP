# routes/chat.py
from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models import Chat, Dataset, Message, ApiKey
from rag.pipeline import ask
import uuid
import hashlib

router = APIRouter(prefix="/chat", tags=["chat"])


# -----------------------------------------
# Helpers
# -----------------------------------------
def _mid(n: int = 20) -> str:
    """Short random hex id for messages."""
    return uuid.uuid4().hex[:n]


def _hash(tok: str) -> str:
    """Hash API keys to match stored keys."""
    return hashlib.sha256(tok.encode()).hexdigest()


# -----------------------------------------
# Request model
# -----------------------------------------
class AskPayload(BaseModel):
    user_email: str | None = None
    chat_id: str | None = None
    question: str


# -----------------------------------------
# Chat ASK endpoint (internal + external)
# -----------------------------------------
@router.post("/ask")
def chat_ask(
    payload: AskPayload,
    x_api_key: str = Header(None),
    db: Session = Depends(get_db)
):
    """
    Handles:
    - Internal app requests (user_email + chat_id)
    - External API requests (X-API-Key header)
    """

    # ---------------------------------------------------------
    # 1) EXTERNAL CALL USING API KEY
    # ---------------------------------------------------------
    if x_api_key:
        hashed = _hash(x_api_key)

        api = db.query(ApiKey).filter(ApiKey.key_hash == hashed).first()

        if not api or not api.is_active:
            raise HTTPException(status_code=403, detail="Invalid API key")

        # Override payload info for external users
        payload.user_email = api.user_email
        payload.chat_id = api.chat_id

    # ---------------------------------------------------------
    # 2) INTERNAL CALL VALIDATION
    # ---------------------------------------------------------
    if not payload.user_email or not payload.chat_id or not payload.question:
        raise HTTPException(
            status_code=400,
            detail="Missing user_email, chat_id, or question"
        )

    chat = (
        db.query(Chat)
        .filter(Chat.id == payload.chat_id, Chat.user_email == payload.user_email)
        .first()
    )
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    ds = db.query(Dataset).filter(Dataset.id == chat.dataset_id).first()
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset missing")

    # ---------------------------------------------------------
    # 3) Store user message
    # ---------------------------------------------------------
    db.add(Message(id=_mid(), chat_id=chat.id, role="user", text=payload.question))
    db.commit()

    # ---------------------------------------------------------
    # 4) Run RAG over dataset
    # ---------------------------------------------------------
    answer = ask(ds.collection, payload.question)

    # ---------------------------------------------------------
    # 5) Store assistant message
    # ---------------------------------------------------------
    db.add(Message(id=_mid(), chat_id=chat.id, role="assistant", text=answer))
    db.commit()

    return {"answer": answer}
