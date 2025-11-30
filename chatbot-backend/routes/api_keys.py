# routes/api_keys.py
import secrets, hashlib
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models import ApiKey, Dataset, Chat

router = APIRouter(prefix="/api-keys", tags=["api-keys"])

def _new_token() -> str:
    return "cbt_" + secrets.token_urlsafe(24).replace("-", "_")

def _hash(tok: str) -> str:
    return hashlib.sha256(tok.encode()).hexdigest()

def _prefix(tok: str) -> str:
    return tok[:8]

class CreateKey(BaseModel):
    user_email: str
    dataset_id: str
    chat_id: str | None = None

@router.get("")
def list_keys(user_email: str = Query(...), db: Session = Depends(get_db)):
    rows = db.query(ApiKey).filter(ApiKey.user_email == user_email, ApiKey.is_active == True).all()
    ds_ids = {r.dataset_id for r in rows}
    ds_map = {}
    if ds_ids:
        for d in db.query(Dataset).filter(Dataset.id.in_(ds_ids)).all():
            ds_map[d.id] = d.name
    return {
        "api_keys": [
            {
                "id": r.id,
                "dataset_id": r.dataset_id,
                "dataset_name": ds_map.get(r.dataset_id, r.dataset_id),
                "chat_id": r.chat_id,
                "prefix": r.prefix,
                "masked": f"{r.prefix}••••••••",
                "created_at": r.created_at,
                "last_used": r.last_used,
                "is_active": r.is_active,
            }
            for r in rows
        ]
    }

@router.post("")
def create_key(p: CreateKey, db: Session = Depends(get_db)):
    ds = db.query(Dataset).filter(Dataset.id == p.dataset_id, Dataset.user_email == p.user_email).first()
    if not ds:
        raise HTTPException(404, "Dataset not found")
    if p.chat_id:
        ch = db.query(Chat).filter(
            Chat.id == p.chat_id,
            Chat.user_email == p.user_email,
            Chat.dataset_id == p.dataset_id
        ).first()
        if not ch:
            raise HTTPException(404, "Chat not found")

    q = db.query(ApiKey).filter(ApiKey.user_email == p.user_email, ApiKey.dataset_id == p.dataset_id)
    if p.chat_id is not None:
        q = q.filter(ApiKey.chat_id == p.chat_id)
    q.update({"is_active": False}, synchronize_session=False)

    token = _new_token()
    rec = ApiKey(
        user_email=p.user_email,
        dataset_id=p.dataset_id,
        chat_id=p.chat_id,
        key_hash=_hash(token),
        prefix=_prefix(token),
        is_active=True,
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return {"api_key": token, "id": rec.id}

@router.delete("/{key_id}")
def delete_key(key_id: int, user_email: str = Query(...), db: Session = Depends(get_db)):
    rec = db.query(ApiKey).filter(ApiKey.id == key_id, ApiKey.user_email == user_email).first()
    if not rec:
        raise HTTPException(404, "API key not found")
    db.delete(rec)
    db.commit()
    return {"ok": True}
