import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
<<<<<<< HEAD
=======
from urllib.parse import urlparse, parse_qs
>>>>>>> 2d6fbf2f26c40f214140ad6009db07046db5635d

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
<<<<<<< HEAD

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set in .env file")

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

=======
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set in .env file")

# Parse URL to decide SSL behavior
parsed = urlparse(DATABASE_URL)
host = parsed.hostname or ""
query = parse_qs(parsed.query or "")

connect_args = {}
# If URL already contains sslmode, don't override
if "sslmode" not in query:
    # If connecting to localhost, skip ssl
    if host not in ("localhost", "127.0.0.1"):
        # For Postgres remote providers, require ssl
        if parsed.scheme.startswith("postgres"):
            connect_args["sslmode"] = "require"

engine = create_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    pool_timeout=30,
    connect_args=connect_args,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
# backend/database.py
# (ilagay ito sa dulo ng file, pagkatapos ng SessionLocal at Base)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
>>>>>>> 2d6fbf2f26c40f214140ad6009db07046db5635d
Base = declarative_base()