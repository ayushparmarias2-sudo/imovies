# PROJECT_STATUS — iMovies

_Phase 5 section below is historical. **Phase 6 is complete — see the Phase 6 final report, then the "Post-audit remediation" section at the very end (it supersedes older statements about show overlap checking, Node versions and test counts).**_

## Completed
- **Phases 1–3 (backend)** – models, auth (JWT HTTP-only cookie), seeds, catalogue APIs + admin CRUD, SeatInventory with unique `{show,label}`, transactional all-or-nothing reservation, release, expiry (lazy + 60 s job), ownership checks.
- **Phase 4 (frontend)** – catalogue/search/filters, movie details + showtimes, login/register, seat selection, reservation page.
- **Phase 5 backend** – `POST /bookings/:id/pay` (simulated; stores `Payment` attempts; atomic confirm or atomic fail+release; double/concurrent pay safe), `POST /bookings/:id/cancel` (CONFIRMED only, cut-off `CANCEL_CUTOFF_HOURS`=2, seats freed, payment REFUNDED), booking detail with `payments[]` + `cancellation` info, admin `GET /admin/stats`, `GET /admin/bookings`, `POST /admin/bookings/:id/cancel` (override), notifications API (list/unread/read/read-all), optional Nodemailer email (`SMTP_URL`, `json` demo mode, failures never break bookings), Socket.IO `seats:update` per-show rooms.
- **Phase 5 frontend** – Checkout (demo banner, no card fields, success/failure choice), booking page states (pending / confirmed with ticket, payment info and cancel with rules / failed screen / cancelled / expired), Notifications page + navbar unread badge, Socket.IO live seat updates (15 s polling fallback), Admin dashboard (stats, movies, theaters, shows, bookings; validation, confirm-before-delete, empty/error states), `AdminRoute`.

## Not started (Phase 6)
Browser-based testing, responsive/accessibility pass verified in a real browser, ESLint, deployment docs (Atlas + Render + Vercel) and a final QA run.

## Verification actually performed (sandbox, Node 22, mongod 7.0.34 via conda)
| Check | Result |
|---|---|
| Server `npm test` (Jest + Supertest, in-memory 1-node replica set) | **5 suites / 48 tests passed** (33 earlier + 15 new: pay success/failure, invalid input/ownership, client prices ignored, expired pay, sequential + concurrent double pay, cancellation + refund, cut-off window + admin override, email SKIPPED/SENT/FAILED, notification endpoints, admin bookings/stats, Socket.IO events) |
| Client `npm test` (Vitest + Testing Library) | **18 tests passed** (9 new: checkout demo labelling/no card fields/payload, redirect when not pending, booking states, cancel confirm, disabled cancel with reason, failure screen, AdminRoute, admin cancel confirm, delete-409 message) |
| Client `npm run build` | succeeded (JS 357 kB / 108 kB gzip) |
| Real stack (real mongod replica set → Express with `SMTP_URL=json` → `vite preview` proxy) via curl + a Socket.IO client | failed payment → FAILED, seats freed · success → CONFIRMED, `SIM-…` ref, 2 seats BOOKED · re-pay 409 · other user blocked from booked seat · notifications `BOOKING_CONFIRMED/SENT`, `PAYMENT_FAILED/SENT` · customer → `/admin/stats` 403 · admin stats/bookings OK · other user cancel 404 · owner cancel → CANCELLED, seats freed, payment REFUNDED · **5 live `seats:update` events received through the proxy for 5 seat-changing actions** |
| Fresh unzip: `npm ci`, client build + tests, server tests | **Passed**: client `npm ci` + build + 18/18 tests; server `npm ci` + 48/48 tests (payments + booking suites also repeated 4× with no failures) |

