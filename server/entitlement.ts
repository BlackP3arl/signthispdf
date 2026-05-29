import { createHmac, timingSafeEqual } from 'node:crypto'

export type EntitlementPayload = {
  sid: string
  paid: boolean
  used: boolean
  exp: number
}

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function signSegment(segment: string, secret: string): string {
  return createHmac('sha256', secret).update(segment).digest('base64url')
}

export function createEntitlementToken(
  secret: string,
  sid: string,
  used: boolean,
): string {
  const payload: EntitlementPayload = {
    sid,
    paid: true,
    used,
    exp: Date.now() + TOKEN_TTL_MS,
  }
  const body = base64UrlEncode(JSON.stringify(payload))
  const signature = signSegment(body, secret)
  return `${body}.${signature}`
}

export function verifyEntitlementToken(
  secret: string,
  token: string | undefined,
): EntitlementPayload | null {
  if (!token) return null
  const [body, signature] = token.split('.')
  if (!body || !signature) return null

  const expected = signSegment(body, secret)
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const payload = JSON.parse(base64UrlDecode(body)) as EntitlementPayload
    if (!payload.paid || typeof payload.sid !== 'string') return null
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

export function getEntitlementSecret(env: Record<string, string>): string | null {
  return env.ENTITLEMENT_SECRET?.trim() || env.STRIPE_SECRET_KEY?.trim() || null
}
