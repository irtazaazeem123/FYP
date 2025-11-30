# rag/pipeline.py
import os
from typing import List, Tuple, Optional

from dotenv import load_dotenv

# Load .env (GEMINI_API_KEY, GEMINI_MODEL, etc.)
load_dotenv(override=True)

from .file_parser import parse_file
from .text_splitter import recursive_split
from .vector_store import upsert_chunks, similarity_search

import google.generativeai as genai
from PIL import Image
from transformers import BlipProcessor, BlipForConditionalGeneration

from models import Dataset  # SQLAlchemy model

# Type alias for scraped docs: (source_url, text)
TextDoc = Tuple[str, str]

# ─────────────────────────────
# Globals (lazy-loaded once)
# ─────────────────────────────
_blip_processor: Optional[BlipProcessor] = None
_blip_model: Optional[BlipForConditionalGeneration] = None
_gemini_model = None


# ─────────────────────────────
# BLIP helpers
# ─────────────────────────────
def _get_blip():
    """
    Load BLIP base model once (lighter than 'large').
    Used for image captioning in vision flows.
    """
    global _blip_processor, _blip_model
    if _blip_processor is None or _blip_model is None:
        _blip_processor = BlipProcessor.from_pretrained(
            "Salesforce/blip-image-captioning-base"
        )
        _blip_model = BlipForConditionalGeneration.from_pretrained(
            "Salesforce/blip-image-captioning-base"
        )
    return _blip_processor, _blip_model


def caption_image(image_path: str) -> str:
    """
    Return a short caption for the given image file using BLIP.
    """
    processor, model = _get_blip()
    image = Image.open(image_path).convert("RGB")
    inputs = processor(image, return_tensors="pt")
    out = model.generate(**inputs, max_new_tokens=40)
    return processor.decode(out[0], skip_special_tokens=True)


# ─────────────────────────────
# Gemini helpers
# ─────────────────────────────
def _get_gemini():
    """
    Configure and cache the Gemini model.

    - Reads GEMINI_API_KEY from environment.
    - Uses GEMINI_MODEL if set (e.g. 'gemini-2.5-flash' or 'gemini-flash-latest'),
      otherwise defaults to 'gemini-flash-latest'.
    - If someone sets 'models/gemini-2.5-flash', we strip the 'models/' prefix.
    """
    global _gemini_model
    if _gemini_model is None:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY environment variable is not set.")

        genai.configure(api_key=api_key)

        model_name = os.getenv("GEMINI_MODEL", "gemini-flash-latest").strip()
        if model_name.startswith("models/"):
            model_name = model_name.split("/", 1)[1]

        _gemini_model = genai.GenerativeModel(model_name)

    return _gemini_model


# Backwards-compat alias if used elsewhere
_gem = _get_gemini


# ─────────────────────────────
# Ingestion for FILES  (upload)
# ─────────────────────────────
def ingest_document(collection_name: str, file_path: str, doc_id: str) -> int:
    """
    Parse -> chunk -> store in vector store (Chroma) via vector_store.py.
    Returns number of chunks stored.
    """
    text = parse_file(file_path)
    chunks = recursive_split(text, chunk_size=700, overlap=100)

    metadatas = [
        {"doc_id": doc_id, "source": os.path.basename(file_path), "idx": i}
        for i in range(len(chunks))
    ]

    upsert_chunks(collection_name, doc_id, chunks, metadatas)
    return len(chunks)


# ─────────────────────────────
# Ingestion for SCRAPED TEXT (URL docs)
# ─────────────────────────────
def get_collection_name_for_dataset(dataset: Dataset) -> str:
    """
    Stable collection name for a dataset.
    Uses dataset.collection if set, otherwise falls back to ds_{id}.
    """
    if dataset.collection:
        return dataset.collection
    return f"ds_{dataset.id}"


def ingest_text_docs_to_dataset(
    db,
    dataset: Dataset,
    docs: List[TextDoc],
) -> int:
    """
    Takes a list of (source, text) and ingests them into this dataset's
    Chroma collection using the same splitter + embedder as file uploads.
    Returns total number of chunks stored.
    """
    collection_name = get_collection_name_for_dataset(dataset)

    total_chunks = 0
    for idx, (source, text) in enumerate(docs):
        chunks = recursive_split(text, chunk_size=700, overlap=100)
        if not chunks:
            continue

        doc_key = f"{dataset.id}-{idx}"

        metadatas = [
            {
                "doc_id": doc_key,
                "source": source,
                "idx": i,
                "dataset_id": dataset.id,
            }
            for i in range(len(chunks))
        ]

        upsert_chunks(collection_name, doc_key, chunks, metadatas)
        total_chunks += len(chunks)

    return total_chunks


# ─────────────────────────────
# QA (RAG) with Gemini
# ─────────────────────────────
PROMPT = """You are a precise, grounded assistant.
Use ONLY the provided context to answer the question.
If the answer is not in the context, say "I don't have enough information."

Question:
{q}

Context:
{ctx}

Answer:
"""


def _run_gemini(prompt: str) -> str:
    """
    Internal helper to call Gemini safely and return response text.
    """
    model = _get_gemini()
    res = model.generate_content(prompt)

    txt = getattr(res, "text", None)
    if txt:
        return txt.strip()

    parts: List[str] = []
    for cand in getattr(res, "candidates", []) or []:
        for part in getattr(cand, "content", {}).get("parts", []):
            if isinstance(part, dict) and "text" in part:
                parts.append(part["text"])
    out = "\n".join(parts).strip()
    return out or "(no response)"


def ask(
    collection_name: str,
    question: str,
    extra_context: Optional[List[str]] = None,
) -> str:
    """
    Retrieve top-k chunks from Chroma and ask Gemini to answer
    using ONLY that context. Returns a string (never raises).
    """
    try:
        results: List[Tuple[str, dict]] = similarity_search(
            collection_name, question, k=6
        )
        ctx_blocks = [doc for (doc, _m) in results]
        if extra_context:
            ctx_blocks.extend(extra_context)

        ctx = "\n\n---\n\n".join(ctx_blocks[:10]) if ctx_blocks else "(no context)"

        prompt = PROMPT.format(q=question, ctx=ctx)
        return _run_gemini(prompt)
    except Exception as e:
        return f"(Gemini error) {e}"


def generate_answer(question: str, context: str) -> str:
    """
    Direct LLM helper used by /vision routes.
    Takes a question and a pre-built context string.
    """
    try:
        prompt = PROMPT.format(q=question, ctx=context or "(no context)")
        return _run_gemini(prompt)
    except Exception as e:
        return f"(Gemini error) {e}"


def answer_with_context(question: str, context: str) -> str:
    return generate_answer(question, context)


def gemini_answer(question: str, context: str) -> str:
    return generate_answer(question, context)


# ─────────────────────────────
# Optional: Vision → RAG combo
# ─────────────────────────────
def ask_with_image(collection_name: str, image_path: str, question: str) -> str:
    """
    1) Caption image with BLIP to get textual context
    2) Add caption to RAG search context
    3) Ask Gemini via the RAG pipeline
    """
    try:
        cap = caption_image(image_path)
        extra = [f"Image caption: {cap}"]
        return ask(collection_name, question, extra_context=extra)
    except Exception as e:
        return f"(Vision error) {e}"
