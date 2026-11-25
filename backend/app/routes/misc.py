import secrets

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlmodel import Session

from .. import config, pricing
from ..auth import get_current_user
from ..db import get_session
from ..models import User, Listing
from ..schemas import PriceIn, PriceOut, SellerOut, StatsOut, TrustOut
from ..services import green_for, trust_for, user_out

router = APIRouter(tags=["misc"])


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/meta")
def meta():
    return {
        "categories": [{"id": c, "label": pricing.CATEGORY_LABEL.get(c, c)} for c in pricing.categories()],
        "conditions": [{"id": c, "label": pricing.CONDITION_LABEL[c]} for c in pricing.conditions()],
        "google_enabled": bool(config.GOOGLE_CLIENT_IDS),
        "google_web_client_id": config.GOOGLE_CLIENT_IDS[0] if config.GOOGLE_CLIENT_IDS else None,
    }


@router.post("/price/suggest", response_model=PriceOut)
def price_suggest(body: PriceIn):
    result = pricing.suggest(body.category, body.condition, body.age_years, body.original_price)
    return {k: v for k, v in result.items() if k in PriceOut.model_fields}


@router.get("/insights")
def insights():
    return pricing.insights()


@router.get("/sellers/{seller_id}/trust", response_model=TrustOut)
def seller_trust(seller_id: int, session: Session = Depends(get_session)):
    seller = session.get(User, seller_id)
    if seller is None:
        raise HTTPException(404, "Seller not found")
    return trust_for(session, seller)


@router.get("/me/stats", response_model=StatsOut)
def my_stats(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    return StatsOut(user=user_out(user), trust=trust_for(session, user), green=green_for(session, user))


_MAGIC = {b"\xff\xd8\xff": "jpg", b"\x89PNG\r\n\x1a\n": "png", b"RIFF": "webp"}
MAX_UPLOAD = 5 * 1024 * 1024


@router.post("/uploads", status_code=201)
async def upload_image(file: UploadFile, user: User = Depends(get_current_user)):
    data = await file.read(MAX_UPLOAD + 1)
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "Image is larger than 5 MB")
    ext = next((e for m, e in _MAGIC.items() if data.startswith(m)), None)
    if ext is None or (ext == "webp" and data[8:12] != b"WEBP"):
        raise HTTPException(415, "Only JPEG, PNG or WebP images are allowed")
    config.UPLOAD_DIR.mkdir(exist_ok=True)
    name = f"{secrets.token_hex(12)}.{ext}"
    (config.UPLOAD_DIR / name).write_bytes(data)
    return {"url": f"/uploads/{name}"}
