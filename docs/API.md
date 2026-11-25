# API reference

Base URL `http://<host>:8787`. Interactive docs (generated from the code): `/docs`. JSON bodies, bearer auth:
`Authorization: Bearer <access_token>`. Errors are `{"detail": "message"}`, or a list of field errors on 422.

## Auth
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/auth/register` | `{name, email, password(>=8)}` | `201` TokenOut |
| POST | `/auth/login` | `{email, password}` | TokenOut (`429` after 8 attempts/minute per client+email) |
| POST | `/auth/refresh` | `{refresh_token}` | new TokenOut; the old refresh token is revoked (reuse revokes all of the user's tokens) |
| POST | `/auth/logout` | `{refresh_token}` | `204` |
| POST | `/auth/google` | `{id_token}` | TokenOut (`503` if Google is not configured, `401` if the token is invalid) |
| GET | `/me` | | `{id, name, email}` |

`TokenOut = {access_token, refresh_token, token_type:"bearer", user}`. Access token: JWT (HS256), 15 min.
Refresh token: opaque, 7 days, stored hashed, rotated on every use.

## Price suggestion (public)
`POST /price/suggest`
```json
{"category": "calculators", "condition": "good", "age_years": 2, "original_price": 1200}
```
```json
{
  "suggested_price": 540, "low": 500, "high": 570, "confidence": "high",
  "explanation": [
    "Calculators in good condition keep about 47% of their original price after 2 years (about 9% lost per year in this category).",
    "Based on 6 similar past sales, the median sold price would be about ₹550 for your item. The suggested range ₹500–₹570 covers the middle half of sales.",
    "This month demand is lower than average, so the price is adjusted by -4%.",
    "Confidence: high (plenty of similar sales, 40 in this category)."
  ],
  "comparables": [{"item_name": "Scientific Calculator fx-82", "age_years": 2.0, "condition": "good", "sold_price": 480, "original_price": 910}]
}
```
`condition` is one of `new, like_new, good, fair, poor`. `age_years` 0-30, `original_price` > 0, otherwise `422`.
The month adjustment depends on the current date, so the exact number can differ by a few rupees through the year.

## Listings
| Method | Path | Notes |
|---|---|---|
| GET | `/listings` | Public. Query: `q, category, condition (comma list), min_price, max_price, status (active\|sold\|swapped\|any), seller_id, sort (newest\|price_asc\|price_desc\|best_deal), page, page_size(<=100)`. Returns `{items,total,page,page_size}` |
| GET | `/listings/mine` | Auth. All of my listings |
| POST | `/listings` | Auth. `{title, category, condition, age_years, original_price, price?, description?, image_url?}`. `price` defaults to the suggested price. The server computes the suggestion itself |
| GET | `/listings/{id}` | Listing plus `pricing` (the "why this price" payload) |
| PUT | `/listings/{id}` | Owner only; recalculates the suggestion if condition/age/original price change |
| DELETE | `/listings/{id}` | Owner only, `204` |
| POST | `/listings/{id}/sold` | Owner only |

Each listing includes `fair_label` (`steal` price <= 0.9x suggested, `fair` <= 1.12x, else `pricey`) and `seller` with a `trust` badge.

## Wanted
`GET /wanted` (public) · `GET /wanted/mine` · `POST /wanted {title, category?, max_price, note?}` ·
`GET /wanted/{id}/matches` (active listings in the category or matching keywords, within budget) · `DELETE /wanted/{id}` (owner closes it).

## Swaps
Fair value of an item = its suggested price, so both sides are priced the same way.
`GET /swaps/quote?offered_listing_id=&requested_listing_id=` ->
`{offered_value, requested_value, cash_topup, summary}` (`cash_topup > 0`: the proposer adds cash; `< 0`: the owner adds cash).
`POST /swaps {offered_listing_id, requested_listing_id}` · `GET /swaps` (incoming and outgoing) ·
`POST /swaps/{id}/accept` and `/decline` (owner of the requested item only; accepting marks both listings `swapped`
and declines other pending swaps on them).

## Other
- `GET /sellers/{id}/trust` -> `{badge: bronze|silver|gold, score, items_sold, swaps_done, response_rate, next_badge, points_to_next}`.
  Score = items sold + 2 x swaps done + round(10 x response rate); silver at 10, gold at 25.
  `response_rate` is a fake stored stat.
- `GET /me/stats` (auth) -> `{user, trust, green:{waste_kg, co2_kg}}` (rough per-category estimates).
- `GET /insights` -> `{headline, curves, categories, season}` for the charts.
- `GET /meta` -> categories, conditions, `google_enabled`.
- `POST /uploads` (auth, multipart `file`) -> `{url}`; JPEG/PNG/WebP only (checked by file signature), max 5 MB.
- `GET /health` -> `{"status":"ok"}`.
