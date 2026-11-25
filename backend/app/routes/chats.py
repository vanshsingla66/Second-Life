"""Buyer <-> seller messaging, with price offers the seller can accept or decline."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, or_
from sqlmodel import Session, select

from .. import pricing
from ..auth import get_current_user
from ..db import get_session
from ..models import Conversation, Listing, Message, User, now
from ..services import photos_of

router = APIRouter(prefix="/chats", tags=["chats"])


# ---------- schemas ----------
class ChatListing(BaseModel):
    id: int
    title: str
    price: int
    suggested_price: int
    category: str
    image_url: Optional[str]
    status: str


class ChatPerson(BaseModel):
    id: int
    name: str


class ConversationOut(BaseModel):
    id: int
    listing: ChatListing
    other: ChatPerson
    i_am_seller: bool
    unread: int
    last_message: Optional[str]
    updated_at: datetime


class MessageOut(BaseModel):
    id: int
    sender_id: int
    mine: bool
    body: str
    offer_price: Optional[int]
    offer_status: Optional[str]
    offer_label: Optional[str]  # steal | fair | pricey vs the fair price
    created_at: datetime


class ThreadOut(BaseModel):
    conversation: ConversationOut
    messages: list[MessageOut]


class StartIn(BaseModel):
    listing_id: int


class SendIn(BaseModel):
    body: str = Field(default="", max_length=1000)
    offer_price: Optional[int] = Field(default=None, gt=0, le=1_000_000)

    @model_validator(mode="after")
    def not_empty(self):
        self.body = self.body.strip()
        if not self.body and self.offer_price is None:
            raise ValueError("Write a message or make an offer")
        return self


class OfferDecision(BaseModel):
    accept: bool


# ---------- helpers ----------
def _mine(session: Session, conv_id: int, user: User) -> Conversation:
    c = session.get(Conversation, conv_id)
    if c is None or user.id not in (c.buyer_id, c.seller_id):
        raise HTTPException(404, "Conversation not found")
    return c


def _conv_out(c: Conversation, me: User, listing: Listing, other: User) -> ConversationOut:
    seller = me.id == c.seller_id
    return ConversationOut(
        id=c.id, i_am_seller=seller, unread=c.seller_unread if seller else c.buyer_unread,
        last_message=c.last_message, updated_at=c.updated_at, other=ChatPerson(id=other.id, name=other.name),
        listing=ChatListing(id=listing.id, title=listing.title, price=listing.price, suggested_price=listing.suggested_price,
                            category=listing.category, image_url=(photos_of(listing) or [None])[0], status=listing.status),
    )


def _msg_out(m: Message, me: User, fair: int) -> MessageOut:
    return MessageOut(
        id=m.id, sender_id=m.sender_id, mine=m.sender_id == me.id, body=m.body, offer_price=m.offer_price,
        offer_status=m.offer_status, created_at=m.created_at,
        offer_label=pricing.fair_label(m.offer_price, fair) if m.offer_price else None,
    )


def _post(session: Session, c: Conversation, sender: User, body: str, offer: Optional[int] = None) -> Message:
    m = Message(conversation_id=c.id, sender_id=sender.id, body=body, offer_price=offer,
                offer_status="pending" if offer else None)
    c.last_message = f"Offer: ₹{offer:,}" + (f" · {body}" if body else "") if offer else body
    c.last_message = c.last_message[:140]
    c.updated_at = now()
    if sender.id == c.buyer_id:
        c.seller_unread += 1
    else:
        c.buyer_unread += 1
    session.add(m)
    session.add(c)
    return m


def _thread(session: Session, c: Conversation, me: User) -> ThreadOut:
    listing = session.get(Listing, c.listing_id)
    other = session.get(User, c.seller_id if me.id == c.buyer_id else c.buyer_id)
    msgs = session.exec(select(Message).where(Message.conversation_id == c.id).order_by(Message.id)).all()
    return ThreadOut(conversation=_conv_out(c, me, listing, other),
                     messages=[_msg_out(m, me, listing.suggested_price) for m in msgs])


# ---------- routes ----------
@router.post("", response_model=ConversationOut)
def start(body: StartIn, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Open (or reopen) the buyer's conversation about a listing."""
    l = session.get(Listing, body.listing_id)
    if l is None:
        raise HTTPException(404, "Listing not found")
    if l.seller_id == user.id:
        raise HTTPException(400, "This is your own listing")
    c = session.exec(select(Conversation).where(Conversation.listing_id == l.id, Conversation.buyer_id == user.id)).first()
    if c is None:
        if l.status != "active":
            raise HTTPException(409, "This item is no longer available")
        c = Conversation(listing_id=l.id, buyer_id=user.id, seller_id=l.seller_id)
        session.add(c)
        session.commit()
        session.refresh(c)
    return _conv_out(c, user, l, session.get(User, l.seller_id))


