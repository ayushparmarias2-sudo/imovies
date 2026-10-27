# iMovies — Movie Ticket Booking Made Simple

MERN movie-ticket-booking platform (B.Tech CSE project): browse movies, pick a show, choose seats on a live seat map, reserve (with a hold timer), pay with a **simulated** checkout, get a ticket and notifications, cancel under explicit rules — plus an admin dashboard.
**Status:** Phases 1–6 complete. See [`PROJECT_STATUS.md`](PROJECT_STATUS.md) for exact verification results and the list of unverified items, and [`PREVIEW_STATUS.md`](PREVIEW_STATUS.md) for how to preview it.
**Payments are demonstrations only.** No card data is requested, stored or transmitted; nothing here is PCI-relevant and it must not be presented as a real payment flow.

## Repository layout
```
server/   Express + Mongoose API, Socket.IO, Jest tests, seed scripts      (own package-lock.json)
client/   React 19 + Vite + Bootstrap 5 SPA, Vitest tests                  (own package-lock.json)
e2e/      Playwright browser, accessibility (axe) and responsive tests     (own package-lock.json)
package.json   convenience scripts that delegate to the three packages
```

## 1. Prerequisites (versions actually used)
| Tool | Version | Notes |
|---|---|---|
| Node.js | **`^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0`** (see below) | npm 10; `.nvmrc` pins `22`. **Tested only on 22.22.2** |
| MongoDB | 6+ (tested on **7.0.34** earlier and **8.3.7** in the post-audit run) | **must be a replica set** (transactions) |
| Chromium | any recent | only for `e2e/` (see §7) |

