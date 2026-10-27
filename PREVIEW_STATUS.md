# PREVIEW_STATUS — iMovies

**There is no hosted preview.** Nothing has been deployed and no public URL exists. The only previews performed were local ones, listed below.

## How to preview locally (3 steps; details in README §1–§3)
1. MongoDB replica set running (`mongod --replSet rs0 …`, then `cd server && npm run db:init-replset`).
2. `cd server && cp .env.example .env` (edit secrets) → `npm ci && npm run seed && npm run dev`.
3. `cd client && npm ci && npm run dev` → open http://localhost:5173 (log in with the seeded admin to see `/admin`).

## What was previewed and how (Phase 6, headless Chromium driven by Playwright against the real API + real MongoDB 7.0.34 replica set)
- Production build served by `vite preview` (http://127.0.0.1:4173) proxying to the API.
- Viewports exercised: 360×800, 390×844, 768×1024, 1366×768, 1440×900 (no horizontal overflow on customer or admin pages; seat map and tables scroll inside their own containers).
- Screenshots were generated during testing for visual review (mobile seat map and admin form were inspected by eye); they are not shipped in the ZIP.
- Not previewed: real mobile devices, Safari/Firefox, screen readers (NVDA/VoiceOver), hosted deployment.

## Post-audit run (2026-10-24)
- Re-previewed after the remediation: production build via `vite preview` (127.0.0.1:4173) → API → real MongoDB 8.3.7 replica set; Playwright **36/36 passed** in headless Chromium (packaged in `@sparticuz/chromium`, with sandbox-only extra launch flags). This covers the five viewports and the axe/keyboard suites again. Real browsers send `Origin` through the proxy, so the stricter CSRF policy does not break the SPA.
- Still not previewed: real devices, Safari/Firefox, screen readers, any hosted deployment. No screenshots are shipped.
- Prerequisites changed: Node **`^22.22.2 || ^24.15.0 || >=26.0.0`** (tested on 22.22.2 only); see README §1.
- Show management in the admin UI is **create and delete only** — no edit and no whole-show cancellation. Seeding/admin creation aborts (instead of promoting) if `ADMIN_EMAIL` already belongs to a customer; see README §3.

## Poster update
- Seeded movies now display poster artwork (see README "Movie posters"). Screenshots of the complete booking journey were reviewed at 1366×900 and 390×844 in headless Chromium; none are shipped. Real devices, Safari/Firefox and screen readers remain unchecked.
