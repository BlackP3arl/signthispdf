import type { Env } from '../env'
import { json, readJson } from '../lib/http'
import { getTransaction, isPaid } from '../lib/bml'
import { createToken, seedEntitlement } from '../lib/entitlement'

export async function handleVerifyPayment(req: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  if (!env.ENTITLEMENT_SECRET) return json(500, { error: 'Entitlement signing is not configured' }, cors)

  let sid = ''
  try {
    const body = (await readJson(req)) as { localId?: string }
    sid = typeof body.localId === 'string' ? body.localId.trim() : ''
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    return json(400, { error: message || 'Invalid request' }, cors)
  }
  if (!sid) return json(400, { error: 'localId is required' }, cors)

  const pendingRaw = await env.ENTITLEMENTS.get(`pending:${sid}`)
  if (!pendingRaw) return json(402, { error: 'Payment not found' }, cors)
  const { bmlTxnId } = JSON.parse(pendingRaw) as { bmlTxnId: string }

  try {
    const txn = await getTransaction(env, bmlTxnId)
    if (!isPaid(txn)) return json(402, { error: 'Payment not completed' }, cors)
    await seedEntitlement(env, sid)
    const token = await createToken(env.ENTITLEMENT_SECRET, sid)
    return json(200, { entitlementToken: token, plan: 'just_once', generationUsed: false }, cors)
  } catch {
    return json(502, { error: 'Failed to verify payment' }, cors)
  }
}
