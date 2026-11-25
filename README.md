# GREEN · Second Life

Campus resale app: seniors give old books, calculators and cycles a second life with juniors, at a price both feel is fair.
A price guide learns from 200 (fake) past campus sales and explains **why** a price makes sense.

```
/backend   FastAPI + SQLite: auth (JWT + Google OAuth), listings, wanted, swaps, price suggestion
/data      generate_data.py -> listings.csv, fit_model.py -> model.json (per-category depreciation fit)
/app       Expo (React Native, TypeScript, Expo Router, NativeWind)
/docs      API.md, PROMPT_LOG.md
```

## Run it (5 commands)

```bash
# 1. backend deps (Python 3.11+)
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt

# 2. (optional) regenerate the data and refit the model; the repo already ships both outputs
.venv/bin/python ../data/generate_data.py && .venv/bin/python ../data/fit_model.py

# 3. start the API on port 8787 (all interfaces, so your phone can reach it)
.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8787

# 4. app deps (new terminal)
cd app && npm install

# 5. start Expo, then scan the QR code with Expo Go (phone and laptop on the same Wi-Fi)
npx expo start
```

The app finds the backend by itself: it uses the laptop's LAN IP from the Expo dev server and port **8787**
(not 8000, which many machines already use). To point at a deployed backend or an ngrok tunnel, set
`EXPO_PUBLIC_API_URL` in `app/.env`.

**Demo login:** `demo@example.com` / `Demo@1234` (or tap "Sign in as Demo Student" on the login screen).
All seeded people are obviously fake (`Demo Student`, `Demo Senior …`).

Backend tests: `cd backend && .venv/bin/python -m pytest -q`   Type check: `cd app && npx tsc --noEmit`

## Environment variables

| File | Variable | Purpose |
|---|---|---|
| `backend/.env` | `JWT_SECRET` | Signs access tokens. If unset, a random one is generated and saved to `backend/.dev_jwt_secret`. Set a long random value for any deployment. |
| `backend/.env` | `DATABASE_URL` | Default `sqlite:///./green.db`. Use your Supabase Postgres string to switch (see below) |
| `backend/.env` | `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID` | Audiences the server accepts for Google ID tokens. Blank = Google sign-in disabled (the endpoint returns 503). |
| `app/.env` | `EXPO_PUBLIC_API_URL` | Optional backend URL override |
| `app/.env` | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `…ANDROID…`, `…IOS…` | Client IDs for the Google button. A platform without its ID simply hides the button. |

Copy `backend/.env.example` and `app/.env.example`. `EXPO_PUBLIC_*` values are bundled into the app, so never put secrets there.

### Google sign-in setup and the Expo Go limit
1. Google Cloud Console -> OAuth consent screen, then create OAuth client IDs (Web, plus Android/iOS for device builds).
2. Put the IDs in both `.env` files (the backend must list every client ID the app uses).
3. **Expo Go cannot complete Google's redirect on a phone.** Google rejects Expo Go's redirect URI. Use a development
   build (`npx expo run:android` / `npx expo run:ios`) or test the Google button on Expo web (`npx expo start --web`,
   with the Web client ID and `http://localhost:8081` added as an authorised origin and redirect URI).
   Email/password sign-in works everywhere, including Expo Go.

## Using Supabase (Postgres) as the database
The backend runs on SQLite by default. To use Supabase instead, only `backend/.env` changes; the mobile app never talks to Supabase.

1. Create a project at supabase.com. Remember the **database password** you set.
2. Dashboard -> **Connect** -> copy the **Session pooler** connection string (works over IPv4; the direct
   `db.<ref>.supabase.co` host is IPv6-only unless you buy the IPv4 add-on). The transaction pooler (port 6543) also works.
3. Put it in `backend/.env`, with your password in place of `[YOUR-PASSWORD]`. URL-encode special characters
   (`@` -> `%40`, `#` -> `%23`, `/` -> `%2F`, `:` -> `%3A`):
   ```
   DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```
