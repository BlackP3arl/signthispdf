# Cloudflare Workers Production Port — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the Node-only Vite-dev-plugin backend to a real Cloudflare Worker (Web-standard APIs), replace Stripe with BML Connect, add KV-backed replay-proof entitlement, security headers, and tests — unifying dev and prod on one Worker.

**Architecture:** A single Worker (`worker/index.ts`) serves the built SPA via the `ASSETS` binding and handles `/api/*` routes. All logic uses Web APIs (`Request`/`Response`, `crypto.subtle`). Entitlement state lives in a KV namespace (`ENTITLEMENTS`); the HMAC token only carries `{sid, exp}`. Payments go through BML Connect (create transaction → redirect → server-side GET verify). `@cloudflare/vite-plugin` runs the identical Worker in dev (`vite dev`) and prod (`wrangler deploy`).

**Tech Stack:** Cloudflare Workers (workerd), Wrangler 4, `@cloudflare/vite-plugin`, Vite 8, React 19, Vitest + `@cloudflare/vitest-pool-workers`, Web Crypto, KV.

---

## File Structure

**Created:**
- `worker/index.ts` — fetch entry: routing, security headers, ASSETS fallthrough
- `worker/env.ts` — typed `Env` interface
- `worker/lib/http.ts` — JSON/CORS/body-guard helpers
- `worker/lib/entitlement.ts` — HMAC sign/verify (Web Crypto) + KV state
- `worker/lib/rateLimit.ts` — KV fixed-window counter
- `worker/lib/bml.ts` — BML create/get transaction + SHA-1 signature
- `worker/lib/openRouter.ts` — ported from `server/openRouter.ts`
- `worker/lib/signatureStyles.ts` — moved from `server/signatureStyles.ts`
- `worker/handlers/createTransaction.ts`
- `worker/handlers/verifyPayment.ts`
- `worker/handlers/generateSignatures.ts`
- `worker/tsconfig.json` — Worker TS config (WebWorker libs)
- `wrangler.jsonc` — Worker config (main, KV, vars, assets)
- `vitest.config.ts` — vitest pool-workers config
- `worker/lib/entitlement.test.ts`, `worker/lib/bml.test.ts`, `worker/lib/http.test.ts`, `worker/index.test.ts`
- `DEPLOY.md`

**Modified:**
- `vite.config.ts` — add `@cloudflare/vite-plugin`, remove `signatureApiPlugin`
- `package.json` — remove `stripe`; add deps + scripts
- `src/lib/payment.ts` — rename checkout call, `sessionId` → `localId`
- `src/hooks/usePaymentReturn.ts` — `session_id` → `local_id`
- `.env.example` — BML vars
- `README.md`, `MARKETING.md` — remove Stripe

**Deleted:**
- `vite-plugin-signature-api.ts`
- `server/` (entire directory)

---

## Task 1: Install tooling and scaffold Wrangler config

**Files:**
- Modify: `package.json`
- Create: `wrangler.jsonc`
- Create: `worker/tsconfig.json`

- [ ] **Step 1: Install Cloudflare + test deps**

```bash
npm install -D wrangler@^4 @cloudflare/vite-plugin@^1 @cloudflare/workers-types@^4 vitest@^3 @cloudflare/vitest-pool-workers@^0.6
```

- [ ] **Step 2: Remove the stripe dependency**

```bash
npm uninstall stripe
```

- [ ] **Step 3: Add scripts to package.json**

Replace the `"scripts"` block in `package.json` with:

```json
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "npm run build && wrangler dev",
    "deploy": "npm run build && wrangler deploy",
    "test": "vitest run"
  },
```

- [ ] **Step 4: Create `wrangler.jsonc`**

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "signthispdf",
  "main": "worker/index.ts",
  "compatibility_date": "2026-06-01",
  "compatibility_flags": ["nodejs_compat"],
  "observability": { "enabled": true },
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application"
  },
  "vars": {
    "BML_MODE": "sandbox",
    "APP_URL": "http://localhost:5173"
  },
  "kv_namespaces": [
    { "binding": "ENTITLEMENTS", "id": "PLACEHOLDER_REPLACE_AFTER_KV_CREATE" }
  ]
}
```

Note: the KV `id` is replaced in Task 11 after creating the namespace. For local
`vitest`/`vite dev`, the binding works without a real id via the miniflare
simulator.

- [ ] **Step 5: Create `worker/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "es2022",
    "lib": ["ES2023", "WebWorker"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true
  },
  "include": ["**/*.ts"]
}
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json wrangler.jsonc worker/tsconfig.json
git commit -m "chore: add wrangler + vitest tooling, remove stripe dep"
```

---

## Task 2: Typed Env and HTTP helpers

**Files:**
- Create: `worker/env.ts`
- Create: `worker/lib/http.ts`
- Test: `worker/lib/http.test.ts`

- [ ] **Step 1: Create `worker/env.ts`**

```ts
export interface Env {
  ASSETS: Fetcher
  ENTITLEMENTS: KVNamespace
  // secrets
  BML_API_KEY: string
  OPENROUTER_API_KEY: string
  ENTITLEMENT_SECRET: string
  // optional secret
  BML_APP_ID?: string
  // vars
  BML_MODE: string
  APP_URL: string
  APP_ALLOWED_ORIGINS?: string
  OPENROUTER_IMAGE_MODEL?: string
}
```

- [ ] **Step 2: Write failing tests for `worker/lib/http.ts`**

Create `worker/lib/http.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { json, allowedOrigins, corsHeaders, readJson } from './http'

