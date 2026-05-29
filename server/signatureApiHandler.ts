import type { IncomingMessage, ServerResponse } from 'node:http'
import { createEntitlementToken, getEntitlementSecret, verifyEntitlementToken } from './entitlement'
import {
  applyCors,
  getAllowedOrigins,
  handleOptions,
  readJsonBody,
  sendJson,
} from './httpUtils'
import { generateSignatureVariations } from './openRouter'

const DEFAULT_MODEL = 'google/gemini-2.5-flash-image'
const MAX_NAME_LENGTH = 80
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 8

type RateLimitEntry = {
  count: number
  windowStart: number
}

const requestCounters = new Map<string, RateLimitEntry>()

function isRateLimited(key: string): boolean {
  const now = Date.now()
  const existing = requestCounters.get(key)
  if (!existing || now - existing.windowStart > RATE_LIMIT_WINDOW_MS) {
    requestCounters.set(key, { count: 1, windowStart: now })
    return false
  }
  existing.count += 1
  requestCounters.set(key, existing)
  return existing.count > RATE_LIMIT_MAX_REQUESTS
}

export function createSignatureApiHandler(env: Record<string, string>) {
  const allowedOrigins = getAllowedOrigins(env)
  const entitlementSecret = getEntitlementSecret(env)

  return async (req: IncomingMessage, res: ServerResponse) => {
    if (!applyCors(req, res, allowedOrigins)) {
      sendJson(res, 403, { error: 'Forbidden origin' })
      return
    }
    if (handleOptions(req, res, 'POST, OPTIONS')) return

    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }

    const contentType = req.headers['content-type'] ?? ''
    if (!contentType.toLowerCase().startsWith('application/json')) {
      sendJson(res, 415, { error: 'Content-Type must be application/json' })
      return
    }

    const rateLimitKey = req.socket.remoteAddress ?? 'unknown'
    if (isRateLimited(rateLimitKey)) {
      sendJson(res, 429, { error: 'Too many requests, try again in a minute' })
      return
    }

    if (!entitlementSecret) {
      sendJson(res, 500, { error: 'Entitlement signing is not configured' })
      return
    }

    const entitlementToken = req.headers['x-entitlement-token']
    const tokenValue = Array.isArray(entitlementToken) ? entitlementToken[0] : entitlementToken
    const entitlement = verifyEntitlementToken(entitlementSecret, tokenValue)
    if (!entitlement?.paid) {
      sendJson(res, 402, { error: 'Payment required for AI signatures' })
      return
    }
    if (entitlement.used) {
      sendJson(res, 403, {
        error: 'AI generation already used this session. Reuse your saved signature.',
      })
      return
    }

    const apiKey = env.OPENROUTER_API_KEY
    if (!apiKey) {
      sendJson(res, 500, {
        error: 'OPENROUTER_API_KEY is not set. Add it to a .env file in the project root.',
      })
      return
    }

    try {
      const body = (await readJsonBody(req)) as { name?: string }
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (!name) {
        sendJson(res, 400, { error: 'Name is required' })
        return
      }
      if (name.length > MAX_NAME_LENGTH) {
        sendJson(res, 400, { error: `Name too long (max ${MAX_NAME_LENGTH} characters)` })
        return
      }

      const model = env.OPENROUTER_IMAGE_MODEL || DEFAULT_MODEL
      const variations = await generateSignatureVariations(apiKey, model, name)
      const updatedToken = createEntitlementToken(entitlementSecret, entitlement.sid, true)
      sendJson(res, 200, { variations, entitlementToken: updatedToken, generationUsed: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      const status =
        message === 'Invalid JSON body' || message === 'Request body too large' ? 400 : 502
      const safeError = status === 400 ? message : 'Failed to generate signatures'
      sendJson(res, status, { error: safeError })
    }
  }
}
