from datetime import datetime
from typing import Annotated, Literal, Optional

from pydantic import BaseModel, EmailStr, Field, StringConstraints

Condition = Literal["new", "like_new", "good", "fair", "poor"]


# ---------- auth ----------
class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class RefreshIn(BaseModel):
    refresh_token: str


class GoogleIn(BaseModel):
    id_token: str


class UserOut(BaseModel):
    id: int
    name: str
    email: str


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- pricing ----------
class PriceIn(BaseModel):
    category: str = Field(min_length=1, max_length=60)
    condition: Condition
    age_years: float = Field(ge=0, le=30)
    original_price: float = Field(gt=0, le=1_000_000)


class Comparable(BaseModel):
    item_name: str
    age_years: float
    condition: str
    sold_price: int
    original_price: int


class PriceOut(BaseModel):
    suggested_price: int
    low: int
    high: int
    confidence: Literal["high", "medium", "low"]
    explanation: list[str]
    comparables: list[Comparable]


# ---------- trust ----------
class TrustOut(BaseModel):
    badge: Literal["bronze", "silver", "gold"]
    score: int
    items_sold: int
    swaps_done: int
    response_rate: float
    next_badge: Optional[str] = None
    points_to_next: int = 0


class SellerOut(BaseModel):
    id: int
    name: str
    trust: TrustOut


# ---------- listings ----------
MAX_PHOTOS = 6
ImageList = Annotated[list[Annotated[str, StringConstraints(pattern=r"^/uploads/[a-f0-9]{24}\.(jpg|png|webp)$")]],
                      Field(max_length=MAX_PHOTOS)]


class ListingIn(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    category: str = Field(min_length=1, max_length=60)
    condition: Condition
    age_years: float = Field(ge=0, le=30)
    original_price: int = Field(gt=0, le=1_000_000)
    price: Optional[int] = Field(default=None, gt=0, le=1_000_000)  # defaults to suggested price
    description: str = Field(default="", max_length=1000)
    image_url: Optional[str] = Field(default=None, max_length=500)
    image_urls: Optional[ImageList] = None  # up to 6 photos, cover first; wins over image_url


class ListingUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=2, max_length=120)
    price: Optional[int] = Field(default=None, gt=0, le=1_000_000)
    condition: Optional[Condition] = None
    age_years: Optional[float] = Field(default=None, ge=0, le=30)
    original_price: Optional[int] = Field(default=None, gt=0, le=1_000_000)
    description: Optional[str] = Field(default=None, max_length=1000)
    image_url: Optional[str] = Field(default=None, max_length=500)
    image_urls: Optional[ImageList] = None


class ListingOut(BaseModel):
    id: int
    title: str
    category: str
    condition: str
    age_years: float
    original_price: int
    price: int
    suggested_price: int
    suggested_low: int
    suggested_high: int
    fair_label: Literal["steal", "fair", "pricey"]
    description: str
    image_url: Optional[str]
    image_urls: list[str] = []
    status: str
    created_at: datetime
    seller: SellerOut


class ListingPage(BaseModel):
    items: list[ListingOut]
    total: int
    page: int
    page_size: int


class ListingDetail(ListingOut):
    pricing: PriceOut  # "why this price" for the detail screen


# ---------- wanted ----------
class WantedIn(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    category: Optional[str] = Field(default=None, max_length=60)
    max_price: int = Field(gt=0, le=1_000_000)
    note: str = Field(default="", max_length=500)


class WantedOut(BaseModel):
    id: int
    title: str
    category: Optional[str]
    max_price: int
    note: str
    active: bool
    created_at: datetime
    user: UserOut
    match_count: int


# ---------- swaps ----------
class SwapIn(BaseModel):
    offered_listing_id: int
    requested_listing_id: int


class SwapQuote(BaseModel):
    offered_value: int
    requested_value: int
    cash_topup: int  # >0 proposer pays owner, <0 owner pays proposer
    summary: str


class SwapOut(BaseModel):
    id: int
    status: str
    cash_topup: int
    summary: str
    created_at: datetime
    direction: Literal["incoming", "outgoing"]
    proposer: UserOut
    owner: UserOut
    offered: ListingOut
    requested: ListingOut


# ---------- me ----------
class GreenOut(BaseModel):
    waste_kg: float
    co2_kg: float


class StatsOut(BaseModel):
    user: UserOut
    trust: TrustOut
    green: GreenOut
