# routes/external.py
import hashlib, datetime
from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import ApiKey, Dataset
from rag.pipeline import ask  # your RAG function

router = APIRouter(prefix="/ext", tags=["external"])

def _sha256(s: str) -> str:
    import hashlib
    return hashlib.sha256(s.encode("utf-8")).hexdigest()

def _get_key_from_header(authorization: str | None, x_api_key: str | None) -> str | None:
    if x_api_key:
        return x_api_key.strip()
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return None

class ExtAsk(BaseModel):
    question: str

@router.post("/ask")
def ext_ask(
    body: ExtAsk,
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None, convert_underscores=False),
    db: Session = Depends(get_db),
):
    token = _get_key_from_header(authorization, x_api_key)
    if not token:
        raise HTTPException(status_code=401, detail="Missing API key")

    h = _sha256(token)
    row = db.query(ApiKey).filter(ApiKey.key_hash == h, ApiKey.is_active == True).first()
    if not row:
        raise HTTPException(status_code=401, detail="Invalid or revoked API key")

    ds = db.query(Dataset).filter(Dataset.id == row.dataset_id).first()
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # RAG — scoped strictly to this dataset’s collection
    answer = ask(ds.collection, body.question)

    # last_used stamp
    row.last_used = datetime.datetime.utcnow()
    db.commit()

    return {"answer": answer}
