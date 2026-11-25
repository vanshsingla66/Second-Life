"""Gemini calls: recognise a product from photos, and the in-app assistant.

Uses the Gemini REST API directly (no extra SDK). The API key stays on the server; the app only talks to this backend.
"""
import base64
import json
from typing import Any, Optional

import httpx
from fastapi import HTTPException

from . import config, pricing

API = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
TIMEOUT = 30.0
FALLBACK_MODELS = ("gemini-3.6-flash", "gemini-flash-lite-latest")


def enabled() -> bool:
    return bool(config.GEMINI_API_KEY)


def _require() -> None:
    if not enabled():
        raise HTTPException(503, "AI features are off. Add GEMINI_API_KEY to backend/.env and restart the server.")


def generate(contents: list[dict], system: str, schema: Optional[dict] = None, temperature: float = 0.4) -> str:
    """One generateContent call. Returns the text of the first candidate."""
    _require()
    gen: dict[str, Any] = {"temperature": temperature, "maxOutputTokens": 2048}
    if schema:
        gen["responseMimeType"] = "application/json"
        gen["responseSchema"] = schema
    body = {"systemInstruction": {"parts": [{"text": system}]}, "contents": contents, "generationConfig": gen}
    # Busy or retired models fall through to the next one, so a demand spike doesn't break the app.
    last = None
    for model in dict.fromkeys([config.GEMINI_MODEL, *FALLBACK_MODELS]):
        try:
            r = httpx.post(API.format(model=model), json=body, timeout=TIMEOUT,
                           headers={"x-goog-api-key": config.GEMINI_API_KEY})
        except httpx.HTTPError:
            last = HTTPException(502, "Couldn't reach the AI service. Check the server's internet connection.")
            continue
        if r.status_code in (400, 401, 403) and "API key" in r.text:
            raise HTTPException(502, "The Gemini API key was rejected. Check GEMINI_API_KEY in backend/.env.")
        if r.status_code in (404, 429, 500, 503):
            last = HTTPException(429 if r.status_code == 429 else 503,
                                 "The AI is busy right now. Try again in a few seconds.")
            continue
        if r.status_code >= 400:
            raise HTTPException(502, f"AI service error ({r.status_code}).")
        try:
            parts = r.json()["candidates"][0]["content"]["parts"]
        except (KeyError, IndexError, ValueError):
            raise HTTPException(502, "The AI returned no answer (it may have been blocked). Try another photo or question.")
        return "".join(p.get("text", "") for p in parts if not p.get("thought")).strip()
    raise last or HTTPException(503, "The AI is busy right now. Try again in a few seconds.")


# ---------------- product recognition ----------------
IDENTIFY_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "is_product": {"type": "BOOLEAN"},
        "title": {"type": "STRING"},
        "brand": {"type": "STRING"},
        "model": {"type": "STRING"},
        "category": {"type": "STRING", "enum": pricing.categories() + ["other"]},
        "condition": {"type": "STRING", "enum": pricing.conditions()},
        "original_price_inr": {"type": "INTEGER"},
        "description": {"type": "STRING"},
        "highlights": {"type": "ARRAY", "items": {"type": "STRING"}},
        "confidence": {"type": "STRING", "enum": ["high", "medium", "low"]},
    },
    "required": ["is_product", "title", "brand", "model", "category", "condition", "original_price_inr",
                 "description", "highlights", "confidence"],
}

IDENTIFY_SYSTEM = (
    "You help Indian college students list used items for resale. Look at the photos of ONE item and identify it.\n"
    "- title: short listing title with brand and model, e.g. 'Casio fx-991EX Scientific Calculator'.\n"
    "- brand / model: as printed on the item; use '' if you can't read it. Never invent a model number.\n"
    "- category: one of the given values; 'other' if none fits.\n"
    "- condition: judge visible wear only (new, like_new, good, fair, poor).\n"
    "- original_price_inr: typical price of this item NEW in India today, in rupees (whole number, 0 if unknown).\n"
    "- description: 1-2 honest sentences a seller could post, mentioning visible wear.\n"
    "- highlights: up to 4 short key specs or features.\n"
    "- confidence: how sure you are about the brand and model.\n"
    "If the photo does not show a sellable product, set is_product to false."
)


def identify(images: list[tuple[bytes, str]]) -> dict:
    parts: list[dict] = [{"inline_data": {"mime_type": mime, "data": base64.b64encode(b).decode()}} for b, mime in images]
    parts.append({"text": "Identify this item for a resale listing."})
    raw = generate([{"role": "user", "parts": parts}], IDENTIFY_SYSTEM, schema=IDENTIFY_SCHEMA, temperature=0.2)
    try:
        out = json.loads(raw)
    except ValueError:
        raise HTTPException(502, "The AI answer couldn't be read. Try again.")
    if out.get("category") not in pricing.categories():
        out["category"] = None
    if out.get("condition") not in pricing.conditions():
        out["condition"] = None
    price = out.get("original_price_inr")
    out["original_price_inr"] = int(price) if isinstance(price, (int, float)) and 0 < price <= 1_000_000 else None
    out["highlights"] = [str(h) for h in (out.get("highlights") or [])][:4]
    return out


# ---------------- assistant ----------------
def assistant_system(user_name: str, listings: list[dict]) -> str:
    ins = pricing.insights()
    rates = "; ".join(f"{c['label']}: loses ~{c['yearly_loss_pct']:.0f}%/yr"
                      for c in ins.get("categories", []) if "yearly_loss_pct" in c)
    stock = "\n".join(f"[#{l['id']}] {l['title']} | {l['category']} | {l['condition']} | ₹{l['price']} "
                      f"(fair ₹{l['suggested_price']})" for l in listings) or "(no active listings)"
    return (
        "You are GREEN Assistant inside 'GREEN · Second Life', a campus resale app where seniors sell used books, "
        "calculators, cycles, lab coats, hostel essentials and electronics to juniors at fair prices.\n"
        f"You are talking to {user_name}. Be friendly and brief (under 120 words), use ₹ for money, plain text "
        "with short bullet lists only when helpful. No markdown headings or bold.\n\n"
        "How the app works: Sell tab (snap photos, AI fills details, the app suggests a fair price learned from 200 "
        "past campus sales with a 'why this price' explanation); Browse with search and filters; Wanted requests "
        "that get matched to listings; Swaps (trade items, the app computes a fair cash top-up); trust badges "
        "(bronze/silver/gold from sales, swaps and reply rate); a green-impact counter.\n"
        f"Typical depreciation: {rates}. Prices peak in July-August when juniors arrive.\n\n"
        "Items for sale right now (only these exist; never invent listings):\n"
        f"{stock}\n\n"
        "When you recommend a listing, cite it exactly as [#id] after its name, e.g. 'Casio fx-991 [#12] for ₹540'. "
        "Only cite ids from the list. If nothing fits, suggest posting a Wanted request. "
        "Politely decline questions unrelated to buying, selling, pricing or campus life."
    )


def chat(messages: list[dict], user_name: str, listings: list[dict]) -> str:
    contents = [{"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]}
                for m in messages]
    return generate(contents, assistant_system(user_name, listings), temperature=0.6)
