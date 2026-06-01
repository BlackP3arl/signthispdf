# SignThisPDF — Production-Ready on Cloudflare Workers

**Date:** 2026-06-01
**Status:** Design — pending user review
**Branch target:** `feat/landing-page-and-marketing` (builds on existing `cloudflare/workers-autoconfig` config)

## Problem

The entire backend (`server/*`) runs **only** as a Vite dev plugin
(`vite-plugin-signature-api.ts`) built on Node.js primitives: `node:http`,
`node:crypto`, stream-based body parsing, and the Stripe Node SDK. It has **no
production deployment path**. In production today, all three `/api/*` routes
would return 404 — the AI-signature feature is non-functional once deployed.

The existing `cloudflare/workers-autoconfig` branch adds `wrangler.jsonc` and the
Cloudflare Vite plugin, but it only configures **static asset serving** (SPA
mode). It contains no Worker to handle the API.

Additionally, the user is **not using Stripe**. Payments will go through **BML
Connect** (Bank of Maldives merchant gateway).

## Goals

Make the app genuinely production-ready on Cloudflare Workers:

1. **Port the API to a real Worker** using Web-standard APIs (Request/Response,
   Web Crypto), unifying dev and prod on one codebase.
2. **Replace Stripe with BML Connect** for the "Just Once" AI-signature payment.
3. **Durable, replay-proof entitlement** via Cloudflare KV (strict one-use).
4. **Secrets & config** managed via Wrangler secrets / `.dev.vars`, never shipped
   to the browser.
5. **Security headers** (CSP, HSTS, etc.) on every response.
6. **Tests**: Vitest unit tests for pure logic + `wrangler dev` smoke test.

## Non-Goals

- No Durable Objects (KV eventual consistency is acceptable at $1/human-click —
  documented tradeoff below).
- No BML webhook/callback endpoint (verification is redirect + server-side GET).
- No real-charge integration tests in CI (sandbox-only, run on demand).
- No changes to the PDF signing/export logic or the React frontend's `/api`
  contract (the contract is preserved exactly — zero client changes required).

---

## Architectural Decision: Unify Dev and Prod on One Worker

**Approved.** Replace the Vite Node dev-plugin with `@cloudflare/vite-plugin`, so
`vite dev` runs the **actual Worker** in Cloudflare's `workerd` runtime. Dev and
prod execute identical code — eliminating the dev/prod divergence that causes
"works locally, breaks in prod" bugs.

**Delete:**
- `vite-plugin-signature-api.ts`
- `server/` (all Node-based handlers)
- the `stripe` npm dependency

**Add:** a new `worker/` directory (below).

---

## New Structure

```
worker/
  index.ts                  — fetch entry: routing + security headers + ASSETS fallthrough
  env.ts                    — typed Env (secrets, vars, KV binding)
  lib/
    http.ts                 — Request/Response helpers, CORS, JSON parse, body-size guard
    entitlement.ts          — HMAC token via Web Crypto (crypto.subtle); KV state helpers
    rateLimit.ts            — KV-backed rate-limit counter (replaces in-memory Map)
    bml.ts                  — BML Connect client: create + get transaction, SHA-1 signature
    openRouter.ts           — ported from server/openRouter.ts (already fetch-based)
    signatureStyles.ts      — moved from server/signatureStyles.ts (unchanged)
  handlers/
    createTransaction.ts    — POST /api/create-transaction  (was create-checkout-session)
    verifyPayment.ts        — POST /api/verify-payment
    generateSignatures.ts   — POST /api/generate-signatures
```

`wrangler.jsonc` gains a `main` pointing at `worker/index.ts`, a KV namespace
binding, and `vars`. The `assets` binding (already present) serves the built SPA;
the Worker handles `/api/*` and falls through to `ASSETS` for everything else.

---

## BML Connect Integration

Confirmed from the official BML PHP SDK
(`github.com/bankofmaldives/bml-connect-php`) source:

- **Base URLs:**
  - Sandbox: `https://api.uat.merchants.bankofmaldives.com.mv/public/`
  - Production: `https://api.merchants.bankofmaldives.com.mv/public/`
- **Auth header:** `Authorization: <apiKey>` (raw key, no "Bearer" prefix).
- **App ID:** NOT required. The API key is a JWT that embeds the `appId` and
  `companyId` claims. The Worker omits `deviceId` unless `BML_APP_ID` is set.
