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
- Run `npm run dev` — the real Worker runs in workerd via the Vite plugin, so
  `/api/*` behaves exactly as in production.

## Deploy

```bash
npm run deploy   # builds the SPA then wrangler deploy
```

## Verify after deploy

- Visit `APP_URL` — the SPA loads.
- `curl -X POST https://APP_URL/api/generate-signatures` → 402 (no token).
- Response headers include `content-security-policy` and `x-frame-options: DENY`.

## Notes

- The entitlement model is replay-proof: KV (`ent:<sid>`) is the source of truth
  for one-use, not the signed token. See
  `docs/superpowers/specs/2026-06-01-cloudflare-workers-production-design.md`.
- KV is eventually consistent; at one human click per $1 payment the race window
  is negligible. Upgrade to a Durable Object if strict atomicity is ever needed.
