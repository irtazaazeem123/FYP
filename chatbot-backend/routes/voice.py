# routes/voice.py
import os
import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException
from faster_whisper import WhisperModel

router = APIRouter(prefix="/voice", tags=["voice"])

# load small/base model for CPU
_whisper = WhisperModel("base", device="cpu", compute_type="int8")

AUDIO_DIR = "storage/audio"
os.makedirs(AUDIO_DIR, exist_ok=True)

@router.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    # Save temp
    ext = os.path.splitext(file.filename)[-1].lower()
    audio_id = f"{uuid.uuid4().hex}{ext if ext else '.wav'}"
    path = os.path.join(AUDIO_DIR, audio_id)
    with open(path, "wb") as f:
        f.write(await file.read())

    try:
        segments, info = _whisper.transcribe(path, beam_size=1)
        text = " ".join(seg.text for seg in segments).strip()
        return {"text": text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