describe('json', () => {
  it('serializes body with status and content-type', async () => {
    const res = json(402, { error: 'nope' })
    expect(res.status).toBe(402)
    expect(res.headers.get('Content-Type')).toBe('application/json')
    expect(await res.json()).toEqual({ error: 'nope' })
  })
})

describe('allowedOrigins', () => {
  it('includes APP_URL and extras', () => {
    const set = allowedOrigins({ APP_URL: 'https://a.com', APP_ALLOWED_ORIGINS: 'https://b.com, https://c.com' } as never)
    expect(set.has('https://a.com')).toBe(true)
    expect(set.has('https://b.com')).toBe(true)
    expect(set.has('https://c.com')).toBe(true)
  })
})

describe('corsHeaders', () => {
  it('returns headers for an allowed origin', () => {
    const set = new Set(['https://a.com'])
    const h = corsHeaders('https://a.com', set)
    expect(h?.['Access-Control-Allow-Origin']).toBe('https://a.com')
  })
  it('returns null for a forbidden origin', () => {
    const set = new Set(['https://a.com'])
    expect(corsHeaders('https://evil.com', set)).toBeNull()
  })
  it('returns empty object when no Origin header (same-origin)', () => {
    const set = new Set(['https://a.com'])
    expect(corsHeaders(null, set)).toEqual({})
  })
})

describe('readJson', () => {
  it('parses a small JSON body', async () => {
    const req = new Request('https://x/', { method: 'POST', body: JSON.stringify({ a: 1 }), headers: { 'Content-Type': 'application/json' } })
    expect(await readJson(req)).toEqual({ a: 1 })
  })
  it('rejects an oversized body', async () => {
    const big = 'x'.repeat(5000)
    const req = new Request('https://x/', { method: 'POST', body: JSON.stringify({ big }), headers: { 'Content-Type': 'application/json' } })
    await expect(readJson(req, 4096)).rejects.toThrow('Request body too large')
  })
  it('rejects invalid JSON', async () => {
    const req = new Request('https://x/', { method: 'POST', body: '{bad', headers: { 'Content-Type': 'application/json' } })
    await expect(readJson(req)).rejects.toThrow('Invalid JSON body')
  })
})
```

- [ ] **Step 3: Run tests, verify they fail**

Run: `npx vitest run worker/lib/http.test.ts`
Expected: FAIL — cannot find module `./http`.

- [ ] **Step 4: Implement `worker/lib/http.ts`**

```ts
import type { Env } from '../env'

export const MAX_BODY_BYTES = 4 * 1024

export function json(status: number, body: unknown, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  })
}

export function allowedOrigins(env: Pick<Env, 'APP_URL' | 'APP_ALLOWED_ORIGINS'>): Set<string> {
  const defaults = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
  ]
  const extra = env.APP_ALLOWED_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean) ?? []
  if (env.APP_URL?.trim()) extra.push(env.APP_URL.trim())
  return new Set([...defaults, ...extra])
}

// Returns CORS headers for an allowed origin, {} when there is no Origin
// (same-origin request), or null when the origin is forbidden.
export function corsHeaders(origin: string | null, allowed: Set<string>): Record<string, string> | null {
  if (!origin) return {}
  if (!allowed.has(origin)) return null
  return {
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
  }
}

export async function readJson(req: Request, maxBytes = MAX_BODY_BYTES): Promise<unknown> {
  const text = await req.text()
  if (text.length > maxBytes) throw new Error('Request body too large')
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('Invalid JSON body')
  }
}
```

- [ ] **Step 5: Run tests, verify they pass**

Run: `npx vitest run worker/lib/http.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add worker/env.ts worker/lib/http.ts worker/lib/http.test.ts
git commit -m "feat(worker): typed Env and HTTP helpers"
```

---

## Task 3: Entitlement HMAC tokens (Web Crypto)

**Files:**
- Create: `worker/lib/entitlement.ts`
- Test: `worker/lib/entitlement.test.ts`

- [ ] **Step 1: Write failing tests**

Create `worker/lib/entitlement.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createToken, verifyToken } from './entitlement'

const SECRET = 'test-secret-value-please-change'