- **Create transaction:** `POST /public/transactions`
  - Body: `amount` (integer minor units), `currency`, `redirectUrl`, `localId`,
    `apiVersion: "2.0"`, `signMethod: "sha1"`, and
    `signature = SHA1("amount=<amount>&currency=<currency>&apiKey=<apiKey>")`.
  - Response: transaction `id`, a hosted-payment `url`, and `state`.
- **Get/verify transaction:** `GET /public/transactions/{id}` → inspect `state`.
  `state === "CONFIRMED"` means paid.

### Pricing

- **MVR 20** → `currency: "MVR"`, `amount: 2000` (laari). ≈ $1 at the user's 1:20
  rate. UI/marketing copy that says "$1" stays as approximate framing.

### Payment Flow (redirect + server-side GET; no webhook)

1. **`POST /api/create-transaction`**
   - Generate `sid` = `crypto.randomUUID()`.
   - Call BML create with `localId = sid`,
     `redirectUrl = ${APP_URL}/?payment=success&local_id=${sid}`.
   - Store KV `pending:<sid> = { bmlTxnId, status: "unused", createdAt }` (TTL).
   - Return `{ url }` (BML hosted payment URL). Client redirects there.
2. **Customer pays on BML's page** → BML redirects to `redirectUrl`.
3. **`POST /api/verify-payment`** with `{ sid }` (renamed from `sessionId`;
   client reads `local_id` from the return URL):
   - Look up `pending:<sid>` → `bmlTxnId`.
   - `GET /transactions/{bmlTxnId}` (authoritative, server-side).
   - If `state === "CONFIRMED"` → promote to `ent:<sid> = { status: "unused" }`,
     mint HMAC token `{ sid, exp }`, return
     `{ entitlementToken, plan: "just_once", generationUsed: false }`.
   - Else → 402.

The server-side GET is the security boundary (replaces Stripe's webhook
signature). The client never trusts the redirect alone.

---

## Entitlement & KV Model (replay-proof, strict one-use)

**Current flaw:** the HMAC token carries `used: false`; the server trusts the
client to send back the `used: true` token. A user can replay the original
`used: false` token indefinitely.

**Fix — KV is the source of truth, not the token:**

- Token carries only `{ sid, exp }` + HMAC-SHA256 signature (no `used` flag to
  forge). Signed/verified with Web Crypto (`crypto.subtle`), constant-time
  comparison.
- KV `ent:<sid>` holds the real state: `{ status: "unused" | "used", createdAt }`.
- **`POST /api/generate-signatures`** flow:
  1. Verify HMAC + `exp` (cheap; rejects junk before any KV read).
  2. Read `ent:<sid>`. Missing → 402. `status: "used"` → 403.
  3. **Claim before generating:** write `status: "used"` to KV.
  4. Call OpenRouter. On failure, **roll back** to `"unused"` so a paying user
     isn't robbed by an upstream error.
  5. Return `{ variations, entitlementToken, generationUsed: true }` (contract
     unchanged; `entitlementToken` re-issued for client continuity).
- KV entries carry a TTL (token TTL + buffer) for self-cleanup.

**Documented tradeoff:** KV is eventually consistent. Two requests racing the
same `sid` within a few hundred ms could both pass the read. At $1 with a human
clicking a button, negligible. True atomicity would need a Durable Object — noted
as a future option, intentionally not built now.

---

## Secrets & Configuration

**Wrangler secrets** (prod: `wrangler secret put`; local: `.dev.vars`):
- `BML_API_KEY` — BML Connect API key (JWT; embeds appId).
- `OPENROUTER_API_KEY` — OpenRouter key (server-side only).
- `ENTITLEMENT_SECRET` — long random string for HMAC token signing.

**Plaintext vars** (`wrangler.jsonc` `vars`):
- `BML_MODE` — `"sandbox"` | `"production"`.
- `APP_URL` — canonical prod origin (CORS + redirect URLs).
- `APP_ALLOWED_ORIGINS` — optional comma-separated extra origins.

**Optional:** `BML_APP_ID` — only sent as `deviceId` if present (not required).

**KV namespace binding:** `ENTITLEMENTS` (created once via
`wrangler kv namespace create`).

