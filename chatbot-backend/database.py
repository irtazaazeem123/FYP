from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

import os
import urllib.parse
from dotenv import load_dotenv

# Load .env so DB_* variables are available
load_dotenv(override=True)

# Read DB config from environment
DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_PORT = os.getenv("DB_PORT", "3306")
DB_USER = os.getenv("DB_USER", "chatbotuser")
DB_PASSWORD_RAW = os.getenv("DB_PASSWORD", "StrongPassword123!")
DB_NAME = os.getenv("DB_NAME", "chatbotdb")

# URL-encode password so special characters like "!" don't break the URL
DB_PASSWORD = urllib.parse.quote_plus(DB_PASSWORD_RAW)

# MySQL connection URL using PyMySQL driver
DATABASE_URL = (
    f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)

# Create engine & session factory
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,  # helps avoid stale connections
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


# Dependency for getting DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
