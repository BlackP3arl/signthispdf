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
      const cors = corsHeaders(origin, allowed, req.url)
      if (cors === null) return withSecurity(json(403, { error: 'Forbidden origin' }))

      if (req.method === 'OPTIONS') {
        return withSecurity(
          new Response(null, {
            status: 204,
            headers: {
              ...cors,
              'Access-Control-Allow-Methods': 'POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type, X-Entitlement-Token',
            },
          }),
        )
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
