from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlmodel import Session, select

from .. import pricing
from ..auth import get_current_user
from ..db import get_session
from ..models import Conversation, Listing, Message, Swap, User
from ..schemas import ListingDetail, ListingIn, ListingOut, ListingPage, ListingUpdate, PriceOut
from ..services import listing_out, listings_out, set_photos

router = APIRouter(prefix="/listings", tags=["listings"])


def _suggest_for(l: Listing | ListingIn) -> dict:
    return pricing.suggest(l.category, l.condition, l.age_years, l.original_price)


@router.get("", response_model=ListingPage)
def search_listings(
    q: Optional[str] = None,
    category: Optional[str] = None,
    condition: Optional[str] = Query(None, description="comma-separated list, e.g. good,like_new"),
    min_price: Optional[int] = Query(None, ge=0),
    max_price: Optional[int] = Query(None, ge=0),
    status: Literal["active", "sold", "swapped", "any"] = "active",
    seller_id: Optional[int] = None,
    sort: Literal["newest", "price_asc", "price_desc", "best_deal"] = "newest",
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    session: Session = Depends(get_session),
):
    conds = []
    if status != "any":
        conds.append(Listing.status == status)
    if q:
        like = f"%{q.strip().lower()}%"
        conds.append(or_(func.lower(Listing.title).like(like), func.lower(Listing.description).like(like),
                         func.lower(Listing.category).like(like)))
    if category:
        conds.append(Listing.category == category)
    if condition:
        conds.append(Listing.condition.in_([c.strip() for c in condition.split(",") if c.strip()]))
    if min_price is not None:
        conds.append(Listing.price >= min_price)
    if max_price is not None:
        conds.append(Listing.price <= max_price)
    if seller_id is not None:
        conds.append(Listing.seller_id == seller_id)

    total = session.exec(select(func.count()).select_from(Listing).where(*conds)).one()
    order = {
        "newest": Listing.id.desc(),
        "price_asc": Listing.price.asc(),
        "price_desc": Listing.price.desc(),
        "best_deal": (Listing.price * 1.0 / Listing.suggested_price).asc(),
    }[sort]
    rows = session.exec(select(Listing).where(*conds).order_by(order).offset((page - 1) * page_size).limit(page_size)).all()
    return ListingPage(items=listings_out(session, rows), total=int(total), page=page, page_size=page_size)


@router.get("/mine", response_model=list[ListingOut])
def my_listings(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    rows = session.exec(select(Listing).where(Listing.seller_id == user.id).order_by(Listing.id.desc())).all()
    return listings_out(session, rows)


@router.post("", response_model=ListingOut, status_code=201)
def create_listing(body: ListingIn, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    s = _suggest_for(body)
    l = Listing(
        seller_id=user.id, title=body.title.strip(), category=body.category, condition=body.condition,
        age_years=body.age_years, original_price=body.original_price,
        price=body.price or s["suggested_price"], suggested_price=s["suggested_price"],
        suggested_low=s["low"], suggested_high=s["high"], description=body.description,
    )
    set_photos(l, body.image_urls if body.image_urls is not None else ([body.image_url] if body.image_url else []))
    session.add(l)
    session.commit()
    session.refresh(l)
    return listing_out(session, l)


@router.get("/{listing_id}", response_model=ListingDetail)
def get_listing(listing_id: int, session: Session = Depends(get_session)):
    l = session.get(Listing, listing_id)
    if l is None:
        raise HTTPException(404, "Listing not found")
    base = listing_out(session, l)
    pricing_out = PriceOut(**{k: v for k, v in _suggest_for(l).items() if k in PriceOut.model_fields})
    return ListingDetail(**base.model_dump(), pricing=pricing_out)


def _owned(session: Session, listing_id: int, user: User) -> Listing:
    l = session.get(Listing, listing_id)
    if l is None:
        raise HTTPException(404, "Listing not found")
    if l.seller_id != user.id:
        raise HTTPException(403, "You can only change your own listings")
    return l


@router.put("/{listing_id}", response_model=ListingOut)
def update_listing(listing_id: int, body: ListingUpdate, user: User = Depends(get_current_user),
                   session: Session = Depends(get_session)):
    l = _owned(session, listing_id, user)
    if l.status != "active":
        raise HTTPException(409, "Only active listings can be edited")
    changes = body.model_dump(exclude_unset=True)
    photos = changes.pop("image_urls", None)
    if "image_url" in changes and photos is None:
        url = changes.pop("image_url")
        photos = [url] if url else []
    changes.pop("image_url", None)
    for k, v in changes.items():
        if v is not None:
            setattr(l, k, v.strip() if isinstance(v, str) and k == "title" else v)
    if photos is not None:
        set_photos(l, photos)
    if {"condition", "age_years", "original_price"} & body.model_fields_set:
        s = _suggest_for(l)
        l.suggested_price, l.suggested_low, l.suggested_high = s["suggested_price"], s["low"], s["high"]
    session.add(l)
    session.commit()
    session.refresh(l)
    return listing_out(session, l)


@router.delete("/{listing_id}", status_code=204)
def delete_listing(listing_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    l = _owned(session, listing_id, user)
    for sw in session.exec(select(Swap).where(or_(Swap.offered_listing_id == l.id, Swap.requested_listing_id == l.id))).all():
        session.delete(sw)
    for c in session.exec(select(Conversation).where(Conversation.listing_id == l.id)).all():
        for m in session.exec(select(Message).where(Message.conversation_id == c.id)).all():
            session.delete(m)
        session.delete(c)
    session.flush()
    session.delete(l)
    session.commit()


@router.post("/{listing_id}/sold", response_model=ListingOut)
def mark_sold(listing_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    l = _owned(session, listing_id, user)
    if l.status != "active":
        raise HTTPException(409, "Listing is not active")
    l.status = "sold"
    session.add(l)
    session.commit()
    session.refresh(l)
    return listing_out(session, l)
