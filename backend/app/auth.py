"""Authentication helpers: password hashing, JWT access tokens, rotating refresh tokens, Google ID tokens."""
import hashlib
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session, select

from . import config
from .db import get_session
from .models import RefreshToken, User, now

_hasher = PasswordHasher()
_bearer = HTTPBearer(auto_error=False)

# Timing-equalisation: verify against a dummy hash when the email is unknown.
_DUMMY_HASH = _hasher.hash("not-a-real-password")


# ---------- passwords ----------
def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: Optional[str]) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerifyMismatchError, InvalidHashError):
        return False


# ---------- access tokens (JWT) ----------
def create_access_token(user_id: int) -> str:
    issued = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "type": "access",
        "iat": issued,
        "exp": issued + timedelta(minutes=config.ACCESS_TOKEN_MINUTES),
    }
    return jwt.encode(payload, config.JWT_SECRET, algorithm=config.JWT_ALGORITHM)


def decode_access_token(token: str) -> int:
    try:
        payload = jwt.decode(token, config.JWT_SECRET, algorithms=[config.JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Access token expired", {"WWW-Authenticate": "Bearer"})
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token", {"WWW-Authenticate": "Bearer"})
    if payload.get("type") != "access":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token type", {"WWW-Authenticate": "Bearer"})
    return int(payload["sub"])


# ---------- refresh tokens (opaque, hashed at rest, rotated) ----------
def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def issue_refresh_token(session: Session, user_id: int) -> str:
    token = secrets.token_urlsafe(48)
    session.add(RefreshToken(
        user_id=user_id,
        token_hash=_hash_token(token),
        expires_at=now() + timedelta(days=config.REFRESH_TOKEN_DAYS),
    ))
    session.commit()
    return token


def rotate_refresh_token(session: Session, token: str) -> tuple[User, str]:
    """Validate a refresh token, revoke it and issue a new one. Reuse of a revoked token revokes the whole family."""
    row = session.exec(select(RefreshToken).where(RefreshToken.token_hash == _hash_token(token))).first()
    if row is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
    if row.revoked:
        for t in session.exec(select(RefreshToken).where(RefreshToken.user_id == row.user_id)).all():
            t.revoked = True
            session.add(t)
        session.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token reuse detected; please sign in again")
    if row.expires_at < now():
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token expired")
    user = session.get(User, row.user_id)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User no longer exists")
    row.revoked = True
    session.add(row)
    session.commit()
    return user, issue_refresh_token(session, user.id)


def revoke_refresh_token(session: Session, token: str) -> None:
    row = session.exec(select(RefreshToken).where(RefreshToken.token_hash == _hash_token(token))).first()
    if row and not row.revoked:
        row.revoked = True
        session.add(row)
        session.commit()


# ---------- dependencies ----------
def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    session: Session = Depends(get_session),
) -> User:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated", {"WWW-Authenticate": "Bearer"})
    user = session.get(User, decode_access_token(creds.credentials))
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found", {"WWW-Authenticate": "Bearer"})
    return user


# ---------- Google OAuth ----------
def verify_google_id_token(id_token_str: str) -> dict:
    """Verify a Google ID token and return its claims. Raises HTTPException on failure."""
    if not config.GOOGLE_CLIENT_IDS:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Google sign-in is not configured on the server")
    from google.auth.transport import requests as g_requests
    from google.oauth2 import id_token as g_id_token

    try:
        claims = g_id_token.verify_oauth2_token(id_token_str, g_requests.Request(), audience=None)
    except Exception:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid Google token")
    if claims.get("aud") not in config.GOOGLE_CLIENT_IDS:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Google token was issued for a different app")
    if not claims.get("email") or not claims.get("email_verified", False):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Google account email is not verified")
    return claims


# ---------- login rate limit (in-memory, per client + email) ----------
class RateLimiter:
    def __init__(self, limit: int = 8, window: int = 60):
        self.limit, self.window = limit, window
        self.hits: dict[str, list[float]] = {}

    def check(self, key: str) -> None:
        t = time.monotonic()
        recent = [h for h in self.hits.get(key, []) if t - h < self.window]
        if len(recent) >= self.limit:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many attempts. Try again in a minute.")
        recent.append(t)
        self.hits[key] = recent

    def reset(self) -> None:
        self.hits.clear()


login_limiter = RateLimiter()
