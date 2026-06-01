import type { Env } from '../env'
import { json, readJson } from '../lib/http'
import { verifyToken, getEntitlement, setEntitlementStatus, createToken } from '../lib/entitlement'
import { generateSignatureVariations } from '../lib/openRouter'
import { isRateLimited } from '../lib/rateLimit'

const DEFAULT_MODEL = 'google/gemini-2.5-flash-image'
const MAX_NAME_LENGTH = 80

export async function handleGenerateSignatures(req: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown'
  if (await isRateLimited(env, ip)) return json(429, { error: 'Too many requests, try again in a minute' }, cors)
  if (!env.ENTITLEMENT_SECRET) return json(500, { error: 'Entitlement signing is not configured' }, cors)
  if (!env.OPENROUTER_API_KEY) return json(500, { error: 'OPENROUTER_API_KEY is not set' }, cors)

  const payload = await verifyToken(env.ENTITLEMENT_SECRET, req.headers.get('X-Entitlement-Token') ?? undefined)
  if (!payload) return json(402, { error: 'Payment required for AI signatures' }, cors)

  const state = await getEntitlement(env, payload.sid)
  if (!state) return json(402, { error: 'Payment required for AI signatures' }, cors)
  if (state.status === 'used') {
    return json(403, { error: 'AI generation already used this session. Reuse your saved signature.' }, cors)
  }

  let name = ''
  try {
    const body = (await readJson(req)) as { name?: string }
    name = typeof body.name === 'string' ? body.name.trim() : ''
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    return json(400, { error: message || 'Invalid request' }, cors)
  }
  if (!name) return json(400, { error: 'Name is required' }, cors)
  if (name.length > MAX_NAME_LENGTH) return json(400, { error: `Name too long (max ${MAX_NAME_LENGTH} characters)` }, cors)

  // Claim before generating (replay-proof), roll back on failure.
  await setEntitlementStatus(env, payload.sid, 'used')
  try {
    const model = env.OPENROUTER_IMAGE_MODEL || DEFAULT_MODEL
    const variations = await generateSignatureVariations(env.OPENROUTER_API_KEY, model, name)
    const token = await createToken(env.ENTITLEMENT_SECRET, payload.sid)
    return json(200, { variations, entitlementToken: token, generationUsed: true }, cors)
  } catch {
    await setEntitlementStatus(env, payload.sid, 'unused') // refund the claim
    return json(502, { error: 'Failed to generate signatures' }, cors)
  }
}