## Known issues / limitations
1. **No real browser was available.** The UI (layout, responsiveness, keyboard use, visual polish, admin forms in practice) was verified only by jsdom component tests, the production build and HTTP/WebSocket-level checks. Please click through the README QA checklist.
2. Unverified: MongoDB Atlas, Windows, Docker instructions, `npm run dev` watch mode, real SMTP delivery (only `json` transport and mocked failure were exercised), the 60 s cleanup timer itself, rate limiting, mongodb-memory-server's own binary download (sandbox used a system mongod via `MONGOMS_SYSTEM_BINARY`).
3. Jest needs `runtimeAdapters: { os }` in `server/tests/helpers.js` (driver 7 + Jest VM); production unaffected.
4. _(Superseded by the post-audit remediation: the overlap check is now transactional and serialised per screen.)_ Shows cannot be edited (create/delete only) and cannot be deleted once any booking exists; there is no "cancel whole show" flow.
5. Admin lists: movies paged by 10, shows limited to the next 100 upcoming, no user management UI.
6. Notification/email creation is best-effort after commit (by design) and not transactional with the booking.
7. Seed movies have no poster URLs (gradient fallback shown). Max seats (8) is duplicated as a client constant; the server is authoritative.
8. No ESLint config yet.

## Next exact steps (Phase 6)
1. Run the app locally and walk the README QA checklist in a real browser (Playwright on your machine: customer journey, two-browser seat conflict, admin CRUD); fix defects found.
2. Responsive + accessibility pass (mobile seat map, focus order, contrast), add ESLint (client + server) and fix findings.
3. Deployment docs verified step by step: MongoDB Atlas M0, backend on Render/Railway (`COOKIE_SAMESITE=none`, `COOKIE_SECURE=true`, `TRUST_PROXY=true`, `CLIENT_ORIGIN`), frontend on Vercel/Netlify (`VITE_API_URL`), seed on the hosted DB. Do not claim live URLs until they exist.
4. Optional: show editing / cancel-show flow, user management, poster upload or curated poster URLs, CSV export of bookings.


---
# PHASE 6 — FINAL REPORT (browser QA, bug fixes, lint, accessibility, responsive, security, deployment docs)

**Status: complete for everything feasible in this environment.** Every item not verified is listed under "Unverified". No critical regression is open.

## Baseline (re-run before any change) vs final
| | Baseline (Phase 5, re-run) | Final (fresh unzip of `imovies-phase6.zip`) |
|---|---|---|
| Server tests (Jest + Supertest, real MongoDB 7.0.34 replica set) | 48 / 5 suites | **60 / 7 suites** (+12: rate limits, CORS, headers, cookie flags, forged JWTs, config validation, generic 500s, operator injection) |
| Client tests (Vitest) | 18 | **19** (+1 regression test for the badge bug) |
| ESLint | none configured | **clean** in `server`, `client` (incl. `jsx-a11y`), `e2e` |
| Browser tests (Playwright, headless Chromium 153) | none | **36 / 36**: customer 5, admin+authorization 6, concurrency/real-time 7, accessibility 8, responsive 10 |
| `npm audit --omit=dev` | – | 0 vulnerabilities in all three packages |
| Client production build | ok | ok |

