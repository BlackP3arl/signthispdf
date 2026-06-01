import type { Env } from '../env'
import { json, readJson } from '../lib/http'
import { generateSignature } from '../lib/openRouter'
import { savePreview } from '../lib/preview'
import { isRateLimited } from '../lib/rateLimit'

const DEFAULT_MODEL = 'google/gemini-2.5-flash-image'
const MAX_NAME_LENGTH = 80
const PREVIEW_MAX_PER_MIN = 3

// Free, pre-payment preview. Generates one premium-calligraphy signature,
// caches the clean image in KV, and returns it with a previewId. The client
// displays it under a watermark overlay until the user pays.
export async function handlePreviewSignature(req: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown'
  if (await isRateLimited(env, ip, PREVIEW_MAX_PER_MIN, 'preview')) {
    return json(429, { error: 'Too many previews, please wait a minute' }, cors)
  }
  if (!env.OPENROUTER_API_KEY) return json(500, { error: 'OPENROUTER_API_KEY is not set' }, cors)

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

  try {
    const model = env.OPENROUTER_IMAGE_MODEL || DEFAULT_MODEL
    const dataUrl = await generateSignature(env.OPENROUTER_API_KEY, model, name)
    const previewId = await savePreview(env, dataUrl)
    return json(200, { previewId, dataUrl }, cors)
  } catch {
    return json(502, { error: 'Failed to generate preview' }, cors)
  }
}
