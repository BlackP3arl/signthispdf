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
