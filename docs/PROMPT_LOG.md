# Prompt log

Required by the hackathon: what we asked, what the AI produced, and what it got wrong. Entries below are the real
mistakes from the build, in order. Add your own team's prompts above them.

## 1. Master prompt
**Asked:** the full build brief (stack, data, pricing, JWT + Google OAuth, 13 screens, build order).
**Produced:** the monorepo in this folder.

## 2. Data and pricing
- **Wrong: seasonality insight.** First version grouped raw `sold/original` by month and reported "prices peak in November (x1.23)".
  That was noise: different months happened to contain older or newer items. **Fix:** compute each sale's residual against its
  category model first, then group by month. Peak is now July-August, matching how the data was generated.
- **Risk we designed around:** prices that rise with age or go negative. Fixed by fitting log-ratios (always positive), capping at
  98% of the original price, and a test that every category's price is non-increasing with age and ordered by condition.
- **Wrong: confusing wording.** The explanation said "Confidence: high (enough similar sales (40 in this category))" with nested brackets.
  Reworded.

## 3. Backend
- **Wrong: `.test` emails.** Seed accounts used `@green.test`. Pydantic's `EmailStr` rejects reserved domains, so even the demo login
  failed with 422. **Fix:** `@example.com`.
- **Wrong: naive datetimes.** The installed SQLModel version refuses timezone-naive datetimes. **Fix:** timezone-aware UTC everywhere.
- **Wrong: missing dependency.** `python-multipart` was added to `requirements.txt` but not installed, so the app failed to import
  (needed for image upload). Installed and verified with the tests.
- **Choice:** used `argon2-cffi` directly instead of `passlib`, which is unmaintained and breaks with current `bcrypt`.

## 4. Environment surprises
- **Port 8000 was already taken** by an unrelated service on the dev machine (its `/health` answered with a different payload).
  We would have talked to the wrong server. **Fix:** this backend defaults to port **8787**.
- Python 3.14 is the system default; `uv` tried to download 3.12 and write to a protected cache. Used the system Python with a venv.
- The Expo template includes a `.vscode/` folder that the sandbox refuses to write, so `create-expo-app` failed. Copied the template
  files manually (without `.vscode`).

## 5. Mobile app
- **Wrong: NativeWind dark mode on web.** With the default `darkMode: "media"`, NativeWind threw "Cannot manually set color scheme"
  on load. Switching to `class` fixed the crash but then `dark:` styles never applied on web, because NativeWind only learns its class
  name after the CSS loads. **Fix:** toggle the `dark` class from `prefers-color-scheme` inside an effect. A harmless library message
  about "media" still appears in the web dev console.
- **Wrong: layout on web.** Reanimated's `Animated.View` ignored `flex: 1`, so the 2-column grid had uneven columns. **Fix:** a plain `View`
  carries the sizing and the animation wraps inside it. Also pad odd-length lists with an empty cell.
- **Wrong: invented API.** Called `StyleSheet.setFlag` from NativeWind. TypeScript said it doesn't exist; it was ignored for one run and
  the app crashed on load. Reverted.
- **Wrong: stale preview.** The dev server was started with `CI=1`, which disables reloading, so several fixes looked like they did nothing.
  Removed `CI=1`.
- Contrast bug: swap status pill built its classes by string-splitting, which put a light-mode background class on dark-mode text. Rewritten
  with explicit background and text classes.
- Expo's `expo install` needs a network host the sandbox blocks, so package versions came from `expo/bundledNativeModules.json`.

## 6. Still to verify by hand
Physical phone via Expo Go, Google sign-in with real client IDs, camera roll upload on a device.
(Swap propose and accept, wanted, edit, mark sold, delete, filters, sign out and register were all run end to end in the web UI.)

## 7. Demo polish pass
- **Wrong: cache cleared on sign-in.** Every POST cleared the read cache, including login and the live price suggestion, so the first
  screen after signing in paid ~1.3 s of database round trips. **Fix:** only data-changing POSTs clear it, and the home feed is re-warmed
  in the background after a write.
- **Wrong: browser confirm dialogs.** Delete and sign out used `window.confirm` on web. Replaced with one in-app dialog for all platforms.