4. Install the driver and check the connection (this also creates the tables):
   ```bash
   cd backend && .venv/bin/pip install -r requirements.txt && .venv/bin/python -m app.check_db
   ```
   Every table should show `row level security: ON`.
5. Start the API as usual. On first start the empty database is seeded with the demo data and demo user.

Things worth knowing:
- **Row Level Security.** Supabase exposes every `public` table over its REST API. The backend turns RLS on (no policies) for
  all its tables, so the anon key can't read things like password hashes. The backend connects as the database owner, which
  bypasses RLS, so it is unaffected.
- **Keep Supabase's anon and service_role keys out of the app.** Auth is this backend's own JWT, and all data goes through the API.
  Never put the database password or the `service_role` key in `app/.env` (anything `EXPO_PUBLIC_*` ships inside the app).
- Tables are created with `create_all` on startup, which only creates missing tables. If you later change a model, add a migration
  tool (Alembic) or reset the tables.
- Uploaded photos still go to `backend/uploads` on the server's disk. For a hosted deployment, move them to Supabase Storage.
- Verified against a live Supabase project (Tokyo session pooler). `python -m app.check_db` is the first thing to run on a new one.

## AI features (Gemini) and messaging
- **Photos:** take photos with the camera or pick several from the gallery (up to 6). Tap a photo to make it the cover; buyers swipe through them.
- **Snap to list:** after the first photo, Gemini identifies the item (name, brand, model, category, condition, typical new price in India,
  highlights) and fills the empty fields. Add the age and the fair price appears.
- **GREEN Assistant:** "Ask AI" on Browse. It knows the items for sale right now and links to them, explains prices, swaps and badges.
- **Messages:** "Contact seller" opens a chat about that item. Buyers can send a price offer (labelled steal / fair / pricey against the fair
  price); the seller accepts or declines. Inbox with unread badge on Browse; chats refresh every few seconds.

Set `GEMINI_API_KEY` in `backend/.env` (never in `app/.env`). If the main model is busy the server falls back to `gemini-3.6-flash`, then
`gemini-flash-lite-latest`. Without a key the AI parts show "switched off" and everything else works.

## How the pricing works
`data/fit_model.py` fits, per category, `log(sold / original) = intercept + b·age + condition effect` (plus an
"edition change" step for textbooks at 3+ years). `POST /price/suggest` applies it, adds a small seasonal factor
(prices peak when juniors arrive in Jul-Aug), and returns:
the suggested price, a range from the residual quartiles, a confidence level, 3-4 plain-language reasons and the closest past sales.
Unknown categories, or ones with fewer than 8 sales, fall back to the all-category model and report **low** confidence.

## Gate checklist: "scientific calculator, 2 years old, good condition, bought at ₹1,200"
- [ ] Backend running; phone can open `http://<laptop-ip>:8787/health`
- [ ] Sign in (demo account or register)
- [ ] Sell tab: title, **Calculators**, **Good**, age `2`, original price `1200`
- [ ] A suggested price appears within a second (about ₹540, range ₹500-₹570) with reasons and similar past sales
- [ ] Post listing -> the detail screen opens with the "Why this price?" section
- [ ] Browse -> search "calculator" finds it

Verified in this repo: backend tests (48 pass), TypeScript check, web and iOS bundles build, and the flow above run end
to end in the browser preview (Expo web). Not verified: a physical phone via Expo Go, Google sign-in with real client IDs, and photo upload from a phone gallery.

## Notes
- Node: Expo SDK 58 lists Node 22.13+/24.3+/26 as supported; Node 25 installs with a warning.
- Tokens are stored in `expo-secure-store` on iOS/Android. On Expo web (a dev preview only) there is no secure store, so
  `localStorage` is used instead.
#   S e c o n d - L i f e  
 