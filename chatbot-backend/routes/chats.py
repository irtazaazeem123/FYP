# routes/chats.py
from fastapi import APIRouter, HTTPException, Depends, Query, Body
from sqlalchemy.orm import Session
from database import get_db
from models import Dataset, Chat, Message
import uuid

router = APIRouter(prefix="/chats", tags=["chats"])
_sid = lambda n=16: uuid.uuid4().hex[:n]

def _default_title_from_file(name: str) -> str:
    base = name.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    base = base.rsplit(".", 1)[0]
    return f"About {base}"[:60]

def _suggest_title_from_text(text: str) -> str:
    s = (text or "").strip().splitlines()[0]
    words = s.split()
    title = " ".join(words[:7]).rstrip(".,;:!?").title()
    return title or "New Chat"

@router.get("")
def list_chats(user_email: str = Query(...), dataset_id: str = Query(...), db: Session = Depends(get_db)):
    ds = db.query(Dataset).filter(Dataset.id == dataset_id, Dataset.user_email == user_email).first()
    if not ds:
        raise HTTPException(404, "Dataset not found")
    rows = (
        db.query(Chat)
        .filter(Chat.dataset_id == dataset_id, Chat.user_email == user_email)
        .order_by(Chat.created_at.desc())
        .all()
    )
    return {"chats": [{"id": c.id, "title": c.title} for c in rows]}

@router.post("")
def create_chat(user_email: str = Query(...), dataset_id: str = Query(...), db: Session = Depends(get_db)):
    ds = db.query(Dataset).filter(Dataset.id == dataset_id, Dataset.user_email == user_email).first()
    if not ds:
        raise HTTPException(404, "Dataset not found")
    title = _default_title_from_file(ds.name)
    chat = Chat(id=_sid(), user_email=user_email, dataset_id=dataset_id, title=title)
    db.add(chat); db.commit(); db.refresh(chat)
    return {"ok": True, "chat_id": chat.id, "title": chat.title}

@router.get("/{chat_id}/messages")
def list_messages(chat_id: str, user_email: str = Query(...), db: Session = Depends(get_db)):
    chat = db.query(Chat).filter(Chat.id == chat_id, Chat.user_email == user_email).first()
    if not chat:
        raise HTTPException(404, "Chat not found")
    msgs = (
        db.query(Message)
        .filter(Message.chat_id == chat_id)
        .order_by(Message.created_at.asc())
        .all()
    )
    return {"messages": [{"role": m.role, "text": m.text} for m in msgs]}

@router.patch("/{chat_id}/title")
def rename_chat(chat_id: str, new_title: str = Body(..., embed=True), user_email: str = Query(...), db: Session = Depends(get_db)):
    chat = db.query(Chat).filter(Chat.id == chat_id, Chat.user_email == user_email).first()
    if not chat:
        raise HTTPException(404, "Chat not found")
    chat.title = (new_title or "").strip()[:60] or chat.title
    db.commit()
    return {"ok": True, "title": chat.title}

@router.delete("/{chat_id}")
def delete_chat(chat_id: str, user_email: str = Query(...), db: Session = Depends(get_db)):
    """
    Deletes a chat and all its messages (relationship has cascade='all, delete-orphan').
    """
    chat = db.query(Chat).filter(Chat.id == chat_id, Chat.user_email == user_email).first()
    if not chat:
        raise HTTPException(404, "Chat not found")
    db.delete(chat)
    db.commit()
    return {"ok": True}
