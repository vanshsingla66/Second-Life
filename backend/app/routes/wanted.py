from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..auth import get_current_user
from ..db import get_session
from ..models import User, Wanted
from ..schemas import ListingOut, WantedIn, WantedOut
from ..models import Listing
from ..services import listings_out, matches_for_wanted, user_out

router = APIRouter(prefix="/wanted", tags=["wanted"])


def _outs(session: Session, rows: list[Wanted]) -> list[WantedOut]:
    users = {u.id: u for u in session.exec(select(User).where(User.id.in_({w.user_id for w in rows}))).all()} if rows else {}
    active = session.exec(select(Listing).where(Listing.status == "active")).all() if rows else []
    return [
        WantedOut(id=w.id, title=w.title, category=w.category, max_price=w.max_price, note=w.note, active=w.active,
                  created_at=w.created_at, user=user_out(users[w.user_id]),
                  match_count=len(matches_for_wanted(session, w.title, w.category, w.max_price, w.user_id, active)))
        for w in rows
    ]


def _out(session: Session, w: Wanted) -> WantedOut:
    return _outs(session, [w])[0]


@router.get("", response_model=list[WantedOut])
def list_wanted(session: Session = Depends(get_session)):
    rows = session.exec(select(Wanted).where(Wanted.active == True).order_by(Wanted.id.desc())).all()  # noqa: E712
    return _outs(session, rows)


@router.get("/mine", response_model=list[WantedOut])
def my_wanted(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    rows = session.exec(select(Wanted).where(Wanted.user_id == user.id).order_by(Wanted.id.desc())).all()
    return _outs(session, rows)


@router.post("", response_model=WantedOut, status_code=201)
def create_wanted(body: WantedIn, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    w = Wanted(user_id=user.id, title=body.title.strip(), category=body.category or None,
               max_price=body.max_price, note=body.note)
    session.add(w)
    session.commit()
    session.refresh(w)
    return _out(session, w)


@router.get("/{wanted_id}/matches", response_model=list[ListingOut])
def wanted_matches(wanted_id: int, session: Session = Depends(get_session)):
    w = session.get(Wanted, wanted_id)
    if w is None:
        raise HTTPException(404, "Request not found")
    return listings_out(session, matches_for_wanted(session, w.title, w.category, w.max_price, w.user_id))


@router.delete("/{wanted_id}", status_code=204)
def close_wanted(wanted_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    w = session.get(Wanted, wanted_id)
    if w is None:
        raise HTTPException(404, "Request not found")
    if w.user_id != user.id:
        raise HTTPException(403, "You can only close your own requests")
    w.active = False
    session.add(w)
    session.commit()
