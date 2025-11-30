# auth.py
import os
import random
import smtplib
import ssl
from datetime import datetime, timedelta, date

from email.message import EmailMessage

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from database import get_db
from models import User, Dataset, Chat, Message, ApiKey   # <- NOTE: added imports
from security import hash_password, verify_password

# Google ID token verification
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

router = APIRouter(tags=["auth"])

# ============================================================
# Pydantic Schemas
# ============================================================

class SignupPayload(BaseModel):
  email: EmailStr
  first_name: str
  last_name: str
  password: str
  date_of_birth: date


class VerifyCodePayload(BaseModel):
  email: EmailStr
  code: str   # keep as string; 4 digits


class ResendCodePayload(BaseModel):
  email: EmailStr


class LoginPayload(BaseModel):
  email: EmailStr
  password: str


class CheckEmailPayload(BaseModel):
  email: EmailStr


class ForgotPasswordPayload(BaseModel):
  email: EmailStr


class ResetPasswordPayload(BaseModel):
  email: EmailStr
  new_password: str


class GoogleLoginPayload(BaseModel):
  token: str


# NEW: verify reset-code payload (for forgot-password flow)
class VerifyResetCodePayload(BaseModel):
  email: EmailStr
  code: str   # 4-digit reset code


# NEW: delete-account payload (frontend sends just the email from localStorage)
class DeleteAccountPayload(BaseModel):
  email: EmailStr


# ============================================================
# Helper: send verification email
# ============================================================

def send_verification_email(to_email: str, code: str) -> bool:
  """
  Send a 4-digit verification code to the user via Gmail SMTP.

  Uses env:
    SMTP_HOST
    SMTP_PORT
    SMTP_USER
    SMTP_PASSWORD
    SMTP_FROM_EMAIL
    SMTP_FROM_NAME
  """
  smtp_host = os.getenv("SMTP_HOST")
  smtp_port = int(os.getenv("SMTP_PORT", "587"))
  smtp_user = os.getenv("SMTP_USER")
  smtp_password = os.getenv("SMTP_PASSWORD")
  from_email = os.getenv("SMTP_FROM_EMAIL") or smtp_user
  from_name = os.getenv("SMTP_FROM_NAME", "Automated Domain Expert Chatbot")

  if not all([smtp_host, smtp_port, smtp_user, smtp_password, from_email]):
    print("[WARN] SMTP not fully configured; cannot send email.")
    return False

  msg = EmailMessage()
  msg["Subject"] = "Your verification code – Automated Domain Expert Chatbot"
  msg["From"] = f"{from_name} <{from_email}>"
  msg["To"] = to_email

  body = (
    f"Hi,\n\n"
    f"Your verification code for Automated Domain Expert Chatbot is: {code}\n\n"
    f"This code will expire in 10 minutes.\n\n"
    f"If you did not request this, you can ignore this email.\n\n"
    f"— {from_name}"
  )
  msg.set_content(body)

  try:
    # Port 465 → SSL; Port 587 → STARTTLS
    if smtp_port == 465:
      context = ssl.create_default_context()
      with smtplib.SMTP_SSL(smtp_host, smtp_port, context=context) as server:
        server.login(smtp_user, smtp_password)
        server.send_message(msg)
    else:
      context = ssl.create_default_context()
      with smtplib.SMTP(smtp_host, smtp_port) as server:
        server.starttls(context=context)
        server.login(smtp_user, smtp_password)
        server.send_message(msg)

    print(f"[INFO] Verification email sent to {to_email}")
    return True

  except Exception as e:
    print("[ERROR] Failed to send verification email:", repr(e))
    return False


# Helper to generate 4-digit code
def generate_code() -> str:
  return f"{random.randint(0, 9999):04d}"


# ============================================================
# Signup: create user + send verification code
# ============================================================

@router.post("/signup")
def signup(payload: SignupPayload, db: Session = Depends(get_db)):
  # Check if email already exists
  existing = db.query(User).filter(User.email == payload.email).first()
  if existing:
    # If exists but not verified, tell front-end it is pending
    if not existing.is_verified:
      raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Email is already registered but not verified. Please check your inbox or resend the code."
      )
    # Already verified normal account
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail="Email is already registered. Please log in instead."
    )

  # Create new user in "unverified" state
  code = generate_code()
  now = datetime.utcnow()
  expiry = now + timedelta(minutes=10)

  user = User(
    email=payload.email,
    first_name=payload.first_name,
    last_name=payload.last_name,
    hashed_password=hash_password(payload.password),
    date_of_birth=payload.date_of_birth,
    is_verified=False,
    verification_code=code,
    verification_expires_at=expiry,
    last_verification_sent_at=now,
    auth_provider="email"
  )

  db.add(user)
  db.commit()
  db.refresh(user)

  # Send email
  if not send_verification_email(user.email, code):
    # If sending fails, we still keep the user but tell frontend
    raise HTTPException(
      status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail="Could not send verification email. Please try again later."
    )

  return {"message": "Signup successful. Verification code sent.", "email": user.email}


