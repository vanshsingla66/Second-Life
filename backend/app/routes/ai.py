import re
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from .. import ai, config
from ..auth import RateLimiter, get_current_user
from ..db import get_session
from ..models import Listing, User

router = APIRouter(prefix="/ai", tags=["ai"])

# The Gemini key is ours, so keep each user to a sensible rate.
ai_limiter = RateLimiter(limit=15, window=60)
_UPLOAD = re.compile(r"^/uploads/([a-f0-9]{24}\.(jpg|png|webp))$")
_MIME = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}


@router.get("/status")
def status():
    return {"enabled": ai.enabled(), "model": config.GEMINI_MODEL if ai.enabled() else None}


class IdentifyIn(BaseModel):
    image_urls: list[str] = Field(min_length=1, max_length=3)


@router.post("/identify")
def identify(body: IdentifyIn, user: User = Depends(get_current_user)):
    ai_limiter.check(f"u{user.id}")
    images = []
    for url in body.image_urls:
        m = _UPLOAD.match(url)
        path = config.UPLOAD_DIR / m.group(1) if m else None
        if path is None or not path.is_file():
            raise HTTPException(422, "Upload the photo first, then ask the AI to identify it.")
        images.append((path.read_bytes(), _MIME[m.group(2)]))
    return ai.identify(images)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class ChatIn(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=30)


@router.post("/chat")
def chat(body: ChatIn, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    ai_limiter.check(f"u{user.id}")
    if body.messages[-1].role != "user":
        raise HTTPException(422, "The last message must be from the user")
    rows = session.exec(select(Listing).where(Listing.status == "active").order_by(Listing.id.desc()).limit(60)).all()
    stock = [{"id": l.id, "title": l.title, "category": l.category, "condition": l.condition, "price": l.price,
              "suggested_price": l.suggested_price} for l in rows]
    reply = ai.chat([m.model_dump() for m in body.messages[-16:]], user.name, stock)
    valid = {l["id"] for l in stock}
    cited = [int(i) for i in dict.fromkeys(re.findall(r"\[#(\d+)\]", reply)) if int(i) in valid]
    return {"reply": reply, "listing_ids": cited}