describe('entitlement token', () => {
  it('round-trips sid', async () => {
    const token = await createToken(SECRET, 'sid-123')
    const payload = await verifyToken(SECRET, token)
    expect(payload?.sid).toBe('sid-123')
  })

  it('rejects a tampered token', async () => {
    const token = await createToken(SECRET, 'sid-123')
    const tampered = token.slice(0, -2) + (token.endsWith('a') ? 'bb' : 'aa')
    expect(await verifyToken(SECRET, tampered)).toBeNull()
  })

  it('rejects a token signed with a different secret', async () => {
    const token = await createToken(SECRET, 'sid-123')
    expect(await verifyToken('other-secret', token)).toBeNull()
  })

  it('rejects an expired token', async () => {
    const token = await createToken(SECRET, 'sid-123', Date.now() - 1000)
    expect(await verifyToken(SECRET, token)).toBeNull()
  })

  it('rejects undefined / malformed input', async () => {
    expect(await verifyToken(SECRET, undefined)).toBeNull()
    expect(await verifyToken(SECRET, 'nodot')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run worker/lib/entitlement.test.ts`
Expected: FAIL — cannot find module `./entitlement`.

- [ ] **Step 3: Implement `worker/lib/entitlement.ts`**

```ts
import type { Env } from '../env'

export type TokenPayload = { sid: string; exp: number }
export type EntitlementState = { status: 'unused' | 'used'; createdAt: number }

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000
const KV_TTL_SECONDS = 26 * 60 * 60 // token TTL + 2h buffer

function b64urlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let bin = ''
  for (const b of arr) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlEncodeStr(s: string): string {
  return b64urlEncode(new TextEncoder().encode(s))
}

function b64urlDecodeStr(s: string): string {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : ''
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return b64urlEncode(sig)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function createToken(secret: string, sid: string, exp = Date.now() + TOKEN_TTL_MS): Promise<string> {
  const body = b64urlEncodeStr(JSON.stringify({ sid, exp } satisfies TokenPayload))
  const sig = await hmac(secret, body)
  return `${body}.${sig}`
}

export async function verifyToken(secret: string, token: string | undefined): Promise<TokenPayload | null> {
  if (!token) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = await hmac(secret, body)
  if (!timingSafeEqual(sig, expected)) return null
  try {
    const payload = JSON.parse(b64urlDecodeStr(body)) as TokenPayload
    if (typeof payload.sid !== 'string' || typeof payload.exp !== 'number') return null
    if (payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

// KV state helpers
export async function seedEntitlement(env: Env, sid: string): Promise<void> {
  const state: EntitlementState = { status: 'unused', createdAt: Date.now() }
  await env.ENTITLEMENTS.put(`ent:${sid}`, JSON.stringify(state), { expirationTtl: KV_TTL_SECONDS })
}

export async function getEntitlement(env: Env, sid: string): Promise<EntitlementState | null> {
  const raw = await env.ENTITLEMENTS.get(`ent:${sid}`)
  return raw ? (JSON.parse(raw) as EntitlementState) : null
}

export async function setEntitlementStatus(env: Env, sid: string, status: 'unused' | 'used'): Promise<void> {
  const existing = await getEntitlement(env, sid)
  const state: EntitlementState = { status, createdAt: existing?.createdAt ?? Date.now() }
  await env.ENTITLEMENTS.put(`ent:${sid}`, JSON.stringify(state), { expirationTtl: KV_TTL_SECONDS })
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npx vitest run worker/lib/entitlement.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/lib/entitlement.ts worker/lib/entitlement.test.ts
git commit -m "feat(worker): HMAC entitlement tokens + KV state helpers"
```

---

## Task 4: BML Connect client + SHA-1 signature

**Files:**
- Create: `worker/lib/bml.ts`
- Test: `worker/lib/bml.test.ts`

- [ ] **Step 1: Write failing tests**

Create `worker/lib/bml.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { sha1Signature, bmlBaseUrl } from './bml'

describe('sha1Signature', () => {
  // Known vector: sha1("amount=2000&currency=MVR&apiKey=abc")
  it('matches the BML formula', async () => {
    const sig = await sha1Signature(2000, 'MVR', 'abc')
    expect(sig).toBe('9d2c1d3a4e9d8b0f4c4e2f9a8a3a3a3a3a3a3a3a'.length === 40 ? sig : sig)
    expect(sig).toMatch(/^[0-9a-f]{40}$/)
  })

  it('is deterministic', async () => {
    const a = await sha1Signature(2000, 'MVR', 'abc')
    const b = await sha1Signature(2000, 'MVR', 'abc')
    expect(a).toBe(b)
  })

  it('changes when amount changes', async () => {
    const a = await sha1Signature(2000, 'MVR', 'abc')
    const b = await sha1Signature(3000, 'MVR', 'abc')
    expect(a).not.toBe(b)
  })
})

describe('bmlBaseUrl', () => {
  it('returns sandbox URL for sandbox mode', () => {
    expect(bmlBaseUrl('sandbox')).toBe('https://api.uat.merchants.bankofmaldives.com.mv/public/')
  })
  it('returns production URL otherwise', () => {
    expect(bmlBaseUrl('production')).toBe('https://api.merchants.bankofmaldives.com.mv/public/')
  })
})
```

Note on the known vector: the first assertion just guards the 40-hex-char shape;
the determinism/avalanche assertions verify correctness without hardcoding a
digest. After implementing, compute the real digest once with
`node -e "console.log(require('crypto').createHash('sha1').update('amount=2000&currency=MVR&apiKey=abc').digest('hex'))"`
and replace the first assertion with `expect(sig).toBe('<that value>')`.

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run worker/lib/bml.test.ts`
Expected: FAIL — cannot find module `./bml`.

- [ ] **Step 3: Implement `worker/lib/bml.ts`**

```ts
import type { Env } from '../env'

const SANDBOX = 'https://api.uat.merchants.bankofmaldives.com.mv/public/'
const PRODUCTION = 'https://api.merchants.bankofmaldives.com.mv/public/'

export function bmlBaseUrl(mode: string): string {
  return mode === 'sandbox' ? SANDBOX : PRODUCTION
}

export async function sha1Signature(amount: number, currency: string, apiKey: string): Promise<string> {
  const message = `amount=${amount}&currency=${currency}&apiKey=${apiKey}`
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(message))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export type BmlTransaction = { id: string; state: string; url?: string }

export async function createTransaction(
  env: Env,
  params: { amount: number; currency: string; localId: string; redirectUrl: string },
): Promise<BmlTransaction> {
  const signature = await sha1Signature(params.amount, params.currency, env.BML_API_KEY)
  const body: Record<string, unknown> = {
    amount: params.amount,
    currency: params.currency,
    localId: params.localId,
    redirectUrl: params.redirectUrl,
    provider: 'card',
    signMethod: 'sha1',
    apiVersion: '2.0',
    signature,
  }
  if (env.BML_APP_ID) body.deviceId = env.BML_APP_ID

  const res = await fetch(`${bmlBaseUrl(env.BML_MODE)}transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: env.BML_API_KEY,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`BML create failed (${res.status})`)
  return (await res.json()) as BmlTransaction
}

export async function getTransaction(env: Env, id: string): Promise<BmlTransaction> {
  const res = await fetch(`${bmlBaseUrl(env.BML_MODE)}transactions/${id}`, {
    headers: { Accept: 'application/json', Authorization: env.BML_API_KEY },
  })
  if (!res.ok) throw new Error(`BML get failed (${res.status})`)
  return (await res.json()) as BmlTransaction
}

export function isPaid(txn: BmlTransaction): boolean {
  return txn.state === 'CONFIRMED'
}
```

- [ ] **Step 4: Compute the real SHA-1 vector and lock it into the test**

Run: `node -e "console.log(require('crypto').createHash('sha1').update('amount=2000&currency=MVR&apiKey=abc').digest('hex'))"`
Copy the 40-char output and replace the first assertion in `bml.test.ts` Step 1 with:
`expect(sig).toBe('<computed value>')`

- [ ] **Step 5: Run tests, verify they pass**

Run: `npx vitest run worker/lib/bml.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add worker/lib/bml.ts worker/lib/bml.test.ts
git commit -m "feat(worker): BML Connect client + SHA-1 signature"
```

---

## Task 5: Port OpenRouter + signatureStyles, and rate limiter

**Files:**
- Create: `worker/lib/signatureStyles.ts` (move from `server/`)
- Create: `worker/lib/openRouter.ts` (port from `server/`)
- Create: `worker/lib/rateLimit.ts`

- [ ] **Step 1: Copy signatureStyles verbatim**

```bash
cp server/signatureStyles.ts worker/lib/signatureStyles.ts
```

(No code changes — it's pure data/functions, already portable.)

- [ ] **Step 2: Create `worker/lib/openRouter.ts`**

Port from `server/openRouter.ts` with the import path and Referer updated. Full file:

```ts
import { SIGNATURE_STYLES, type SignatureStyleId } from './signatureStyles'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const OPENROUTER_TIMEOUT_MS = 20_000

export type GeneratedVariation = {
  id: SignatureStyleId
  label: string
  description: string
  dataUrl: string
}

type OpenRouterMessage = {
  role: string
  content?: string
  images?: Array<{ type?: string; image_url?: { url?: string } }>
}

type OpenRouterResponse = {
  choices?: Array<{ message?: OpenRouterMessage }>
  error?: { message?: string }
}

function extractImageDataUrl(message: OpenRouterMessage | undefined): string | null {
  if (!message?.images?.length) return null
  const url = message.images[0]?.image_url?.url
  return url?.startsWith('data:image') ? url : null
}

async function generateOne(apiKey: string, model: string, styleId: SignatureStyleId, name: string): Promise<GeneratedVariation> {
  const style = SIGNATURE_STYLES.find((s) => s.id === styleId)
  if (!style) throw new Error(`Unknown style: ${styleId}`)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS)

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://signthispdf.com',
      'X-Title': 'SignThisPDF',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: style.buildPrompt(name) }],
      modalities: ['image', 'text'],
      image_config: { aspect_ratio: '3:2', image_size: '1K' },
    }),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout))

  const body = (await response.json()) as OpenRouterResponse
  if (!response.ok) throw new Error(`OpenRouter request failed (${response.status})`)
  const dataUrl = extractImageDataUrl(body.choices?.[0]?.message)
  if (!dataUrl) throw new Error('Model returned no image')

  return { id: style.id, label: style.label, description: style.description, dataUrl }
}

export async function generateSignatureVariations(apiKey: string, model: string, name: string): Promise<GeneratedVariation[]> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Name is required')

  const results = await Promise.allSettled(
    SIGNATURE_STYLES.map((style) => generateOne(apiKey, model, style.id, trimmed)),
  )
  const ok = results
    .filter((r): r is PromiseFulfilledResult<GeneratedVariation> => r.status === 'fulfilled')
    .map((r) => r.value)
  if (ok.length === 0) {
    const firstError = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined
    throw new Error(firstError?.reason?.message ?? 'All signature generations failed')
  }
  return ok
}
```

- [ ] **Step 3: Create `worker/lib/rateLimit.ts`**

```ts
import type { Env } from '../env'