**Removed:** `STRIPE_SECRET_KEY`, `VITE_APP_URL` (→ `APP_URL`), `stripe` dep.

**Local dev:** `.dev.vars` (gitignored) holds the test BML key + `BML_MODE`. The
legacy `.env` becomes irrelevant once the Node plugin is deleted. `.env.example`
updated to the BML/OpenRouter set.

Secrets are read from the Worker `fetch(req, env, ctx)` `env` — never bundled,
never reach the browser. All BML/OpenRouter calls happen inside the Worker.

---

## Security Headers (applied to every response in `worker/index.ts`)

- **`Content-Security-Policy`**: `default-src 'self'`; `img-src 'self' data:`
  (signatures are data URLs); `connect-src 'self'` (API is same-origin;
  BML/OpenRouter are server-side); `style-src 'self' 'unsafe-inline'` (+ Google
  Fonts hosts if used); `frame-ancestors 'none'`; `base-uri 'self'`;
  `form-action 'self'`. PDF.js may require `worker-src 'self' blob:` and
  `script-src 'self' 'wasm-unsafe-eval'` — **verified against the real bundle
  during testing** and tuned so signing never breaks. Goal: tight *and* working.
- **`Strict-Transport-Security`**: `max-age=31536000; includeSubDomains; preload`.
- **`X-Content-Type-Options: nosniff`**.
- **`X-Frame-Options: DENY`**.
- **`Referrer-Policy: strict-origin-when-cross-origin`**.
- **`Permissions-Policy`**: disable camera, microphone, geolocation, etc.
- **CORS**: origin-checked, locked to `APP_URL` + allowed origins in prod.

---

## Rate Limiting

Replace the in-memory `Map` (per-isolate, ineffective across Workers) with a
KV-backed fixed-window counter keyed by client IP (`CF-Connecting-IP`):
`rl:<ip>` → count within a 60s window, max 8 (matching current values). Applied
to `generate-signatures` and `create-transaction`.

---

## Testing & Verification

- **Vitest unit tests** (`@cloudflare/vitest-pool-workers`, in-memory KV; no
  network, no real keys):
  - `entitlement.ts` — HMAC round-trip, tampered-token rejection, expiry,
    replay blocked by KV `used`.
  - `bml.ts` — SHA-1 signature matches the known PHP-SDK formula on a fixed
    vector.
  - `http.ts` — CORS allow/deny, body-size guard, JSON validation, method /
    content-type rejection.
  - Routing — unknown path → 404; correct handler dispatch.
  - Entitlement one-use claim + rollback exercised against in-memory KV.
- **`wrangler dev` smoke test**: boot the Worker; confirm SPA loads, security
  headers present, `create-transaction` returns a BML sandbox URL,
  `verify-payment` / `generate-signatures` reject without valid entitlement
  (402/403). Driven via curl + browser; results inspected, not assumed.
- **No real charges**: unit tests fully mocked; only live calls are BML
  **sandbox** + the OpenRouter test key, run on demand for the end-to-end path.

---

## Client Impact

The React frontend's `/api` contract is preserved:
- `generate-signatures`: same request (`{ name }`, `X-Entitlement-Token`
  header), same response (`{ variations, entitlementToken, generationUsed }`).
- Payment: `create-checkout-session` → `create-transaction` (returns `{ url }`);
  `verify-payment` now takes `{ sid }` (from `local_id` query param) instead of
  `{ sessionId }`.

**Minimal client changes:** rename the checkout call and switch the return-URL
param from `session_id` to `local_id` in `src/lib/payment.ts` and
`src/hooks/usePaymentReturn.ts`. Everything else is untouched.

---

## Deliverables

1. `worker/` implementation (Web-standard, workerd-compatible).
2. Updated `wrangler.jsonc` (main, KV binding, vars), `vite.config.ts`
   (`@cloudflare/vite-plugin`, remove Node plugin), `package.json` (remove
   `stripe`, add wrangler/vite-plugin/vitest deps; scripts for dev/preview/
   deploy/test).
3. Deleted: `vite-plugin-signature-api.ts`, `server/`.
4. Minimal client edits in `src/lib/payment.ts`, `src/hooks/usePaymentReturn.ts`.
5. Vitest test suite.
6. Updated `.env.example`, `.dev.vars` (gitignored), and a `DEPLOY.md` covering
   KV creation, secret setup, and `wrangler deploy`.
