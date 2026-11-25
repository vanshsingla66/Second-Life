// Mirrors the FastAPI schemas in backend/app/schemas.py. Keep in sync.
export type Condition = "new" | "like_new" | "good" | "fair" | "poor";
export type FairLabel = "steal" | "fair" | "pricey";
export type Badge = "bronze" | "silver" | "gold";
export type Confidence = "high" | "medium" | "low";

export interface User { id: number; name: string; email: string }
export interface TokenResponse { access_token: string; refresh_token: string; token_type: string; user: User }

export interface Comparable {
  item_name: string; age_years: number; condition: string; sold_price: number; original_price: number;
}
export interface PriceSuggestion {
  suggested_price: number; low: number; high: number; confidence: Confidence;
  explanation: string[]; comparables: Comparable[];
}
export interface PriceRequest { category: string; condition: Condition; age_years: number; original_price: number }

export interface Trust {
  badge: Badge; score: number; items_sold: number; swaps_done: number; response_rate: number;
  next_badge: string | null; points_to_next: number;
}
export interface Seller { id: number; name: string; trust: Trust }

export interface Listing {
  id: number; title: string; category: string; condition: Condition; age_years: number;
  original_price: number; price: number; suggested_price: number; suggested_low: number; suggested_high: number;
  fair_label: FairLabel; description: string; image_url: string | null; image_urls: string[]; status: "active" | "sold" | "swapped";
  created_at: string; seller: Seller;
}
export interface ListingDetail extends Listing { pricing: PriceSuggestion }
export interface ListingPage { items: Listing[]; total: number; page: number; page_size: number }
export interface ListingInput {
  title: string; category: string; condition: Condition; age_years: number; original_price: number;
  price?: number; description?: string; image_url?: string | null; image_urls?: string[];
}
export type ListingUpdate = Partial<Omit<ListingInput, "category">>;

export interface ListingFilters {
  q?: string; category?: string; condition?: Condition[]; min_price?: number; max_price?: number;
  sort?: "newest" | "price_asc" | "price_desc" | "best_deal";
}

export interface Wanted {
  id: number; title: string; category: string | null; max_price: number; note: string; active: boolean;
  created_at: string; user: User; match_count: number;
}
export interface WantedInput { title: string; category?: string | null; max_price: number; note?: string }

export interface SwapQuote { offered_value: number; requested_value: number; cash_topup: number; summary: string }
export interface Swap {
  id: number; status: "pending" | "accepted" | "declined"; cash_topup: number; summary: string; created_at: string;
  direction: "incoming" | "outgoing"; proposer: User; owner: User; offered: Listing; requested: Listing;
}

export interface Stats { user: User; trust: Trust; green: { waste_kg: number; co2_kg: number } }

export interface Meta {
  categories: { id: string; label: string }[];
  conditions: { id: Condition; label: string }[];
  google_enabled: boolean;
}
export interface Insights {
  headline: string;
  curves: Record<string, { age: number; retention: number }[]>;
  categories: { category: string; label: string; n: number; yearly_loss_pct: number; retention_2y: number }[];
  season: { month: number; factor: number }[];
}

export interface AiStatus { enabled: boolean; model: string | null }
export interface Identified {
  is_product: boolean; title: string; brand: string; model: string; category: string | null; condition: Condition | null;
  original_price_inr: number | null; description: string; highlights: string[]; confidence: "high" | "medium" | "low";
}
export interface ChatMessage { role: "user" | "assistant"; content: string }
export interface ChatReply { reply: string; listing_ids: number[] }

export interface ChatListing { id: number; title: string; price: number; suggested_price: number; category: string; image_url: string | null; status: string }
export interface Conversation {
  id: number; listing: ChatListing; other: { id: number; name: string }; i_am_seller: boolean; unread: number;
  last_message: string | null; updated_at: string;
}
export interface ThreadMessage {
  id: number; sender_id: number; mine: boolean; body: string; offer_price: number | null;
  offer_status: "pending" | "accepted" | "declined" | null; offer_label: FairLabel | null; created_at: string;
}
export interface Thread { conversation: Conversation; messages: ThreadMessage[] }
