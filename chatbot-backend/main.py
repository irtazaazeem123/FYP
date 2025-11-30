# main.py
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Load environment variables (e.g., GEMINI_API_KEY, GOOGLE_CLIENT_ID, SMTP_*)
load_dotenv(override=True)

# --- Routers ---
from auth import router as auth_router
from routes.ingest import router as ingest_router
from routes.chat import router as chat_router
from routes.voice import router as voice_router
from routes.vision import router as vision_router, ask_with_image
from routes.datasets import router as datasets_router
from routes.chats import router as chats_router
from routes.api_keys import router as api_keys_router
from routes.external import router as external_router

# --- DB (ensure tables exist on startup) ---
from database import Base, engine
from models import (
    User,
    Dataset,
    Chat,
    Message,
    ApiKey,  # ApiKey included so table is created
)

app = FastAPI(title="Chatbot Backend")

# ─────────────────────────────────────────────
# CORS (DEV: open to all origins so preflight never hangs)
# ─────────────────────────────────────────────
# You can later replace ["*"] with a list of allowed origins like:
# ["http://localhost:3000", "http://127.0.0.1:3000", "https://your-domain.com"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],       # <- relaxed for local dev / debugging
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Health/root
@app.get("/")
def read_root():
    return {"message": "Welcome to the Chatbot Backend API!"}


@app.get("/health")
def health():
    return {"ok": True}


# Quick check that the Gemini key is loaded
@app.get("/debug/gemini")
def debug_gemini():
    key = os.getenv("GEMINI_API_KEY", "")
    return {"has_key": bool(key), "prefix": key[:6], "length": len(key)}


# Include routes
app.include_router(auth_router, prefix="/auth")
app.include_router(ingest_router)
app.include_router(chat_router)
app.include_router(voice_router)
app.include_router(vision_router)
app.include_router(datasets_router)
app.include_router(chats_router)
app.include_router(api_keys_router)
app.include_router(external_router)

# Image-ask endpoint (uses routes.vision.ask_with_image)
app.add_api_route("/chat/ask-image", ask_with_image, methods=["POST"])


# Create missing tables and warn about missing Gemini key
@app.on_event("startup")
async def _startup():
    # Create any missing tables (won't touch existing ones)
    Base.metadata.create_all(bind=engine)

    # Helpful warning if key is missing
    if not os.getenv("GEMINI_API_KEY"):
        print(
            "[WARN] GEMINI_API_KEY is not set. "
            "Add it to a .env file in the backend root."
        )