const WINDOW_MS = 60_000
const MAX_REQUESTS = 8

type Window = { count: number; windowStart: number }

// KV-backed fixed-window limiter. Returns true if the caller is over the limit.
export async function isRateLimited(env: Env, key: string): Promise<boolean> {
  const kvKey = `rl:${key}`
  const now = Date.now()
  const raw = await env.ENTITLEMENTS.get(kvKey)
  const win: Window | null = raw ? (JSON.parse(raw) as Window) : null

  if (!win || now - win.windowStart > WINDOW_MS) {
    await env.ENTITLEMENTS.put(kvKey, JSON.stringify({ count: 1, windowStart: now }), { expirationTtl: 120 })
    return false
  }
  win.count += 1
  await env.ENTITLEMENTS.put(kvKey, JSON.stringify(win), { expirationTtl: 120 })
  return win.count > MAX_REQUESTS
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc -p worker/tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add worker/lib/signatureStyles.ts worker/lib/openRouter.ts worker/lib/rateLimit.ts
git commit -m "feat(worker): port openRouter + signatureStyles, add KV rate limiter"
```

---

## Task 6: Payment handlers (create + verify)

**Files:**
- Create: `worker/handlers/createTransaction.ts`
- Create: `worker/handlers/verifyPayment.ts`

- [ ] **Step 1: Create `worker/handlers/createTransaction.ts`**

```ts
import type { Env } from '../env'
import { json } from '../lib/http'
import { createTransaction } from '../lib/bml'
import { isRateLimited } from '../lib/rateLimit'

const AMOUNT = 2000 // MVR 20.00 in laari
const CURRENCY = 'MVR'

export async function handleCreateTransaction(req: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown'
  if (await isRateLimited(env, ip)) return json(429, { error: 'Too many requests, try again in a minute' }, cors)
  if (!env.BML_API_KEY) return json(500, { error: 'Payment gateway is not configured' }, cors)

  const sid = crypto.randomUUID()
  const redirectUrl = `${env.APP_URL}/?payment=success&local_id=${sid}`

  try {
    const txn = await createTransaction(env, { amount: AMOUNT, currency: CURRENCY, localId: sid, redirectUrl })
    if (!txn.url) throw new Error('BML returned no payment URL')
    await env.ENTITLEMENTS.put(`pending:${sid}`, JSON.stringify({ bmlTxnId: txn.id }), { expirationTtl: 3600 })
    return json(200, { url: txn.url }, cors)
  } catch {
    return json(502, { error: 'Failed to start checkout' }, cors)
  }
}
```

- [ ] **Step 2: Create `worker/handlers/verifyPayment.ts`**

```ts
import type { Env } from '../env'
import { json, readJson } from '../lib/http'
import { getTransaction, isPaid } from '../lib/bml'
import { createToken, seedEntitlement } from '../lib/entitlement'

export async function handleVerifyPayment(req: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  if (!env.ENTITLEMENT_SECRET) return json(500, { error: 'Entitlement signing is not configured' }, cors)

  let sid = ''
  try {
    const body = (await readJson(req)) as { localId?: string }
    sid = typeof body.localId === 'string' ? body.localId.trim() : ''
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    return json(400, { error: message || 'Invalid request' }, cors)
  }
  if (!sid) return json(400, { error: 'localId is required' }, cors)

  const pendingRaw = await env.ENTITLEMENTS.get(`pending:${sid}`)
  if (!pendingRaw) return json(402, { error: 'Payment not found' }, cors)
  const { bmlTxnId } = JSON.parse(pendingRaw) as { bmlTxnId: string }

  try {
    const txn = await getTransaction(env, bmlTxnId)
    if (!isPaid(txn)) return json(402, { error: 'Payment not completed' }, cors)
    await seedEntitlement(env, sid)
    const token = await createToken(env.ENTITLEMENT_SECRET, sid)
    return json(200, { entitlementToken: token, plan: 'just_once', generationUsed: false }, cors)
  } catch {
    return json(502, { error: 'Failed to verify payment' }, cors)
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -p worker/tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add worker/handlers/createTransaction.ts worker/handlers/verifyPayment.ts
git commit -m "feat(worker): BML create-transaction + verify-payment handlers"
```

---

## Task 7: Generate-signatures handler

**Files:**
- Create: `worker/handlers/generateSignatures.ts`

- [ ] **Step 1: Create `worker/handlers/generateSignatures.ts`**

```ts
import type { Env } from '../env'
import { json, readJson } from '../lib/http'
import { verifyToken, getEntitlement, setEntitlementStatus, createToken } from '../lib/entitlement'
import { generateSignatureVariations } from '../lib/openRouter'
import { isRateLimited } from '../lib/rateLimit'

const DEFAULT_MODEL = 'google/gemini-2.5-flash-image'
const MAX_NAME_LENGTH = 80

export async function handleGenerateSignatures(req: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown'
  if (await isRateLimited(env, ip)) return json(429, { error: 'Too many requests, try again in a minute' }, cors)
  if (!env.ENTITLEMENT_SECRET) return json(500, { error: 'Entitlement signing is not configured' }, cors)
  if (!env.OPENROUTER_API_KEY) return json(500, { error: 'OPENROUTER_API_KEY is not set' }, cors)

  const payload = await verifyToken(env.ENTITLEMENT_SECRET, req.headers.get('X-Entitlement-Token') ?? undefined)
  if (!payload) return json(402, { error: 'Payment required for AI signatures' }, cors)

  const state = await getEntitlement(env, payload.sid)
  if (!state) return json(402, { error: 'Payment required for AI signatures' }, cors)
  if (state.status === 'used') {
    return json(403, { error: 'AI generation already used this session. Reuse your saved signature.' }, cors)
  }

  let name = ''
  try {
    const body = (await readJson(req)) as { name?: string }
    name = typeof body.name === 'string' ? body.name.trim() : ''
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    return json(400, { error: message || 'Invalid request' }, cors)
  }
  if (!name) return json(400, { error: 'Name is required' }, cors)
  if (name.length > MAX_NAME_LENGTH) return json(400, { error: `Name too long (max ${MAX_NAME_LENGTH} characters)` }, cors)

  // Claim before generating (replay-proof), roll back on failure.
  await setEntitlementStatus(env, payload.sid, 'used')
  try {
    const model = env.OPENROUTER_IMAGE_MODEL || DEFAULT_MODEL
    const variations = await generateSignatureVariations(env.OPENROUTER_API_KEY, model, name)
    const token = await createToken(env.ENTITLEMENT_SECRET, payload.sid)
    return json(200, { variations, entitlementToken: token, generationUsed: true }, cors)
  } catch {
    await setEntitlementStatus(env, payload.sid, 'unused') // refund the claim
    return json(502, { error: 'Failed to generate signatures' }, cors)
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p worker/tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add worker/handlers/generateSignatures.ts
git commit -m "feat(worker): generate-signatures handler with KV one-use claim"
```

---

## Task 8: Worker entry — routing + security headers + ASSETS

**Files:**
- Create: `worker/index.ts`
- Test: `worker/index.test.ts`

- [ ] **Step 1: Write failing tests**

Create `worker/index.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import worker from './index'

function ctx() { return createExecutionContext() }

describe('routing + headers', () => {
  it('unknown /api path returns 404 JSON', async () => {
    const c = ctx()
    const res = await worker.fetch(new Request('https://app/api/nope', { method: 'POST' }), env, c)
    await waitOnExecutionContext(c)
    expect(res.status).toBe(404)
  })

  it('generate-signatures without a token returns 402', async () => {
    const c = ctx()
    const res = await worker.fetch(
      new Request('https://app/api/generate-signatures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'X' }),
      }),
      env,
      c,
    )
    await waitOnExecutionContext(c)
    expect(res.status).toBe(402)
  })

  it('applies security headers to API responses', async () => {
    const c = ctx()
    const res = await worker.fetch(new Request('https://app/api/nope', { method: 'POST' }), env, c)
    await waitOnExecutionContext(c)
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(res.headers.get('X-Frame-Options')).toBe('DENY')
    expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'self'")
  })

  it('OPTIONS preflight returns 204', async () => {
    const c = ctx()
    const res = await worker.fetch(
      new Request('https://app/api/create-transaction', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } }),
      env,
      c,
    )
    await waitOnExecutionContext(c)
    expect(res.status).toBe(204)
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run worker/index.test.ts`
Expected: FAIL — cannot find module `./index`.

- [ ] **Step 3: Implement `worker/index.ts`**

```ts
import type { Env } from './env'
import { json, allowedOrigins, corsHeaders } from './lib/http'
import { handleCreateTransaction } from './handlers/createTransaction'
import { handleVerifyPayment } from './handlers/verifyPayment'
import { handleGenerateSignatures } from './handlers/generateSignatures'

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "img-src 'self' data: blob:",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
}

function withSecurity(res: Response): Response {
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v)
  return new Response(res.body, { status: res.status, headers })
}

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url)

    if (url.pathname.startsWith('/api/')) {
      const allowed = allowedOrigins(env)
      const origin = req.headers.get('Origin')
      const cors = corsHeaders(origin, allowed)
      if (cors === null) return withSecurity(json(403, { error: 'Forbidden origin' }))

      if (req.method === 'OPTIONS') {
        return withSecurity(new Response(null, {
          status: 204,
          headers: {
            ...cors,
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-Entitlement-Token',
          },
        }))
      }

      if (req.method !== 'POST') return withSecurity(json(405, { error: 'Method not allowed' }, cors))

      const route = url.pathname.slice('/api/'.length)
      let res: Response
      if (route === 'create-transaction') res = await handleCreateTransaction(req, env, cors)
      else if (route === 'verify-payment') res = await handleVerifyPayment(req, env, cors)
      else if (route === 'generate-signatures') res = await handleGenerateSignatures(req, env, cors)
      else res = json(404, { error: 'Not found' }, cors)
      return withSecurity(res)
    }

    // Static assets (SPA) — handled by the ASSETS binding.
    const assetRes = await env.ASSETS.fetch(req)
    return withSecurity(assetRes)
  },
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npx vitest run worker/index.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/index.ts worker/index.test.ts
git commit -m "feat(worker): fetch entry with routing, CORS, security headers"
```

---

## Task 9: Vitest config + wire vite plugin + delete old backend

**Files:**
- Create: `vitest.config.ts`
- Modify: `vite.config.ts`
- Delete: `vite-plugin-signature-api.ts`, `server/`

- [ ] **Step 1: Create `vitest.config.ts`**

```ts
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.jsonc' },
      },
    },
  },
})
```

- [ ] **Step 2: Replace `vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'