## Commands executed (all from a fresh extraction of the ZIP unless noted) and results
- `npm ci` in `server`, `client`, `e2e` → ok (0 vulnerabilities each)
- `npx eslint .` ×3 → clean · `cd client && npm run build` → ok · `cd client && npx vitest run` → 19 passed
- `cd server && MONGOMS_SYSTEM_BINARY=<mongod 7.0.34> npm test` → 60 passed (7 suites)
- Real stack on a brand-new database: mongod replica set + `npm run seed` (8 movies, 3 theaters, 90 shows) + API + `vite preview`, then `cd e2e && npx playwright test` in 3 chunks (the sandbox's 300 s command limit) → customer+admin 11/11, concurrency+a11y 14/15 on the first fresh run (1 axe flake, below), after the fix a11y 8/8 (admin test 3× in a row) + responsive 10/10, concurrency 7/7.
- Earlier on the working tree: concurrency/payment suites repeated several times without failure.
- Mutation checks: with the error handler leaking messages, and with the auth limiter ignoring its limit, the new security tests **failed** as they should; code restored (no diff).
- Restart/recovery check (manual script, reproduced below): see "Recovery".

## Bugs and defects found, fixes, regression tests
1. **Navbar unread badge stayed at "1" after "Mark all read"** (real-browser test). Cause: badge refetched only on route change. Fix: `notifications:changed` event + refetch on tab visibility. Regression: `client/src/test/phase6.test.jsx` (verified to FAIL without the fix) and the customer e2e journey.
2. **Admin tables overflowed the page on phones** (461 px in a 360 px viewport). Cause: the absolutely-positioned `.visually-hidden` "Actions" header escaped the scroll container. Fix: `.table-responsive { position: relative }`. Regression: responsive e2e (all admin tabs, 5 viewports).
3. **Accessibility defects (axe + keyboard tests)**: `.text-secondary` and outline buttons below 4.5:1 contrast on the dark theme; movie-card and seat-button accessible names not containing the visible text; invalid ARIA (`li` inside `tablist`) in the admin tabs → proper WAI-ARIA tabs with arrow/Home/End keys; skip link did not move focus; same `<title>` on every page; seat states relied on colour only (pattern/dash/check mark added); `prefers-reduced-motion` support added; focus moves to `<main>` on route change.
4. **Code-quality (ESLint)**: synchronous `setState` in effects refactored in `useApi`, `Countdown`, `Navbar`, `SeatSelection` (no rule disabled globally; one justified inline disable in `Countdown`); dead code removed (`effectiveStatus`, unused imports/assignments).
5. **Hardening**: `seed:reset` now refuses `NODE_ENV=production` without `--yes-wipe-production` (checked before connecting); e2e helpers no longer contain a default admin password.
6. **Test-quality issues found in my own tests (not app bugs)**: the "polling fallback" test could pass without exercising the poll (it raced the login-triggered refetch) → now asserts the seat stays stale for 4 s with sockets blocked, then refreshes by poll (~17 s); e2e tests made self-isolating (own theater+show per test); `genre[$ne]` expectation corrected (Express 5 never builds operator objects; asserted as ignored); an axe scan once measured a mid-transition colour blend on tab buttons (flake) → scans now run with reduced motion so settled states are measured.
7. **No data-integrity, authorization, payment-state, seat-conflict or cancellation defects were found** by the browser/API/concurrency tests.

## Browser and viewport coverage (headless Chromium 153 via Playwright; real API + real MongoDB)
- Customer: register/login/bad login/logout, search → movie → show → seat selection → reserve → checkout → success ticket (reference, payment), failed payment, booking history, notifications + unread badge, cancel + refund, cancellation cut-off (button disabled with reason, API 409, admin override), other-user access (404), reload persistence.
- Concurrency/recovery: two independent browser contexts on one seat (stale-map conflict message and live-pruned selection), simultaneous reservations (no partial holds), 4 simultaneous payments of one booking (exactly one 200), re-pay of confirmed/failed bookings (409), Socket.IO push (<5 s) and cancel re-opening seats, polling fallback with sockets blocked.
- Authorization/admin: anonymous → 401 and customer → 403 on every admin/protected endpoint (HTTP level, not only hidden links), UI "Admins only", forged/invalid input (operator objects, bad JSON, 80 KB body, foreign Origin, bad ids), dashboard stats, movie and theater create-edit-delete, show create/delete (shows have no edit), all with dismiss/accept confirmation, movie-with-shows delete refused, admin bookings filter + cancel.
- Viewports: 360×800, 390×844, 768×1024, 1366×768, 1440×900 — no horizontal overflow on customer or admin pages, nav collapses/expands, seat targets ≥ 24 px with spacing, tables scroll inside their container. Mobile seat map and admin form screenshots were inspected by eye.

## Accessibility results
- axe-core (WCAG 2.0/2.1/2.2 A + AA tags): **0 violations** on home, movie, login, register (with error), seat selection, booking (pending/confirmed/failed/cancel-disabled), checkout, my bookings, notifications, 404, and every admin tab and form.
- Keyboard tests: skip link, route-change focus + unique titles, seat selection by Tab/Space/Enter with visible focus ring and announced state, mobile menu by keyboard, status/alert regions for async results (the hold countdown is deliberately not a live region).
- Destructive confirmations use native `window.confirm` (keyboard operable, focus managed by the browser); no custom modal exists.
- **Not replaced:** manual screen-reader testing (see Unverified).

## Security review (details in README §9)
No secrets are tracked (only `.env.example` placeholders; fixture passwords in tests are throwaway). No request bodies/headers/cookies are logged. Verified by tests: cookie HttpOnly/SameSite/Path, no JWT in bodies, Helmet headers, CORS allow-list (unknown origin gets no CORS headers), forged / alg=none / deleted-user tokens rejected, role from DB not token, rate limits (auth 429 after limit, reservations), request-size limit, malformed JSON 400, generic 500, startup refuses missing/short secrets and `SameSite=None` without `Secure`, production cookie defaults. Remaining gaps are listed in README §9 (no CSRF tokens beyond SameSite+Origin, no MFA/lockout/password reset).

## Recovery (manual script, run once; not part of the automated suites)
Procedure: start API with `CLEANUP_INTERVAL_MS=2000`; as one user create a confirmed booking and a pending booking; attach a Socket.IO client joined to the show; `kill -9` the API and start it again. Results: booking/payment/seat state **byte-identical** before and after; the same session cookie still authenticated (stateless JWT); after setting the pending hold's expiry in the past the restarted server's cleanup job logged `[cleanup] expired 1 reservation(s)` and the seats were released (this verifies the cleanup timer, previously unverified); the socket client disconnected, reconnected ~2.6 s later, re-joined its room and received the subsequent `seats:update` events.

## Unverified (cannot be claimed as passed)
- Real mobile devices, Safari/Firefox, manual screen-reader use (NVDA/VoiceOver), real keyboard-only walkthrough by a person.
- Playwright's own bundled browser download (`npx playwright install chromium`) is blocked here; a Chromium packaged inside `@sparticuz/chromium` was used via `E2E_CHROMIUM_PATH`. The documented `playwright install` path was not run.
- MongoDB Atlas, Windows, Docker instructions; real SMTP delivery (only `SMTP_URL=json` and a mocked failure); any real deployment, cross-site cookies on real hosts, third-party-cookie blocking; `npm run dev` watch mode; `mongodb-memory-server`'s own binary download (system mongod used via `MONGOMS_SYSTEM_BINARY`).
- The restart/recovery procedure is manual (steps above), not automated.
- The final ZIP was rebuilt after a docs/spec-only edit following the last full browser run; its contents were diffed against the verified tree (see delivery note), not re-run end to end.

## Reproduce the results
See README §3 (install/seed/run) and §7 (tests, including the exact browser-test commands and env vars). Sandbox-specific: mongod 7.0.34 from conda-forge, Chromium from `@sparticuz/chromium`, tests run in chunks because of a 300 s command limit.

## Remaining limitations / possible next work
Show editing and a cancel-whole-show flow; user management and password reset; Redis adapter for multi-instance Socket.IO; custom accessible modal instead of `window.confirm`; real browser/screen-reader QA; deploying to real hosts and re-running the e2e suite against them.


---
# POST-AUDIT REMEDIATION (independent ZIP audit of 2026-10-24)

Scope: the six confirmed findings plus the documentation/packaging items from the audit. The original `imovies-phase6.zip` was left untouched; work was done in a copy and shipped as `imovies-phase6-fixed.zip`. **Status: fixed with validation limitations** (see "Not verified"). Not declared production-ready.

## Findings → repair → regression tests
| # | Finding (severity) | Repair | Tests added |
|---|---|---|---|
| 1 | Admin bootstrap promoted an existing account without touching its password (**High**) | `server/src/seed/ensureAdmin.js` is fail-closed: create only if absent; existing ADMIN untouched; existing CUSTOMER → abort with an actionable, secret-free error (no promotion, hash unchanged); duplicate-key races resolved by re-reading the winner; email/password validated and normalised with the registration schema; hashing via the shared helper. `createAdmin.js`/`seed.js` report the error and exit 1 before seeding anything. | `tests/adminBootstrap.test.js` (14): create, idempotent re-run (no reset), customer not promoted + hash identical, squatter stays 403 on admin routes, no secrets in errors, other customers unaffected, existing admin untouched, 8-way concurrent bootstrap ×8 rounds, bootstrap-vs-registration race ×12, and the real `create-admin` and `seed` scripts as child processes |
| 2 | Overlap check ran outside the transaction (**High**) | `server/src/services/showService.js`: per-screen lock document (`models/ScreenSchedule.js`) incremented inside the transaction before the overlap query; overlap query and all reads use the same session; bounded retry helper `utils/transaction.js` (5 attempts, jitter; commit-unknown retried 3×); persistent contention → 409; invariant explained in README §9. | `tests/showSchedule.test.js` (12): sequential overlap/adjacent/different screens, deterministic WriteConflict between two raw transactions, 6-way overlapping race ×20 rounds (exactly one commits), same race over HTTP, concurrent non-overlapping all succeed, different screens independent, rollback on failure leaves nothing, transient retry yields one show, retries bounded, no lock for bogus input |
| 3 | Dummy bcrypt hash used cost 4 (**Medium**) | New `utils/password.js`: `hashPassword` (configured rounds, used by register/seed/bootstrap) and a lazily generated, cached dummy hash at the configured rounds from a random password, warmed at startup; `bcrypt.compare` stays async; generic 401 unchanged. | `tests/loginTiming.test.js` (6): identical 401 bodies, both paths compare against cost == configured cost (suite runs at cost 5 so a hard-coded 4 would fail), cached not regenerated, default production cost 12 for dummy and real, follows custom `BCRYPT_ROUNDS`. No wall-clock assertions |
| 4 | Missing `Origin` accepted on unsafe requests (**Medium**) | `middleware/security.js`: exact-match normalised allowlist; any unsafe request with `Origin` must match; any unsafe request carrying the auth cookie must send an allowed `Origin`; cookie-less requests without `Origin` (public endpoints) still work; safe methods unaffected. `config/env.js` normalises `CLIENT_ORIGIN` and refuses invalid entries at startup. Model and assumptions in README §9. No client change needed (browsers send `Origin`). | `tests/csrf.test.js` (31): allowed/foreign/missing Origin per method, state unchanged on rejection, stale-cookie case, 9 look-alike origins, auth independence, login/register policy, safe methods, preflight, config normalisation/validation; e2e `admin.spec.js` gained a real-browser missing-Origin assertion. Existing tests now send `Origin` through `h.request` (they model the browser; no assertion was removed) |
| 5 | README said Node 18+ (**Low**) | `engines.node` = `^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0` in root, server, client, e2e `package.json` and mirrored in lockfile root entries (no dependency changes); `.nvmrc`; README §1 explains the derivation. No CI config exists in the repo. | `npm ci --dry-run` ×3 clean |
| 6 | Show-management docs overstated (**Low**) | README §8/§12, this file and PREVIEW_STATUS now say: create and delete only; no edit; no whole-show cancellation; deletion blocked by any booking record. | — |
| 7 | `.git/` in the ZIP (**Low**) | Final ZIP built from a clean file list (no `.git/`, `node_modules`, `.env`, logs, builds, test output). History scanned with Gitleaks 8.30.1: 12 commits, **no leaks** (default ruleset; not a guarantee for custom secret formats). | — |

## Files changed
`server/src/seed/ensureAdmin.js`, `createAdmin.js`, `seed.js` (bootstrap, error handling, shared hashing, lock cleanup on reset) · `server/src/services/showService.js`, `models/ScreenSchedule.js` (new), `models/index.js`, `utils/transaction.js` (new) · `server/src/utils/password.js` (new), `controllers/authController.js`, `server.js` (warm dummy hash) · `server/src/middleware/security.js`, `config/env.js` · tests: `adminBootstrap`, `showSchedule`, `loginTiming`, `csrf` (new), `helpers.js` (+`request`, `dbName`), small import changes in the other suites, `security.test.js` · `e2e/tests/admin.spec.js` · all `package.json` + three lockfile root entries (engines only) · `.nvmrc` · README/PROJECT_STATUS/PREVIEW_STATUS.

## Commands actually run (Node 22.22.2, npm 10.9.7, mongod 8.3.7 from conda-forge, Chromium from `@sparticuz/chromium`)
| Command | Result |
|---|---|
| `npm ci` (server, client, e2e) | succeeded |
| Baseline `cd server && npm test` on the original code | 60 / 60 passed (7 suites) |
| `cd server && npm test` (system mongod via `MONGOMS_SYSTEM_BINARY`) | **123 / 123 passed (11 suites)** |
| New suites run against the **original** four source files | failed as intended: showSchedule 6, csrf 7, loginTiming 1, adminBootstrap 6 failures; all passed again on the fixed code |
| `cd client && npm test` / `npm run build` | 19 / 19 passed; build ok |
| `npx eslint .` in server, client, e2e | clean ×3 |
| `npm run seed` (real CLI, fresh replica set) ×2 | 90 shows created; second run left the admin untouched |
| `cd e2e && npx playwright test` against real API + `vite preview` + replica set | **36 / 36 passed** (run with a sandbox-only config override adding Chromium flags `--no-zygote --headless=new`; not shipped) |
| `npm audit` | client 0, e2e 0, **server 1 high — see below** |
| `gitleaks git` (12 commits) | no leaks |

## Open items and assumptions
- **Server dependency advisory (not fixed, by instruction not to touch dependency versions):** `body-parser 2.0.0–2.3.0` (via Express) — high severity DoS on compressed request bodies (GHSA-27r3-jxmh-p828); `npm audit` reports a fix. Run `cd server && npm audit fix`, then re-run the suites. Recommended before any deployment.
- Not verified: Node 24/26 (engines satisfied, never run); Playwright's own browser download; Firefox/Safari; real devices; screen readers; real SMTP; Atlas/Windows/Docker; any hosted deployment, cross-site cookie behaviour on real hosts; a full manual accessibility pass. The ZIP-extraction check is reported in the delivery report because it can only be done after packaging.
- Show-schedule correctness relies on a replica set and on all creation going through `createShow`; the `ScreenSchedule` unique index is built by Mongoose at startup (first request before the index exists is a theoretical window on a brand-new database).
- CSRF relies on exact `CLIENT_ORIGIN` configuration, browsers sending `Origin`, proxies forwarding it, and the API having no non-cookie credential. No CSRF token.
- Login timing is equalised by cost, not measured; network and DB lookup differences are not addressed.
- Show deletion still checks for bookings outside its transaction (unchanged, not in the audit).


---
# POST-AUDIT ADDENDUM: movie posters and booking-flow UI review

- **Finding:** posters were supported in code (`posterUrl`, `Poster` component) but the seed set `posterUrl: ''`, so every movie showed a gradient placeholder.
- **Change:** 8 original poster SVGs (`client/public/posters/`), `server/src/seed/posters.js` (slug mapping + non-destructive backfill used by `npm run seed`), `posterUrl` validator now also accepts `/posters/<file>` (rejects `//host`, `..`, queries, other schemes/paths), admin form field relaxed from `type=url` to text with a hint, and poster thumbnails added to the seat-selection, checkout, ticket and My-bookings pages.
- **Tests added:** `server/tests/posters.test.js` (27: validation accept/reject matrix, API create, artwork files exist/well-formed/script-free, seed↔artwork drift check, backfill never overwrites and is idempotent); one E2E test that the poster actually decodes on the home page and appears on the details and seat pages.
- **Reviewed in a real browser (screenshots, desktop 1366×900 and mobile 390×844):** home, details, seat selection, reserve, checkout, confirmed ticket, My bookings, ticket detail; 8/8 poster images load on both viewports.
- Not covered: image upload, real licensed movie posters, a visual-regression suite.
