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
//
// The Worker serves the SPA and the API from the same origin, so a request's
// OWN origin must always be allowed regardless of port (dev :5173, preview
// :4173, deployed, or any custom port). This prevents the app's own calls
// from ever being rejected as a "forbidden origin".
export function corsHeaders(
  origin: string | null,
  allowed: Set<string>,
  requestUrl: string,
): Record<string, string> | null {
  if (!origin) return {}
  const sameOrigin = origin === new URL(requestUrl).origin
  if (!sameOrigin && !allowed.has(origin)) return null
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
