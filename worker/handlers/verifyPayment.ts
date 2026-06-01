import type { Env } from '../env'
import { json, readJson } from '../lib/http'
import { getTransaction, isPaid } from '../lib/bml'
import { linkPreviewToPaid, getPaidSignature } from '../lib/preview'

// Confirms a BML payment server-side and, on success, releases the clean
// (unwatermarked) signature that was generated at preview time. The paid BML
// transaction is the entitlement — no token is issued.
export async function handleVerifyPayment(req: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  let sid = ''
  try {
    const body = (await readJson(req)) as { localId?: string }
    sid = typeof body.localId === 'string' ? body.localId.trim() : ''
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    return json(400, { error: message || 'Invalid request' }, cors)
  }
  if (!sid) return json(400, { error: 'localId is required' }, cors)

  // Idempotency: if this sid was already verified, return the clean signature.
  const already = await getPaidSignature(env, sid)
  if (already) return json(200, { dataUrl: already, plan: 'just_once' }, cors)

  const pendingRaw = await env.ENTITLEMENTS.get(`pending:${sid}`)
  if (!pendingRaw) return json(402, { error: 'Payment not found' }, cors)
  const { bmlTxnId, previewId } = JSON.parse(pendingRaw) as { bmlTxnId: string; previewId: string }

  try {
    const txn = await getTransaction(env, bmlTxnId)
    if (!isPaid(txn)) return json(402, { error: 'Payment not completed' }, cors)
    await linkPreviewToPaid(env, sid, previewId)
    const dataUrl = await getPaidSignature(env, sid)
    if (!dataUrl) return json(410, { error: 'Preview expired before payment completed' }, cors)
    return json(200, { dataUrl, plan: 'just_once' }, cors)
  } catch {
    return json(502, { error: 'Failed to verify payment' }, cors)
  }
}