export default defineConfig({
  plugins: [react(), cloudflare()],
})
```

- [ ] **Step 3: Delete the old Node backend**

```bash
git rm vite-plugin-signature-api.ts
git rm -r server/
```

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: PASS — all `worker/**/*.test.ts` green. (Vitest now runs under the
workers pool with the KV binding simulated.)

- [ ] **Step 5: Verify no Stripe code remains**

Run: `grep -rniI stripe . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude=package-lock.json | grep -v 'docs/superpowers'`
Expected: only matches in `README.md` and `MARKETING.md` (fixed in Task 10).

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts vite.config.ts
git commit -m "feat: run Worker via @cloudflare/vite-plugin, delete Node dev backend"
```

---

## Task 10: Update client + docs + env example (remove Stripe)

**Files:**
- Modify: `src/lib/payment.ts`
- Modify: `src/hooks/usePaymentReturn.ts`
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `MARKETING.md`

- [ ] **Step 1: Update `src/lib/payment.ts`**

Replace the whole file:

```ts
import { markGenerationUsed, setEntitlementToken } from './aiEntitlement'

export async function startJustOnceCheckout(): Promise<void> {
  const response = await fetch('/api/create-transaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
  const body = (await response.json()) as { url?: string; error?: string }
  if (!response.ok || !body.url) {
    throw new Error(body.error ?? 'Failed to start checkout')
  }
  window.location.href = body.url
}

export async function verifyCheckoutSession(localId: string): Promise<void> {
  const response = await fetch('/api/verify-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ localId }),
  })
  const body = (await response.json()) as {
    entitlementToken?: string
    generationUsed?: boolean
    error?: string
  }
  if (!response.ok || !body.entitlementToken) {
    throw new Error(body.error ?? 'Payment verification failed')
  }
  setEntitlementToken(body.entitlementToken)
  if (body.generationUsed) {
    markGenerationUsed()
  }
}
```

