# routes/datasets.py
import os
from typing import List
from fastapi import APIRouter, HTTPException, Query, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import Dataset, Chat, Message, ApiKey  # include ApiKey

# Optional: try to import a helper to drop the Chroma collection.
try:
    from rag.vector_store import delete_collection as drop_vector_collection
except Exception:
    drop_vector_collection = None

router = APIRouter(prefix="/datasets", tags=["datasets"])

UPLOAD_DIR = "storage"


@router.get("")
def list_datasets(user_email: str = Query(...), db: Session = Depends(get_db)):
    rows: List[Dataset] = (
        db.query(Dataset)
        .filter(Dataset.user_email == user_email)
        .order_by(Dataset.created_at.desc())
        .all()
    )
    out = []
    for d in rows:
        chat_count = db.query(Chat).filter(Chat.dataset_id == d.id).count()
        out.append(
            {
                "id": d.id,
                "name": d.name,
                "collection": d.collection,
                "created_at": d.created_at,
                "chat_count": chat_count,
            }
        )
    return {"datasets": out}


@router.delete("/{dataset_id}")
def delete_dataset(dataset_id: str, user_email: str = Query(...), db: Session = Depends(get_db)):
    """
    Delete a dataset completely:
      - delete API keys tied to its chats / dataset
      - delete messages in its chats
      - delete chats
      - delete the dataset row
      - try to drop the Chroma collection
      - delete uploaded file(s) on disk for this dataset
    """
    ds = (
        db.query(Dataset)
        .filter(Dataset.id == dataset_id, Dataset.user_email == user_email)
        .first()
    )
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # Get all chat IDs belonging to this dataset
    chat_ids = [c.id for c in db.query(Chat).filter(Chat.dataset_id == ds.id).all()]

    # ---- 1) Delete API keys FIRST (prevents FK error) ----
    # delete keys bound to any chat in this dataset
    if chat_ids:
        db.query(ApiKey).filter(ApiKey.chat_id.in_(chat_ids)).delete(synchronize_session=False)
    # delete keys bound directly to this dataset (no chat specified)
    db.query(ApiKey).filter(ApiKey.dataset_id == ds.id).delete(synchronize_session=False)

    # ---- 2) Delete messages and then chats ----
    if chat_ids:
        db.query(Message).filter(Message.chat_id.in_(chat_ids)).delete(synchronize_session=False)
        db.query(Chat).filter(Chat.id.in_(chat_ids)).delete(synchronize_session=False)

    # ---- 3) Delete the dataset row ----
    db.delete(ds)
    db.commit()

    # ---- 4) Try to drop the vector collection (ignore errors) ----
    try:
        if drop_vector_collection:
            drop_vector_collection(ds.collection)
    except Exception:
        pass

    # ---- 5) Remove uploaded file(s) from disk ----
    try:
        if os.path.isdir(UPLOAD_DIR):
            for name in os.listdir(UPLOAD_DIR):
                # original: "<dataset_id>.<ext>"
                # extra:    "<dataset_id>_<unique>.<ext>"
                if name.startswith(dataset_id):
                    try:
                        os.remove(os.path.join(UPLOAD_DIR, name))
                    except Exception:
                        pass
    except Exception:
        pass

    return {"ok": True}
