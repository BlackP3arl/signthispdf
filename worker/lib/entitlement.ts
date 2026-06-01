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