- [ ] **Step 2: Update `src/hooks/usePaymentReturn.ts`**

Change line 11 from:
```ts
    const sessionId = params.get('session_id')
```
to:
```ts
    const localId = params.get('local_id')
```
Change line 19 from:
```ts
    if (payment !== 'success' || !sessionId) return
```
to:
```ts
    if (payment !== 'success' || !localId) return
```
Change line 22 from:
```ts
    verifyCheckoutSession(sessionId)
```
to:
```ts
    verifyCheckoutSession(localId)
```

- [ ] **Step 3: Replace `.env.example`**

```
# OpenRouter (AI signatures)
OPENROUTER_API_KEY=
# Optional — defaults to google/gemini-2.5-flash-image
# OPENROUTER_IMAGE_MODEL=google/gemini-3.1-flash-image-preview

# BML Connect (Bank of Maldives) — Plan 1: Just Once
BML_API_KEY=
# Optional — only if your integration requires a separate device/app id
# BML_APP_ID=
# sandbox | production
BML_MODE=sandbox

# Canonical app URL (CORS + BML redirect URLs)
APP_URL=http://localhost:5173
# Optional extra allowed origins (comma-separated)
# APP_ALLOWED_ORIGINS=https://your-domain.com

# Signs AI entitlement tokens (use a long random string in production)
ENTITLEMENT_SECRET=
```

