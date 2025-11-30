# routes/ingest.py
import os
import uuid
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import User, Dataset, Chat
from rag.pipeline import (
    ingest_document,
    ingest_text_docs_to_dataset,
    get_collection_name_for_dataset,
)
from rag.web_scrape import crawl_site
from schemas import ScrapeCreateRequest, ScrapeAddRequest

router = APIRouter(prefix="/ingest", tags=["ingest"])

UPLOAD_DIR = "storage"
os.makedirs(UPLOAD_DIR, exist_ok=True)


def _sid(n: int = 12) -> str:
  """Short random hex id."""
  return uuid.uuid4().hex[:n]


# ────────────────────────────────────────────────────────────
# File upload → create dataset
# ────────────────────────────────────────────────────────────
@router.post("/upload")
async def upload_and_ingest(
    file: UploadFile = File(...),
    user_email: str = Form(...),
    db: Session = Depends(get_db),
):
  """
  Upload a file, build embeddings first; only then create the dataset/chat.
  Prevent duplicate filenames per user.
  """
  ext = os.path.splitext(file.filename)[-1].lower()
  if ext not in {".pdf", ".docx", ".pptx", ".csv", ".xlsx", ".txt"}:
      raise HTTPException(status_code=400, detail="Unsupported file type")

  exists = (
      db.query(Dataset)
      .filter(Dataset.user_email == user_email, Dataset.name == file.filename)
      .first()
  )
  if exists:
      raise HTTPException(
          status_code=409,
          detail="A file with this name already exists for this account.",
      )

  ds_id = _sid(12)
  collection = f"ds_{ds_id}"
  save_path = os.path.join(UPLOAD_DIR, f"{ds_id}{ext}")
  try:
      with open(save_path, "wb") as f:
          f.write(await file.read())
  except Exception as e:
      raise HTTPException(status_code=500, detail=f"Failed to save file: {e}")

  try:
      chunks = ingest_document(collection, save_path, doc_id=ds_id)
      if not chunks:
          try:
              os.remove(save_path)
          except Exception:
              pass
          raise HTTPException(
              status_code=400, detail="No readable text found in file."
          )
  except Exception as e:
      try:
          os.remove(save_path)
      except Exception:
          pass
      raise HTTPException(status_code=500, detail=f"Ingestion failed: {e}")

  ds = Dataset(
      id=ds_id,
      user_email=user_email,
      name=file.filename,
      collection=collection,
  )
  db.add(ds)
  db.commit()
  db.refresh(ds)

  chat = Chat(
      id=_sid(16),
      user_email=user_email,
      dataset_id=ds_id,
      title="Chat 1",
  )
  db.add(chat)
  db.commit()
  db.refresh(chat)

  return {
      "ok": True,
      "dataset_id": ds_id,
      "dataset_name": ds.name,
      "chat_id": chat.id,
      "chunks": chunks,
  }


# ────────────────────────────────────────────────────────────
# Add another file to an existing dataset
# ────────────────────────────────────────────────────────────
@router.post("/add")
async def add_to_dataset(
    file: UploadFile = File(...),
    user_email: str = Form(...),
    dataset_id: str = Form(...),
    db: Session = Depends(get_db),
):
  ds = (
      db.query(Dataset)
      .filter(Dataset.id == dataset_id, Dataset.user_email == user_email)
      .first()
  )
  if not ds:
      raise HTTPException(status_code=404, detail="Dataset not found")

  ext = os.path.splitext(file.filename)[-1].lower()
  if ext not in {".pdf", ".docx", ".pptx", ".csv", ".xlsx", ".txt"}:
      raise HTTPException(status_code=400, detail="Unsupported file type")

  unique = uuid.uuid4().hex
  save_path = os.path.join(UPLOAD_DIR, f"{dataset_id}_{unique}{ext}")
  try:
      with open(save_path, "wb") as f:
          f.write(await file.read())
  except Exception as e:
      raise HTTPException(status_code=500, detail=f"Failed to save file: {e}")

  try:
      added = ingest_document(ds.collection, save_path, doc_id=unique[:10])
  except Exception as e:
      raise HTTPException(status_code=500, detail=f"Ingestion failed: {e}")

  return {"ok": True, "added_chunks": added}


# ────────────────────────────────────────────────────────────
# Scrape → create NEW dataset (URL only)
# ────────────────────────────────────────────────────────────
@router.post("/scrape-create")
def scrape_create_dataset(
    payload: ScrapeCreateRequest,
    db: Session = Depends(get_db),
):
  # 1) Check user exists
  user = db.query(User).filter(User.email == payload.user_email).first()
  if not user:
      raise HTTPException(status_code=404, detail="User not found")

  # Clamp pages defensively on backend too
  max_pages = max(1, min(payload.max_pages, 100))

  # 2) Create dataset record with its collection name
  ds_id = _sid(12)
  collection = f"ds_{ds_id}"

  dataset = Dataset(
      id=ds_id,
      user_email=user.email,
      name=f"Web: {str(payload.url)[:220]}",
      collection=collection,
  )
  db.add(dataset)
  db.commit()
  db.refresh(dataset)

  # 3) Create default chat
  chat = Chat(
      id=_sid(16),
      user_email=user.email,
      dataset_id=dataset.id,
      title="Chat 1",
  )
  db.add(chat)
  db.commit()
  db.refresh(chat)

  # 4) Crawl/scrape
  try:
      docs = crawl_site(str(payload.url), max_pages=max_pages)
  except Exception as e:
      raise HTTPException(status_code=500, detail=f"Scrape failed: {e}")

  if not docs:
      raise HTTPException(
          status_code=400,
          detail="No text found while scraping site.",
      )

  # 5) Ingest scraped docs into Chroma
  ingest_text_docs_to_dataset(db, dataset, docs)

  return {
      "ok": True,
      "dataset_id": dataset.id,
      "dataset_name": dataset.name,
      "chat_id": chat.id,
      "pages_ingested": len(docs),
  }


# ────────────────────────────────────────────────────────────
# Scrape → ADD to existing dataset (file + URL / multiple URLs)
# ────────────────────────────────────────────────────────────
@router.post("/scrape-add")
def scrape_add_to_dataset(
    payload: ScrapeAddRequest,
    db: Session = Depends(get_db),
):
  """
  Add scraped pages from a URL into an existing dataset
  that belongs to THIS user.

  Used when combining a data file + URL into one chatbot.
  """
  # 1) Find dataset by id AND owner so accounts never mix
  dataset = (
      db.query(Dataset)
      .filter(
          Dataset.id == payload.dataset_id,
          Dataset.user_email == payload.user_email,
      )
      .first()
  )
  if not dataset:
      raise HTTPException(
          status_code=404,
          detail="Dataset not found for this user.",
      )

  max_pages = max(1, min(payload.max_pages, 100))

  # 2) Scrape
  try:
      docs = crawl_site(str(payload.url), max_pages=max_pages)
  except Exception as e:
      raise HTTPException(status_code=500, detail=f"Scrape failed: {e}")

  if not docs:
      raise HTTPException(
          status_code=400,
          detail="No text found while scraping site.",
      )

  # 3) Ingest into existing dataset collection
  ingest_text_docs_to_dataset(db, dataset, docs)

  return {
      "ok": True,
      "dataset_id": dataset.id,
      "added_pages": len(docs),
  }
