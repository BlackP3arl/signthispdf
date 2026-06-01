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
