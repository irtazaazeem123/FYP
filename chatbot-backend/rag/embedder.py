# rag/embedder.py
from sentence_transformers import SentenceTransformer
import threading

_model_lock = threading.Lock()
_model = None

def get_embedder():
    global _model
    with _model_lock:
        if _model is None:
            # Small, fast CPU model
            _model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
        return _model

def embed_texts(texts):
    model = get_embedder()
    return model.encode(texts, convert_to_numpy=True).tolist()
