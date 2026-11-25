from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlmodel import Session, select

from ..auth import get_current_user
from ..db import get_session
from ..models import Listing, Swap, User
from ..schemas import SwapIn, SwapOut, SwapQuote
from ..services import listing_out, load_sellers, user_out

router = APIRouter(prefix="/swaps", tags=["swaps"])


def _round10(x: float) -> int:
    return int(round(x / 10) * 10)


def _quote(offered: Listing, requested: Listing) -> tuple[int, int, int]:
    """Fair values are the model's suggested prices, so both sides are priced the same way."""
    ov, rv = offered.suggested_price, requested.suggested_price
    return ov, rv, _round10(rv - ov)


def _summary(offered: Listing, requested: Listing, topup: int, viewer: str) -> str:
    ov, rv = offered.suggested_price, requested.suggested_price
    if viewer == "outgoing":
        head = f"Your {offered.title} (~₹{ov:,}) for their {requested.title} (~₹{rv:,})"
        tail = ("an even swap" if topup == 0 else
                f"swap + you add ₹{topup:,}" if topup > 0 else f"swap + they add ₹{-topup:,}")
    else:
        head = f"Their {offered.title} (~₹{ov:,}) for your {requested.title} (~₹{rv:,})"
        tail = ("an even swap" if topup == 0 else
                f"swap + they add ₹{topup:,}" if topup > 0 else f"swap + you add ₹{-topup:,}")
    return f"{head}: {tail}"


def _outs(session: Session, swaps: list[Swap], me: User) -> list[SwapOut]:
    """Serialise swaps with a handful of batched queries (listings, sellers, users) instead of per-swap lookups."""
    if not swaps:
        return []
    listing_ids = {i for s in swaps for i in (s.offered_listing_id, s.requested_listing_id)}
    listings = {l.id: l for l in session.exec(select(Listing).where(Listing.id.in_(listing_ids))).all()}
    sellers = load_sellers(session, {l.seller_id for l in listings.values()})
    user_ids = {i for s in swaps for i in (s.proposer_id, s.owner_id)}
    users = {u.id: u for u in session.exec(select(User).where(User.id.in_(user_ids))).all()}
    out = []
    for s in swaps:
        offered, requested = listings[s.offered_listing_id], listings[s.requested_listing_id]
        direction = "outgoing" if s.proposer_id == me.id else "incoming"
        out.append(SwapOut(
            id=s.id, status=s.status, cash_topup=s.cash_topup,
            summary=_summary(offered, requested, s.cash_topup, direction), created_at=s.created_at, direction=direction,
            proposer=user_out(users[s.proposer_id]), owner=user_out(users[s.owner_id]),
            offered=listing_out(session, offered, sellers), requested=listing_out(session, requested, sellers),
        ))
    return out


def _out(session: Session, s: Swap, me: User) -> SwapOut:
    return _outs(session, [s], me)[0]


def _load_pair(session: Session, offered_id: int, requested_id: int) -> tuple[Listing, Listing]:
    offered, requested = session.get(Listing, offered_id), session.get(Listing, requested_id)
    if offered is None or requested is None:
        raise HTTPException(404, "Listing not found")
    return offered, requested


@router.get("/quote", response_model=SwapQuote)
def quote(offered_listing_id: int, requested_listing_id: int, user: User = Depends(get_current_user),
          session: Session = Depends(get_session)):
    offered, requested = _load_pair(session, offered_listing_id, requested_listing_id)
    ov, rv, topup = _quote(offered, requested)
    return SwapQuote(offered_value=ov, requested_value=rv, cash_topup=topup,
                     summary=_summary(offered, requested, topup, "outgoing"))


@router.get("", response_model=list[SwapOut])
def my_swaps(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    rows = session.exec(select(Swap).where(or_(Swap.proposer_id == user.id, Swap.owner_id == user.id))
                        .order_by(Swap.id.desc())).all()
    return _outs(session, rows, user)


@router.post("", response_model=SwapOut, status_code=201)
def propose(body: SwapIn, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    offered, requested = _load_pair(session, body.offered_listing_id, body.requested_listing_id)
    if offered.seller_id != user.id:
        raise HTTPException(403, "You can only offer your own item")
    if requested.seller_id == user.id:
        raise HTTPException(422, "You can't swap with yourself")
    if offered.status != "active" or requested.status != "active":
        raise HTTPException(409, "Both items must still be available")
    dup = session.exec(select(Swap).where(
        Swap.status == "pending", Swap.offered_listing_id == offered.id, Swap.requested_listing_id == requested.id)).first()
    if dup:
        raise HTTPException(409, "You already proposed this swap")
    _, _, topup = _quote(offered, requested)
    s = Swap(proposer_id=user.id, owner_id=requested.seller_id, offered_listing_id=offered.id,
             requested_listing_id=requested.id, cash_topup=topup)
    session.add(s)
    session.commit()
    session.refresh(s)
    return _out(session, s, user)


def _decide(session: Session, swap_id: int, user: User) -> Swap:
    s = session.get(Swap, swap_id)
    if s is None:
        raise HTTPException(404, "Swap not found")
    if s.owner_id != user.id:
        raise HTTPException(403, "Only the owner of the requested item can respond")
    if s.status != "pending":
        raise HTTPException(409, f"Swap already {s.status}")
    return s


@router.post("/{swap_id}/accept", response_model=SwapOut)
def accept(swap_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    s = _decide(session, swap_id, user)
    offered, requested = _load_pair(session, s.offered_listing_id, s.requested_listing_id)
    if offered.status != "active" or requested.status != "active":
        raise HTTPException(409, "One of the items is no longer available")
    s.status = "accepted"
    offered.status = requested.status = "swapped"
    session.add_all([s, offered, requested])
    # any other pending swaps touching these items can no longer happen
    others = session.exec(select(Swap).where(Swap.status == "pending", Swap.id != s.id, or_(
        Swap.offered_listing_id.in_([offered.id, requested.id]), Swap.requested_listing_id.in_([offered.id, requested.id])))).all()
    for o in others:
        o.status = "declined"
        session.add(o)
    session.commit()
    session.refresh(s)
    return _out(session, s, user)


@router.post("/{swap_id}/decline", response_model=SwapOut)
def decline(swap_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    s = _decide(session, swap_id, user)
    s.status = "declined"
    session.add(s)
    session.commit()
    session.refresh(s)
    return _out(session, s, user)