**Why this Node range?** It is derived from the engines declared in the three lockfiles, not guessed: the client test stack needs it (`jsdom@30.1.3` → `^22.22.2 || ^24.15.0 || >=26.0.0`, `vitest@5.0.5` → `^22.12.0 || ^24.0.0 || >=26.0.0`, `undici@8.12.3` → `>=22.19.0`), the E2E axe package needs `>=22.12.0`, and the server needs at least `^20.19.0 || ^22.13.0 || >=24` (`eslint@10`, `mongodb@7`). The intersection on maintained LTS lines is the range above, declared identically in the root, `server`, `client` and `e2e` `package.json` files (and mirrored in each lockfile's root entry). Node 18 and 20 are **not** supported (Node 18 fails the engines of most dependencies; Node 20 meets some but is end-of-life and fails the client test stack). Node 24.15+ and 26 satisfy the declared engines but have **not been run** here. There is no CI configuration in this repository; if you add one, use Node 22.22.2 or newer.

### MongoDB replica set (required)
Seat reservation, payment and cancellation use multi-document transactions, which MongoDB only allows on a replica set. Pick one:
- **MongoDB Atlas free tier (M0)** — already a replica set. Easiest.
- **Local mongod:**
  ```bash
  mkdir -p ~/mongo-data
  mongod --replSet rs0 --dbpath ~/mongo-data --port 27017 --bind_ip 127.0.0.1   # keep running
  cd server && npm run db:init-replset                                         # once; prints "Replica set rs0 initiated."
  ```
  Windows: `mongod --replSet rs0 --dbpath C:\mongo-data`, then the same init command (not tested on Windows).
- **Docker:** `docker run -d --name mongo -p 27017:27017 mongo:7 --replSet rs0` then `npm run db:init-replset` (not tested).

Connectivity check: start the API and open `http://localhost:5000/api/health` → `{"data":{"status":"ok","db":"connected"}}`.

## 2. Environment configuration
Copy `server/.env.example` to `server/.env` and edit (never commit `.env`; only placeholders are tracked).

| Variable | Required | Meaning |
|---|---|---|
| `MONGO_URI` | yes | e.g. `mongodb://127.0.0.1:27017/imovies?replicaSet=rs0` or the Atlas SRV string |
| `JWT_SECRET` | yes | ≥ 32 random chars: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `CLIENT_ORIGIN` | yes | comma-separated allowed frontend origins (CORS + CSRF Origin check + Socket.IO), default `http://localhost:5173`. Each entry must be a plain origin such as `https://app.example.com` (no path, no `*`); entries are normalised and **startup fails** on invalid ones |
| `NODE_ENV`, `PORT` | no | `development` / `5000` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | for admin | used by `npm run seed` / `create-admin` to create the **first** admin (same password rules as registration: 8–72 chars, a letter and a number). Nothing is hard-coded. See *Admin bootstrap* below |
| `SEED_CUSTOMER_EMAIL/PASSWORD` | no | optional demo customer; ignored when `NODE_ENV=production` |
| `COOKIE_SAMESITE`, `COOKIE_SECURE`, `TRUST_PROXY` | prod | production defaults to `SameSite=None; Secure` (cross-site hosting); startup fails if `none` is used without `Secure`. Set `TRUST_PROXY=true` behind a proxy/host load balancer |
| `SEAT_HOLD_MINUTES` (10), `MAX_SEATS_PER_BOOKING` (8), `CANCEL_CUTOFF_HOURS` (2), `CLEANUP_INTERVAL_MS` (60000), `TZ_OFFSET_MINUTES` (330), `BCRYPT_ROUNDS` (12) | no | tunables |
| `AUTH_RATE_LIMIT_MAX` (20 / 15 min), `RESERVE_RATE_LIMIT_MAX` (30 / min) | no | rate limits per client IP (raise only for load/e2e tests) |
| `SMTP_URL`, `EMAIL_FROM` | no | optional email: unset = skipped; `json` = build messages without sending (demo); else a nodemailer URL such as `smtps://user:pass@smtp.host:465` |

Frontend (`client/.env.example`): `VITE_API_URL` — leave empty in development (Vite proxies `/api` and `/socket.io` to `VITE_PROXY_TARGET`, default `http://localhost:5000`, so cookies stay same-origin). Set it to the full API base (e.g. `https://api.example.com/api`) at **build time** for a separately hosted backend.

## 3. Install, seed, run
Install from the committed lockfiles (`npm ci`, not `npm install`):
```bash
npm run install:all          # or: (cd server && npm ci) && (cd client && npm ci) && (cd e2e && npm ci)
cp server/.env.example server/.env   # edit JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, MONGO_URI
cd server && npm run seed    # admin + 8 movies + 3 theaters + 90 shows with seat inventory (idempotent)
npm run dev                  # API  http://localhost:5000
cd ../client && npm run dev  # app  http://localhost:5173
```
**Admin bootstrap (fail-closed).** `ADMIN_EMAIL`/`ADMIN_PASSWORD` only ever *create* the first admin. If no account has that email, it is created as `ADMIN`. If it already belongs to an `ADMIN`, nothing is changed (no password reset). If it already belongs to a `CUSTOMER` — for example someone registered that address before you ran the command — the command **aborts with an error and changes nothing**: the account is not promoted and its password is untouched, because promoting it would give admin rights to whoever knows that customer's password. Resolve it deliberately: set `ADMIN_EMAIL` to an unused address, or delete the unwanted account directly in the database, then re-run. There is no API endpoint for promoting users or resetting admin credentials. Run bootstrap **before** exposing the API publicly.

**Movie posters.** The eight seeded demo movies are fictional and ship with original poster artwork: static SVG files in `client/public/posters/<slug>.svg`, referenced by root-relative paths (`/posters/midnight-monsoon.svg`), so they load from the app's own origin with nothing hotlinked. Running `npm run seed` on a database seeded by an older version fills in missing posters for these titles (it never overwrites a poster someone already set). In the admin movie form, `Poster image` accepts an `https://…` URL (use only images you have the right to use) or a `/posters/<file>.(svg|png|jpg|jpeg|webp|avif)` path for files you add to `client/public/posters/`; the API rejects every other scheme or path. There is no image upload feature. A movie without a poster (or whose image fails to load) shows a generated gradient placeholder.

Seeding safety: `npm run seed` never overwrites existing data; `npm run seed:reset` wipes catalogue/bookings/payments/notifications (keeps users) and **refuses to run with `NODE_ENV=production`** unless `--yes-wipe-production` is passed. Seeded shows are generated for the next 5 days; re-run `seed:reset` in development when they have passed.

## 4. Scripts
| Where | Command | Purpose |
|---|---|---|
| root | `npm run lint` / `test` / `build` / `test:e2e` | run the same command in each package |
| server | `npm run dev` · `start` · `seed` · `seed:reset` · `create-admin` · `db:init-replset` · `lint` · `test` | |
| client | `npm run dev` · `build` · `preview` · `lint` · `test` | `preview` serves the build on :4173 with the same proxy |
| e2e | `npm test` · `lint` | needs the stack running (see §7) |

## 5. Socket.IO, CORS and API URL
- Seat updates: clients join a per-show room and receive `seats:update {showId}` then refetch. The seat page also polls every 15 s as a fallback (verified by blocking sockets in the browser tests).
- Every browser origin that talks to the API must be listed in `CLIENT_ORIGIN` (used for CORS with credentials, the CSRF `Origin` check on unsafe requests — see §9 — and Socket.IO CORS). A wrong value shows up as `403 Origin not allowed`, `403 Origin header required…`, or missing cookies. Behind a proxy or rewrite, the browser's `Origin` is the **frontend's** origin (the proxy must not strip it).
- Reverse proxies must forward WebSocket upgrades for `/socket.io/`; otherwise Socket.IO silently falls back to long-polling and the 15 s poll.
- Socket.IO runs in the API process (single instance). Scaling to several instances would need a shared adapter (e.g. Redis) — not implemented.

## 6. Production build and deployment (not performed — nothing is deployed; no live URLs exist)
Deploy the three parts separately. All persistent state lives in MongoDB; the API and frontend are stateless and write nothing to disk.

**Database — MongoDB Atlas M0 (free):** create a cluster → Database Access: create a user → Network Access: allow your backend's egress IPs (free hosts often need `0.0.0.0/0`; use a strong password) → copy the SRV connection string and add the database name, e.g. `mongodb+srv://USER:PASS@cluster.example.mongodb.net/imovies?retryWrites=true&w=majority`. M0 has a 512 MB quota and no guaranteed backups. Seed once from your machine with `MONGO_URI` pointing at Atlas and `NODE_ENV=production` (`ADMIN_EMAIL`/`ADMIN_PASSWORD` set; no demo customer is created).

**Backend — any Node host (Render, Railway, Fly, a VPS):** root directory `server`, build `npm ci`, start `npm start`, health check `/api/health`. Set `NODE_ENV=production`, `MONGO_URI`, `JWT_SECRET`, `CLIENT_ORIGIN=https://<your-frontend-origin>`, `TRUST_PROXY=true` (and optional `SMTP_URL`). Free tiers sleep when idle, so the first request is slow and the 60 s expiry job pauses while asleep (expired holds are still treated as free and cleaned lazily).

**Frontend — Vercel / Netlify / Cloudflare Pages:** root directory `client`, build `npm run build`, output `dist`, env `VITE_API_URL=https://<backend-host>/api` (set at build time). SPA fallback files are included (`client/vercel.json`, `client/public/_redirects`).

**Cookies across hosts:** with different registrable domains the session cookie is third-party (`SameSite=None; Secure`, HTTPS required on both). Some browsers block third-party cookies, which would break login. Prefer the same site — e.g. `app.example.com` and `api.example.com` (same registrable domain) — or serve both behind one domain.

## 7. Testing
| Check | Command | Needs |
|---|---|---|
| API unit/integration (**150 tests, 12 suites**) | `cd server && npm test` | Node; starts an in-memory MongoDB replica set (downloads a binary once). Offline/blocked? use `MONGOMS_SYSTEM_BINARY=/path/to/mongod npm test` or `TEST_MONGO_URI="mongodb://127.0.0.1:27017/?replicaSet=rs0" npm test` (throw-away databases) |
| UI unit (19 tests) | `cd client && npm test` | Node |
| Lint | `npm run lint` (root) | ESLint 9 in client (incl. `jsx-a11y`), ESLint in server/e2e |
| Production build | `cd client && npm run build` | |
| Browser end-to-end, accessibility, responsive (36 tests) | see below | running stack + Chromium |

**Browser tests (`e2e/`)** run against the real stack and real MongoDB, so start it first (rate limits raised because the tests register many users):
```bash
# terminal 1: mongod replica set running; then
cd server && AUTH_RATE_LIMIT_MAX=5000 RESERVE_RATE_LIMIT_MAX=5000 SMTP_URL=json \
  CLIENT_ORIGIN=http://localhost:5173,http://127.0.0.1:4173 npm run seed && npm start
# terminal 2
cd client && npm run build && npm run preview -- --host 127.0.0.1      # http://127.0.0.1:4173
# terminal 3
cd e2e && npx playwright install chromium
E2E_ADMIN_EMAIL=<seeded admin email> E2E_ADMIN_PASSWORD=<seeded admin password> npm test
```
Optional variables: `E2E_BASE_URL` (default `http://127.0.0.1:4173`), `E2E_CHROMIUM_PATH` (use an existing Chromium instead of `playwright install`), `E2E_SHOTS_DIR` (save responsive screenshots). The suites: `customer` (journey, failed payment, cancellation window), `concurrency` (two browsers/same seat, simultaneous reservations and payments, Socket.IO push, polling fallback), `admin` (real endpoints for anonymous/customer/admin + dashboard movie/theater CRUD and show create/delete with confirm dialogs), `a11y` (axe WCAG 2.2 AA scans + keyboard tests), `responsive` (360/390/768/1366/1440 px). The tests create their own users, theaters and shows (names `E2E …`), so use a disposable database.

## 8. API summary (base `/api`, JSON `{success, data | message, errors?}`)
| Method & path | Access | Notes |
|---|---|---|
| `POST /auth/register`, `/auth/login` | public, rate-limited | HTTP-only `token` cookie; role never accepted from input |
| `POST /auth/logout`, `GET /auth/me` | cookie | |
| `GET /movies`, `/movies/genres`, `/movies/:id` | public | `search, genre, status, availability=withShows, page, limit` |
| `POST/PUT/DELETE /movies[/:id]` | admin | delete blocked while shows exist |
| `GET /theaters[/:id]`; `POST/PUT/DELETE` | public / admin | screens locked once shows exist |
| `GET /shows`, `/shows/:id`, `/shows/:id/seats` | public | `movie, theater, date=YYYY-MM-DD`; seat map has status/price/`heldByYou` |
| `POST /shows`, `DELETE /shows/:id` | admin | creation validates date/overlap **inside a transaction serialised per screen** (409 on overlap) and generates seat inventory; delete is refused (409) once bookings exist. There is **no** show-edit or cancel-whole-show endpoint |
| `POST /bookings/reserve` | customer | `{showId, seats:["A1","A2"]}` — transactional, all-or-nothing |
| `GET /bookings/mine`, `GET /bookings/:id` | owner (admin any) | detail includes `payments[]`, `cancellation` |
| `POST /bookings/:id/release` · `/pay` · `/cancel` | owner | `pay` body `{outcome:"SUCCESS"\|"FAILURE"}` (simulated) |
| `GET /notifications`, `POST /notifications/read-all`, `POST /notifications/:id/read` | customer | `meta.unread` |
| `GET /admin/stats`, `GET /admin/bookings`, `POST /admin/bookings/:id/cancel` | admin | admin cancel may override the cut-off |

## 9. Security notes
### CSRF model (cookie authentication, no CSRF token)
The session is an HTTP-only cookie (`SameSite=Lax` in development, `SameSite=None; Secure` by default in production for cross-site hosting). Because `SameSite=None` does not stop cross-site requests, the API enforces strict `Origin` validation on every **unsafe** method (anything but `GET`/`HEAD`/`OPTIONS`):
1. If an `Origin` header is present it must **exactly equal** one normalised entry of `CLIENT_ORIGIN` (`null`, look-alike hosts, other ports/schemes, trailing slashes and comma lists are all rejected with 403).
2. If the request carries the auth cookie it **must** carry an allowed `Origin` — a cookie-bearing mutation without `Origin` is rejected (403 `Origin header required`). Browsers always send `Origin` on cross-origin `POST/PUT/PATCH/DELETE` and on same-origin `fetch()` calls of those methods, so the SPA (including through the Vite/host proxy) is unaffected; this was exercised with real Chromium in the E2E suite.
3. A request with **neither** `Origin` nor the cookie has no ambient credential to abuse (the API accepts no other credential: no bearer tokens, no API keys), so scripts can still call the public endpoints (login/register) and receive 401 on protected ones. There is no other supported non-browser client path.
4. Safe methods are never blocked by this check (they must not change state); CORS still withholds foreign pages from reading responses. Authentication and authorisation run separately afterwards and are unaffected by it.

Assumptions: the frontend origin(s) are listed exactly in `CLIENT_ORIGIN`; browsers are modern (send `Origin` on unsafe requests); proxies forward `Origin` unchanged; you do not add other cookie-authenticated clients. A double-submit/synchroniser CSRF token was considered and not adopted because the Origin policy already closes the missing-header gap without changing the client; it can be added later as defence in depth.

### Show scheduling concurrency
MongoDB cannot express "no two time ranges overlap" as a unique index, so `createShow` serialises per screen: each screen (theater + screen name) has one lock document (`ScreenSchedule`). Inside the transaction (snapshot read concern, majority write concern) the service (1) increments that document's `version`, (2) re-reads the movie/theater and runs the overlap query with the same session, then (3) inserts the show and its seats. Snapshot isolation gives first-committer-wins on the lock document: a competing creation either committed before our snapshot (its show is visible to our overlap query → 409) or is in flight/committed afterwards (our `$inc` fails with a WriteConflict, a `TransientTransactionError`; the transaction is aborted and re-run in a fresh snapshot that sees the winner → 409). Retries are bounded (5 attempts with jittered backoff; commit-result-unknown retries the commit only, 3 times); if contention persists the API answers 409 rather than ever committing without the check. A failed transaction rolls back the lock increment, show and seats together. Different screens use different lock documents and do not contend. Assumptions: MongoDB is a replica set; all show creation goes through `createShow`; the unique indexes (`ScreenSchedule` on theater+screen, `Show` on theater+screen+start) exist (Mongoose builds them at startup). Show *deletion* only frees time, so it needs no lock.

### Other controls
bcryptjs hashing; JWT only in an HTTP-only cookie (never in a response body); role always read from the database; zod validation on every input with unknown fields stripped and operator objects rejected; 50 KB body limit; Helmet headers; CORS allow-list with credentials plus an `Origin` check on mutating requests; rate limits on auth and reservation; generic login errors with a cached dummy bcrypt hash generated at the **configured** work factor (unknown-email logins cost the same as wrong-password logins; verified by tests of configuration and behaviour, not wall-clock timing); fail-closed admin bootstrap (above); generic 500 responses (no stack/internals); prices/totals/ownership/state transitions computed or enforced on the server; admin routes protected server-side (the UI guard is cosmetic); startup refuses missing/short secrets. Not covered: CSRF tokens (relies on SameSite + the strict Origin policy above), account lockout/MFA/password reset, per-account rate limits, dependency auto-updates.

## 10. Troubleshooting
| Symptom | Cause / fix |
|---|---|
| `Transaction numbers are only allowed on a replica set member` | MongoDB is standalone → start with `--replSet rs0` and run `npm run db:init-replset`, or use Atlas; URI needs `?replicaSet=rs0` locally |
| `ECONNREFUSED 127.0.0.1:27017` / health shows `db: disconnected` | mongod not running or wrong `MONGO_URI` |
| `Invalid environment configuration … JWT_SECRET` | secret missing or < 32 chars |
| `403 Origin not allowed` / `403 Origin header required…`, or login works but you stay logged out | frontend origin missing from `CLIENT_ORIGIN`; in production check HTTPS, `COOKIE_SAMESITE=none`, `COOKIE_SECURE=true`, `TRUST_PROXY=true`, and third-party-cookie blocking (see §6) |
| `429 Too many attempts` while testing | auth rate limit (20 / 15 min per IP) — wait or raise `AUTH_RATE_LIMIT_MAX` for tests |
| Seat map updates only every 15 s | WebSocket blocked by a proxy; allow upgrades on `/socket.io/` |
| `mongodb-memory-server` cannot download a binary | use `MONGOMS_SYSTEM_BINARY` or `TEST_MONGO_URI` (§7) |
| Playwright: browser not found | `npx playwright install chromium` or set `E2E_CHROMIUM_PATH` |
| e2e: `Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD` | pass the credentials you seeded |
| `create-admin`/`seed` abort with "…already exists with role CUSTOMER… NOT promoted" | someone registered `ADMIN_EMAIL` first; see *Admin bootstrap* in §3 |
| Creating a show returns 409 "overlapping" or "being changed by another request" | the screen already has a show in that window (duration + 15 min cleaning buffer), or two admins raced; retry with a different time |
| Empty catalogue / no shows | run `npm run seed`; seeded shows only cover the next 5 days (`seed:reset` in development) |
| `EADDRINUSE :5000` | another process uses the port; change `PORT` (and `VITE_PROXY_TARGET`) |

## 11. Manual QA checklist (each item also has an automated browser test unless marked manual)
- [ ] Register / login / bad login / logout · browse, search, filter · pick show · seat selection with legend
- [ ] Reserve → booking page with countdown · pay (success) → ticket, SIM reference, notification + navbar badge · pay (fail) → failure screen, seats released
- [ ] Cancel (≥ 2 h ahead) → refunded; inside the window the button is disabled with the reason
- [ ] Two browsers on one seat → one winner, clear conflict message · live update without reload · polling fallback
- [ ] Customers get "Admins only" and 403 from admin APIs; admin movie/theater CRUD and show create/delete with confirmation dialogs
- [ ] **Manual:** look at the app on a real phone and with a screen reader (NVDA/VoiceOver) — automated axe + keyboard tests do not replace this
- [ ] **Manual:** real SMTP delivery with your provider; deployment to your hosts

## 12. Known limitations
**Show management is create and delete only.** Admins can create shows (overlap-checked) and delete shows that have no bookings. **Editing a show is not implemented**, and **there is no whole-show cancellation flow** (cancelling a show and refunding/notifying its bookers); a show that has any booking record (even a cancelled one) can never be deleted, so there is currently no supported way to withdraw a booked show; no user-management or password-reset UI; Socket.IO is single-instance; admin lists are paginated/limited (movies 10/page, next 100 shows); native `window.confirm` dialogs are used for destructive actions (accessible and keyboard-dismissible, but not custom-styled); seed movies have no poster images (a generated placeholder is shown).