# ============================================================
# Verify code
# ============================================================

@router.post("/verify-code")
def verify_code(payload: VerifyCodePayload, db: Session = Depends(get_db)):
  user = db.query(User).filter(User.email == payload.email).first()

  if not user:
    # This is the real "Not Found" case
    raise HTTPException(
      status_code=status.HTTP_404_NOT_FOUND,
      detail="User not found. Please sign up again."
    )

  if user.is_verified:
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail="Account is already verified. You can log in."
    )

  if not user.verification_code or not user.verification_expires_at:
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail="No verification code exists. Please sign up again."
    )

  now = datetime.utcnow()
  if user.verification_expires_at < now:
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail="Verification code has expired. Please resend a new code."
    )

  # Here we strictly compare the code
  if user.verification_code != payload.code:
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail="Incorrect verification code."
    )

  # Successful verification
  user.is_verified = True
  user.verification_code = None
  user.verification_expires_at = None
  db.commit()

  return {"message": "Email verified successfully."}


# Alias used by your frontend (SignupPage.jsx)
@router.post("/verify-email")
def verify_email(payload: VerifyCodePayload, db: Session = Depends(get_db)):
  return verify_code(payload, db)


# ============================================================
# Resend code (limit: once every 60 seconds)
# ============================================================

@router.post("/resend-code")
def resend_code(payload: ResendCodePayload, db: Session = Depends(get_db)):
  user = db.query(User).filter(User.email == payload.email).first()

  if not user:
    raise HTTPException(
      status_code=status.HTTP_404_NOT_FOUND,
      detail="User not found. Please sign up again."
    )

  if user.is_verified:
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail="Account already verified. You can log in."
    )

  now = datetime.utcnow()
  if user.last_verification_sent_at and (now - user.last_verification_sent_at) < timedelta(seconds=60):
    # Too soon
    raise HTTPException(
      status_code=status.HTTP_429_TOO_MANY_REQUESTS,
      detail="Please wait a minute before requesting a new code."
    )

  # New code & expiry
  code = generate_code()
  user.verification_code = code
  user.verification_expires_at = now + timedelta(minutes=10)
  user.last_verification_sent_at = now
  db.commit()

  if not send_verification_email(user.email, code):
    raise HTTPException(
      status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail="Could not resend verification email. Please try again later."
    )

  return {"message": "New verification code sent."}


# ============================================================
# Check-email for login flow
# ============================================================

@router.post("/check-email")
def check_email(payload: CheckEmailPayload, db: Session = Depends(get_db)):
  user = db.query(User).filter(User.email == payload.email).first()
  return {"exists": bool(user)}


# ============================================================
# Login (email + password)
# ============================================================

@router.post("/login")
def login(payload: LoginPayload, db: Session = Depends(get_db)):
  user = db.query(User).filter(User.email == payload.email).first()

  if not user or not user.hashed_password:
    raise HTTPException(
      status_code=status.HTTP_401_UNAUTHORIZED,
      detail="Invalid email or password."
    )

  if not user.is_verified:
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail="Please verify your email before logging in."
    )

  if not verify_password(payload.password, user.hashed_password):
    raise HTTPException(
      status_code=status.HTTP_401_UNAUTHORIZED,
      detail="Invalid email or password."
    )

  return {
    "message": "Login successful.",
    "email": user.email,
    "first_name": user.first_name,
  }


# ============================================================
# Delete account (user + datasets + chats + messages + api keys)
# ============================================================