- [ ] **Step 4: Fix `README.md`**

Replace the heading on line 28 `### AI signatures (Stripe + OpenRouter + Gemini)` with `### AI signatures (BML Connect + OpenRouter + Gemini)`. Replace line 32 (the `STRIPE_SECRET_KEY` step) with:
```
3. Set `BML_API_KEY` from your Bank of Maldives merchant dashboard (sandbox key for testing), and `BML_MODE=sandbox`
```
Replace any `VITE_APP_URL` reference in that section with `APP_URL`. Run `grep -n -i stripe README.md` afterward and remove any remaining Stripe lines.

- [ ] **Step 5: Fix `MARKETING.md`**

Run `grep -n -i stripe MARKETING.md`. Replace line ~120 `- AI generation uses a secure payment flow (Stripe)` with `- AI generation uses a secure payment flow (BML Connect)`. Remove the line ~147 checklist item `- [ ] Set production VITE_APP_URL for Stripe redirects` and replace with `- [ ] Set production APP_URL and BML_MODE=production`.

- [ ] **Step 6: Verify zero Stripe references remain**

Run: `grep -rniI stripe . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude=package-lock.json | grep -v 'docs/superpowers'`
Expected: NO output.

- [ ] **Step 7: Build to confirm the client compiles**

Run: `npm run build`
Expected: `tsc -b` passes and Vite build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/lib/payment.ts src/hooks/usePaymentReturn.ts .env.example README.md MARKETING.md
git commit -m "feat: switch client + docs from Stripe to BML Connect"
```

---

## Task 11: Deploy guide + local smoke test

**Files:**
- Create: `DEPLOY.md`

- [ ] **Step 1: Create `DEPLOY.md`**

````markdown
# Deploying SignThisPDF to Cloudflare Workers

## One-time setup

1. **Authenticate Wrangler:** `npx wrangler login`
2. **Create the KV namespace:**
   ```bash
   npx wrangler kv namespace create ENTITLEMENTS
   ```
   Copy the printed `id` into `wrangler.jsonc` under `kv_namespaces[0].id`.
3. **Set production secrets:**
   ```bash
   npx wrangler secret put BML_API_KEY
   npx wrangler secret put OPENROUTER_API_KEY
   npx wrangler secret put ENTITLEMENT_SECRET   # long random string
   ```
4. **Set production vars** in `wrangler.jsonc` `vars`:
   - `BML_MODE`: `production`
   - `APP_URL`: your canonical https origin (e.g. `https://signthispdf.com`)

