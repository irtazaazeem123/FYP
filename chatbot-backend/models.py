# models.py
from datetime import datetime

from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    Date,
    DateTime,
    Text,
    ForeignKey,
    func,
)
from sqlalchemy.orm import relationship

from database import Base   # keep this as in your original project


# ─────────────────────────────────────────────
# User model with email verification + provider
# ─────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    first_name = Column(String(100), nullable=True)
    last_name = Column(String(100), nullable=True)

    hashed_password = Column(String(255), nullable=True)
    date_of_birth = Column(Date, nullable=True)

    is_verified = Column(Boolean, default=False, nullable=False)
    verification_code = Column(String(10), nullable=True)
    verification_expires_at = Column(DateTime, nullable=True)
    last_verification_sent_at = Column(DateTime, nullable=True)

    auth_provider = Column(String(20), default="email", nullable=False)

# ─────────────────────────────────────────────
# Dataset / Chat / Message models (unchanged)
# ─────────────────────────────────────────────
class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(String(16), primary_key=True)  # short hex id
    user_email = Column(String(255), index=True, nullable=False)
    name = Column(String(255), nullable=False)       # original file name
    collection = Column(String(64), nullable=False)  # e.g., ds_<id>
    created_at = Column(DateTime, server_default=func.now())

    chats = relationship(
        "Chat",
        back_populates="dataset",
        cascade="all, delete-orphan",
    )


class Chat(Base):
    __tablename__ = "chats"

    id = Column(String(16), primary_key=True)  # short hex id
    user_email = Column(String(255), index=True, nullable=False)
    dataset_id = Column(
        String(16),
        ForeignKey("datasets.id"),
        nullable=False,
        index=True,
    )
    title = Column(String(255), nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    dataset = relationship("Dataset", back_populates="chats")
    messages = relationship(
        "Message",
        back_populates="chat",
        cascade="all, delete-orphan",
    )


class Message(Base):
    __tablename__ = "messages"

    id = Column(String(20), primary_key=True)  # short id
    chat_id = Column(
        String(16),
        ForeignKey("chats.id"),
        index=True,
        nullable=False,
    )
    role = Column(String(16), nullable=False)  # "user" | "assistant"
    text = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    chat = relationship("Chat", back_populates="messages")


# ─────────────────────────────────────────────
# ApiKey model (per-dataset/per-chat API tokens; hashed)
# ─────────────────────────────────────────────
class ApiKey(Base):
    __tablename__ = "api_keys"

    id = Column(Integer, primary_key=True)
    user_email = Column(String(255), index=True, nullable=False)
    dataset_id = Column(String(16), ForeignKey("datasets.id"), nullable=False)
    chat_id = Column(String(16), ForeignKey("chats.id"), nullable=True)

    # We store only a hash of the key; never the plaintext
    key_hash = Column(String(64), nullable=False)   # sha256 hex
    prefix = Column(String(8), nullable=False)      # first few chars for display

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    last_used = Column(DateTime, nullable=True)
