from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


def now() -> datetime:
    return datetime.now(timezone.utc)


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    email: str = Field(index=True, unique=True)
    password_hash: Optional[str] = None  # None for Google-only accounts
    google_sub: Optional[str] = Field(default=None, index=True)
    response_rate: float = 0.9  # fake stat used by the trust badge
    created_at: datetime = Field(default_factory=now)


class RefreshToken(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    token_hash: str = Field(index=True, unique=True)
    expires_at: datetime
    revoked: bool = False
    created_at: datetime = Field(default_factory=now)


class Listing(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    seller_id: int = Field(index=True, foreign_key="user.id")
    title: str = Field(index=True)
    category: str = Field(index=True)
    condition: str
    age_years: float
    original_price: int
    price: int
    suggested_price: int
    suggested_low: int
    suggested_high: int
    description: str = ""
    image_url: Optional[str] = None  # cover photo (first of `images`)
    images: str = "[]"  # JSON list of photo URLs, cover first
    status: str = Field(default="active", index=True)  # active | sold | swapped
    created_at: datetime = Field(default_factory=now)


class Wanted(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    title: str
    category: Optional[str] = None
    max_price: int
    note: str = ""
    active: bool = True
    created_at: datetime = Field(default_factory=now)


class Swap(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    proposer_id: int = Field(index=True, foreign_key="user.id")
    owner_id: int = Field(index=True, foreign_key="user.id")
    offered_listing_id: int = Field(foreign_key="listing.id")
    requested_listing_id: int = Field(foreign_key="listing.id")
    # >0: proposer pays owner this much, <0: owner pays proposer. Based on fair values.
    cash_topup: int = 0
    status: str = "pending"  # pending | accepted | declined
    created_at: datetime = Field(default_factory=now)


class Conversation(SQLModel, table=True):
    """One buyer talking to one seller about one listing."""
    id: Optional[int] = Field(default=None, primary_key=True)
    listing_id: int = Field(index=True, foreign_key="listing.id")
    buyer_id: int = Field(index=True, foreign_key="user.id")
    seller_id: int = Field(index=True, foreign_key="user.id")
    buyer_unread: int = 0
    seller_unread: int = 0
    last_message: Optional[str] = None
    updated_at: datetime = Field(default_factory=now, index=True)
    created_at: datetime = Field(default_factory=now)


class Message(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    conversation_id: int = Field(index=True, foreign_key="conversation.id")
    sender_id: int = Field(foreign_key="user.id")
    body: str = ""
    offer_price: Optional[int] = None      # set when this message is a price offer
    offer_status: Optional[str] = None     # pending | accepted | declined
    created_at: datetime = Field(default_factory=now)
