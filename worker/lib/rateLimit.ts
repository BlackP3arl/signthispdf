import type { Env } from '../env'

const WINDOW_MS = 60_000
const DEFAULT_MAX_REQUESTS = 8

type Window = { count: number; windowStart: number }

// KV-backed fixed-window limiter. Returns true if the caller is over the limit.
// `bucket` namespaces the counter so different endpoints can have different
// limits without sharing a window (e.g. previews are capped tighter than the
// general API). `max` overrides the default per-minute ceiling.
export async function isRateLimited(
  env: Env,
  key: string,
  max = DEFAULT_MAX_REQUESTS,
  bucket = 'default',
): Promise<boolean> {
  const kvKey = `rl:${bucket}:${key}`
  const now = Date.now()
  const raw = await env.ENTITLEMENTS.get(kvKey)
  const win: Window | null = raw ? (JSON.parse(raw) as Window) : null

  if (!win || now - win.windowStart > WINDOW_MS) {
    await env.ENTITLEMENTS.put(kvKey, JSON.stringify({ count: 1, windowStart: now }), { expirationTtl: 120 })
    return false
  }
  win.count += 1
  await env.ENTITLEMENTS.put(kvKey, JSON.stringify(win), { expirationTtl: 120 })
  return win.count > max
}
