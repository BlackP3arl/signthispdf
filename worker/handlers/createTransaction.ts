import type { Env } from '../env'
import { json, readJson } from '../lib/http'
import { createTransaction } from '../lib/bml'
import { getPreview } from '../lib/preview'
import { isRateLimited } from '../lib/rateLimit'

const AMOUNT = 2000 // MVR 20.00 in laari
const CURRENCY = 'MVR'

export async function handleCreateTransaction(req: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown'
  if (await isRateLimited(env, ip)) return json(429, { error: 'Too many requests, try again in a minute' }, cors)
  if (!env.BML_API_KEY) return json(500, { error: 'Payment gateway is not configured' }, cors)

  // The client pays for a specific previewed signature. Require it and confirm
  // it still exists before starting a charge.
  let previewId = ''
  try {
    const body = (await readJson(req)) as { previewId?: string }
    previewId = typeof body.previewId === 'string' ? body.previewId.trim() : ''
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    return json(400, { error: message || 'Invalid request' }, cors)
  }
  if (!previewId) return json(400, { error: 'Preview a signature before paying' }, cors)
  if (!(await getPreview(env, previewId))) {
    return json(410, { error: 'Preview expired. Please preview your signature again.' }, cors)
  }

  const sid = crypto.randomUUID()
  const redirectUrl = `${env.APP_URL}/?payment=success&local_id=${sid}`

  try {
    const txn = await createTransaction(env, { amount: AMOUNT, currency: CURRENCY, localId: sid, redirectUrl })
    if (!txn.url) throw new Error('BML returned no payment URL')
    // previewId is bound to the transaction server-side so it survives the BML
    // redirect without ever being exposed in the URL.
    await env.ENTITLEMENTS.put(`pending:${sid}`, JSON.stringify({ bmlTxnId: txn.id, previewId }), { expirationTtl: 3600 })
    return json(200, { url: txn.url }, cors)
  } catch {
    return json(502, { error: 'Failed to start checkout' }, cors)
  }
}