@router.delete("/delete-account")
def delete_account(payload: DeleteAccountPayload, db: Session = Depends(get_db)):
  """
  Permanently delete:
    - User row
    - All datasets belonging to this email
    - All chats/messages (via cascade from Dataset -> Chat -> Message)
    - All API keys for this user
  """
  user = db.query(User).filter(User.email == payload.email).first()
  if not user:
    raise HTTPException(
      status_code=status.HTTP_404_NOT_FOUND,
      detail="User not found."
    )

  # Delete API keys belonging to this user
  db.query(ApiKey).filter(ApiKey.user_email == payload.email).delete()

  # Delete datasets for this user (Chat + Message go via cascades)
  db.query(Dataset).filter(Dataset.user_email == payload.email).delete(synchronize_session=False)

  # Finally delete the user itself
  db.delete(user)
  db.commit()

  return {"message": "Account and all associated data have been permanently deleted."}


# ============================================================
# Forgot / Reset password (with email code)
# ============================================================

@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordPayload, db: Session = Depends(get_db)):
  """
  Step 1:
  - Check if email exists & verified
  - Generate a 4-digit reset code
  - Store it in verification_code + verification_expires_at
  - Email the code to the user
  """
  user = db.query(User).filter(User.email == payload.email).first()
  if not user:
    raise HTTPException(
      status_code=status.HTTP_404_NOT_FOUND,
      detail="Email not found."
    )

  if not user.is_verified:
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail="Please verify your email before resetting password."
    )

  code = generate_code()
  now = datetime.utcnow()
  user.verification_code = code
  user.verification_expires_at = now + timedelta(minutes=10)
  user.last_verification_sent_at = now
  db.commit()

  if not send_verification_email(user.email, code):
    raise HTTPException(
      status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail="Could not send reset code email. Please try again later."
    )

  return {"message": "Reset code sent to your email."}


@router.post("/verify-reset-code")
def verify_reset_code(payload: VerifyResetCodePayload, db: Session = Depends(get_db)):
  """
  Step 2:
  - Check that the reset code for this email exists, is not expired,
    and matches.
  - If ok, clear the code so it can't be reused.
  """
  user = db.query(User).filter(User.email == payload.email).first()
  if not user:
    raise HTTPException(
      status_code=status.HTTP_404_NOT_FOUND,
      detail="User not found."
    )

  if not user.verification_code or not user.verification_expires_at:
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail="No reset code exists. Please request a new one."
    )

  now = datetime.utcnow()
  if user.verification_expires_at < now:
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail="Reset code has expired. Please request a new one."
    )

  if user.verification_code != payload.code:
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail="Incorrect reset code."
    )

  # optional: clear code here so it can't be reused
  user.verification_code = None
  user.verification_expires_at = None
  db.commit()

  return {"message": "Code verified."}


@router.post("/reset-password")
def reset_password(payload: ResetPasswordPayload, db: Session = Depends(get_db)):
  """
  Step 3:
  - After /verify-reset-code succeeded on frontend,
    actually change the password.
  """
  user = db.query(User).filter(User.email == payload.email).first()
  if not user:
    raise HTTPException(
      status_code=status.HTTP_404_NOT_FOUND,
      detail="User not found."
    )

  if not user.is_verified:
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail="Please verify your email first."
    )

  user.hashed_password = hash_password(payload.new_password)
  db.commit()

  return {"message": "Password updated successfully."}


# ============================================================
# Google Login
# ============================================================

@router.post("/google-login")
def google_login(payload: GoogleLoginPayload, db: Session = Depends(get_db)):
  client_id = os.getenv("GOOGLE_CLIENT_ID")
  if not client_id:
    raise HTTPException(
      status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail="Google login is not configured."
    )

  try:
    idinfo = id_token.verify_oauth2_token(
      payload.token,
      google_requests.Request(),
      client_id
    )
  except Exception:
    raise HTTPException(
      status_code=status.HTTP_401_UNAUTHORIZED,
      detail="Invalid Google token."
    )

  email = idinfo.get("email")
  given_name = idinfo.get("given_name") or ""
  family_name = idinfo.get("family_name") or ""

  if not email:
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail="Google account does not have a valid email."
    )

  user = db.query(User).filter(User.email == email).first()

  if not user:
    # Create Google-only account
    user = User(
      email=email,
      first_name=given_name,
      last_name=family_name,
      hashed_password=None,
      date_of_birth=None,
      is_verified=True,
      verification_code=None,
      verification_expires_at=None,
      last_verification_sent_at=None,
      auth_provider="google",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
  else:
    # Make sure account is marked verified
    if not user.is_verified:
      user.is_verified = True
      db.commit()

  return {
    "message": "Google login successful.",
    "email": user.email,
    "first_name": user.first_name,
  }
