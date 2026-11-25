"""Shared business logic: trust badges, green counter, listing serialisation."""
import json
from typing import Optional

from sqlalchemy import func, or_
from sqlmodel import Session, select

from . import pricing
from .models import Listing, Swap, User
from .schemas import GreenOut, ListingOut, SellerOut, TrustOut, UserOut

# Rough per-item estimates (kg of waste kept out of the bin, kg CO2 avoided vs buying new).
GREEN_FACTORS = {
    "textbooks": (0.8, 2.5), "calculators": (0.15, 6.0), "cycles": (14.0, 96.0),
    "lab_coats": (0.4, 4.0), "hostel_essentials": (2.0, 12.0), "electronics": (0.5, 15.0),
}
DEFAULT_GREEN = (1.0, 5.0)

BADGES = [("bronze", 0), ("silver", 10), ("gold", 25)]


def user_out(u: User) -> UserOut:
    return UserOut(id=u.id, name=u.name, email=u.email)


def _trust(user: User, sold: int, swaps: int) -> TrustOut:
    score = int(sold) + 2 * int(swaps) + round(user.response_rate * 10)
    badge = "bronze"
    for name, threshold in BADGES:
        if score >= threshold:
            badge = name
    nxt = next(((n, t) for n, t in BADGES if t > score), None)
    return TrustOut(
        badge=badge, score=score, items_sold=int(sold), swaps_done=int(swaps),
        response_rate=round(user.response_rate, 2),
        next_badge=nxt[0] if nxt else None, points_to_next=(nxt[1] - score) if nxt else 0,
    )


def load_sellers(session: Session, ids: set[int]) -> dict[int, SellerOut]:
    """Seller + trust badge for many users in 3 queries (the database may be a network hop away)."""
    if not ids:
        return {}
    users = session.exec(select(User).where(User.id.in_(ids))).all()
    sold = dict(session.exec(select(Listing.seller_id, func.count()).where(
        Listing.status == "sold", Listing.seller_id.in_(ids)).group_by(Listing.seller_id)).all())
    swaps: dict[int, int] = {}
    for proposer_id, owner_id in session.exec(select(Swap.proposer_id, Swap.owner_id).where(
            Swap.status == "accepted", or_(Swap.proposer_id.in_(ids), Swap.owner_id.in_(ids)))).all():
        for uid in (proposer_id, owner_id):
            swaps[uid] = swaps.get(uid, 0) + 1
    return {u.id: SellerOut(id=u.id, name=u.name, trust=_trust(u, sold.get(u.id, 0), swaps.get(u.id, 0))) for u in users}


def trust_for(session: Session, user: User) -> TrustOut:
    return load_sellers(session, {user.id})[user.id].trust


def green_for(session: Session, user: User) -> GreenOut:
    waste = co2 = 0.0
    rows = session.exec(select(Listing).where(Listing.seller_id == user.id, Listing.status.in_(["sold", "swapped"]))).all()
    for l in rows:
        w, c = GREEN_FACTORS.get(l.category, DEFAULT_GREEN)
        waste += w
        co2 += c
    return GreenOut(waste_kg=round(waste, 1), co2_kg=round(co2, 1))


def photos_of(l: Listing) -> list[str]:
    try:
        urls = [u for u in json.loads(l.images or "[]") if isinstance(u, str)]
    except ValueError:
        urls = []
    return urls or ([l.image_url] if l.image_url else [])


def set_photos(l: Listing, urls: list[str]) -> None:
    l.images = json.dumps(urls)
    l.image_url = urls[0] if urls else None


def listing_out(session: Session, l: Listing, cache: Optional[dict[int, SellerOut]] = None) -> ListingOut:
    cache = cache if cache is not None else {}
    if l.seller_id not in cache:
        cache.update(load_sellers(session, {l.seller_id}))
    return ListingOut(
        id=l.id, title=l.title, category=l.category, condition=l.condition, age_years=l.age_years,
        original_price=l.original_price, price=l.price, suggested_price=l.suggested_price,
        suggested_low=l.suggested_low, suggested_high=l.suggested_high,
        fair_label=pricing.fair_label(l.price, l.suggested_price), description=l.description,
        image_url=l.image_url, image_urls=photos_of(l), status=l.status, created_at=l.created_at, seller=cache[l.seller_id],
    )


def listings_out(session: Session, listings: list[Listing]) -> list[ListingOut]:
    """Serialise many listings with one batched seller lookup instead of one per listing."""
    cache = load_sellers(session, {l.seller_id for l in listings})
    return [listing_out(session, l, cache) for l in listings]


def matches_for_wanted(session: Session, title: str, category: Optional[str], max_price: int, exclude_user: int,
                       active: Optional[list[Listing]] = None):
    """Active listings that fit a wanted request: same category (or keyword hit) and within budget."""
    if active is None:
        active = session.exec(select(Listing).where(Listing.status == "active")).all()
    words = [w for w in title.lower().split() if len(w) > 2]
    out = []
    for l in active:
        if l.price > max_price or l.seller_id == exclude_user:
            continue
        cat_ok = category is not None and l.category == category
        text = f"{l.title} {l.description}".lower()
        kw_ok = any(w in text for w in words)
        if cat_ok or kw_ok:
            out.append(l)
    return sorted(out, key=lambda l: l.price)
