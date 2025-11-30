from datetime import date
from pydantic import BaseModel, EmailStr, HttpUrl, conint

MaxPages = conint(ge=1, le=100)  # helper type

class UserCreate(BaseModel):
    email: EmailStr
    first_name: str
    last_name: str
    password: str
    date_of_birth: date


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class ScrapeCreateRequest(BaseModel):
    user_email: EmailStr
    url: HttpUrl
    max_pages: MaxPages = 10   # default 10, but 1–100 only


class ScrapeAddRequest(BaseModel):
    user_email: EmailStr
    dataset_id: str
    url: HttpUrl
    max_pages: MaxPages = 10   # same here
