import type { IncomingMessage, ServerResponse } from 'node:http'
import { generateSignatureVariations } from './openRouter'

const DEFAULT_MODEL = 'google/gemini-2.5-flash-image'
const MAX_BODY_BYTES = 4 * 1024
const MAX_NAME_LENGTH = 80
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 8
const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
])

type RateLimitEntry = {
  count: number
  windowStart: number
}

const requestCounters = new Map<string, RateLimitEntry>()

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let totalBytes = 0
    req.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length
      if (totalBytes > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        reject(new Error('Invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false
  return ALLOWED_ORIGINS.has(origin)
}

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
  return async (req: IncomingMessage, res: ServerResponse) => {
    const origin = req.headers.origin
    if (!isAllowedOrigin(origin)) {
      sendJson(res, 403, { error: 'Forbidden origin' })
      return
    }
    const allowedOrigin = origin as string
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin)

    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      res.statusCode = 204
      res.end()
      return
    }

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
      sendJson(res, 200, { variations })
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      const status =
        message === 'Invalid JSON body' || message === 'Request body too large' ? 400 : 502
      const safeError = status === 400 ? message : 'Failed to generate signatures'
      sendJson(res, status, { error: safeError })
    }
  }
}
