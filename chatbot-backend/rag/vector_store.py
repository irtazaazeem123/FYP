# rag/vector_store.py
import chromadb
from chromadb.config import Settings
from chromadb.utils import embedding_functions

# Small, fast CPU embedder (no ONNX)
st_embedder = embedding_functions.SentenceTransformerEmbeddingFunction(
    model_name="sentence-transformers/all-MiniLM-L6-v2",
    normalize_embeddings=True,
)

client = chromadb.PersistentClient(
    path="vector_store",
    settings=Settings(anonymized_telemetry=False)
)

def get_collection(name: str):
    # Attach our embedder so Chroma never tries the ONNX one
    return client.get_or_create_collection(
        name=name,
        metadata={"hnsw:space": "cosine"},
        embedding_function=st_embedder,
    )

def upsert_chunks(collection_name: str, doc_id: str, chunks, metadatas=None):
    col = get_collection(collection_name)
    ids = [f"{doc_id}::{i}" for i in range(len(chunks))]
    col.upsert(documents=chunks, ids=ids, metadatas=metadatas or [{} for _ in chunks])

def similarity_search(collection_name: str, query: str, k: int = 6):
    col = get_collection(collection_name)
    out = col.query(query_texts=[query], n_results=k)
    docs = out.get("documents", [[]])[0]
    metas = out.get("metadatas", [[]])[0]
    return list(zip(docs, metas))