## Local development

- Put sandbox secrets in `.dev.vars` (gitignored):
  ```
  BML_API_KEY=...
  OPENROUTER_API_KEY=...
  ENTITLEMENT_SECRET=dev-secret
  BML_MODE=sandbox
  ```
- Run `npm run dev` — the real Worker runs in workerd via the Vite plugin.

## Deploy

```bash
npm run deploy   # builds the SPA then wrangler deploy
```

## Verify after deploy

- Visit `APP_URL` — the SPA loads.
- `curl -X POST https://APP_URL/api/generate-signatures` → 402 (no token).
- Response headers include `content-security-policy` and `x-frame-options: DENY`.
````

- [ ] **Step 2: Local smoke test with `.dev.vars`**

Ensure `.dev.vars` has `OPENROUTER_API_KEY` and `ENTITLEMENT_SECRET=dev-secret` added (BML key already present). Then:

Run: `npm run dev` (background) and once it serves, in another shell:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/
curl -s -X POST http://localhost:5173/api/generate-signatures -H 'Content-Type: application/json' -d '{"name":"X"}'
curl -s -D - -o /dev/null http://localhost:5173/ | grep -i 'content-security-policy'
```
Expected: `200` for the SPA; `{"error":"Payment required for AI signatures"}` (402) for generate; CSP header present.

- [ ] **Step 3: Full test + build gate**

Run: `npm test && npm run build`
Expected: all tests pass; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add DEPLOY.md wrangler.jsonc
git commit -m "docs: add Cloudflare deploy guide"
```

---

## Verification Checklist (end of plan)

- [ ] `npm test` — all Worker unit tests pass (http, entitlement, bml, index).
- [ ] `npm run build` — SPA builds clean.
- [ ] `grep -rniI stripe` (excluding node_modules/lock/docs) returns nothing.
- [ ] `npm run dev` serves the SPA and `/api/*` routes from one Worker; security
      headers present; generate-signatures returns 402 without a token.
- [ ] `server/` and `vite-plugin-signature-api.ts` are deleted.
- [ ] Secrets (`.env`, `.dev.vars`) remain gitignored and uncommitted.
