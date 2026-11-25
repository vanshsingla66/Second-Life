"""Environment-driven settings. No secrets are hardcoded."""
import os
import secrets
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

def normalize_database_url(url: str) -> str:
    """Accept the URL exactly as Supabase shows it (postgresql:// or postgres://) and select the psycopg 3 driver."""
    url = url.strip()
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


DATABASE_URL = normalize_database_url(os.getenv("DATABASE_URL") or f"sqlite:///{BASE_DIR / 'green.db'}")
DATA_DIR = Path(os.getenv("DATA_DIR", BASE_DIR.parent / "data"))
UPLOAD_DIR = BASE_DIR / "uploads"

ACCESS_TOKEN_MINUTES = 15
REFRESH_TOKEN_DAYS = 7
JWT_ALGORITHM = "HS256"

GOOGLE_CLIENT_IDS = [
    v for v in (
        os.getenv("GOOGLE_WEB_CLIENT_ID", ""),
        os.getenv("GOOGLE_ANDROID_CLIENT_ID", ""),
        os.getenv("GOOGLE_IOS_CLIENT_ID", ""),
    ) if v
]


# Gemini (photo recognition + assistant). Server-side only: the key never goes into the app.
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "").strip() or "gemini-flash-latest"


def _jwt_secret() -> str:
    env = os.getenv("JWT_SECRET", "")
    if env and not env.startswith("change-me"):
        return env
    # Dev fallback: a random secret persisted locally so tokens survive restarts.
    path = BASE_DIR / ".dev_jwt_secret"
    if not path.exists():
        path.write_text(secrets.token_urlsafe(48))
    return path.read_text().strip()


JWT_SECRET = _jwt_secret()