@router.get("", response_model=list[ConversationOut])
def inbox(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    convs = session.exec(select(Conversation).where(
        or_(Conversation.buyer_id == user.id, Conversation.seller_id == user.id),
        Conversation.last_message.is_not(None)).order_by(Conversation.updated_at.desc()).limit(100)).all()
    if not convs:
        return []
    listings = {l.id: l for l in session.exec(select(Listing).where(Listing.id.in_({c.listing_id for c in convs}))).all()}
    people = {u.id: u for u in session.exec(select(User).where(
        User.id.in_({c.buyer_id for c in convs} | {c.seller_id for c in convs}))).all()}
    return [_conv_out(c, user, listings[c.listing_id], people[c.seller_id if user.id == c.buyer_id else c.buyer_id])
            for c in convs]


@router.get("/unread")
def unread(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    b = session.exec(select(func.coalesce(func.sum(Conversation.buyer_unread), 0)).where(Conversation.buyer_id == user.id)).one()
    s = session.exec(select(func.coalesce(func.sum(Conversation.seller_unread), 0)).where(Conversation.seller_id == user.id)).one()
    return {"unread": int(b) + int(s)}


@router.get("/{conv_id}", response_model=ThreadOut)
def thread(conv_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    c = _mine(session, conv_id, user)
    field = "seller_unread" if user.id == c.seller_id else "buyer_unread"
    if getattr(c, field):
        setattr(c, field, 0)  # opening the thread marks it read
        session.add(c)
        session.commit()
        session.refresh(c)
    return _thread(session, c, user)


@router.post("/{conv_id}/messages", response_model=ThreadOut, status_code=201)
def send(conv_id: int, body: SendIn, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    c = _mine(session, conv_id, user)
    if body.offer_price is not None:
        if user.id != c.buyer_id:
            raise HTTPException(403, "Only the buyer can make an offer")
        if session.get(Listing, c.listing_id).status != "active":
            raise HTTPException(409, "This item is no longer available")
        # a new offer replaces any earlier one still waiting
        for old in session.exec(select(Message).where(Message.conversation_id == c.id, Message.offer_status == "pending")).all():
            old.offer_status = "declined"
            session.add(old)
    _post(session, c, user, body.body, body.offer_price)
    session.commit()
    session.refresh(c)
    return _thread(session, c, user)


@router.post("/{conv_id}/offers/{message_id}", response_model=ThreadOut)
def decide_offer(conv_id: int, message_id: int, body: OfferDecision, user: User = Depends(get_current_user),
                 session: Session = Depends(get_session)):
    c = _mine(session, conv_id, user)
    if user.id != c.seller_id:
        raise HTTPException(403, "Only the seller can answer an offer")
    m = session.get(Message, message_id)
    if m is None or m.conversation_id != c.id or m.offer_price is None:
        raise HTTPException(404, "Offer not found")
    if m.offer_status != "pending":
        raise HTTPException(409, f"This offer was already {m.offer_status}")
    m.offer_status = "accepted" if body.accept else "declined"
    session.add(m)
    text = (f"Deal! I accept ₹{m.offer_price:,}. Let's meet on campus to hand it over 🤝" if body.accept
            else f"Sorry, I can't do ₹{m.offer_price:,}.")
    _post(session, c, user, text)
    session.commit()
    session.refresh(c)
    return _thread(session, c, user)
