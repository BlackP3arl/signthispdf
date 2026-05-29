import type { IncomingMessage, ServerResponse } from 'node:http'

export const MAX_BODY_BYTES = 4 * 1024

export function getAllowedOrigins(env: Record<string, string>): Set<string> {
  const defaults = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
  ]
  const extra = env.APP_ALLOWED_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean) ?? []
  const appUrl = env.VITE_APP_URL?.trim()
  if (appUrl) extra.push(appUrl)
  return new Set([...defaults, ...extra])
}

export function readJsonBody(req: IncomingMessage, maxBytes = MAX_BODY_BYTES): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let totalBytes = 0
    req.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length
      if (totalBytes > maxBytes) {
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

export function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

export function applyCors(
  req: IncomingMessage,
  res: ServerResponse,
  allowedOrigins: Set<string>,
): string | null {
  const origin = req.headers.origin
  if (!origin || !allowedOrigins.has(origin)) return null
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Origin', origin)
  return origin
}

export function handleOptions(req: IncomingMessage, res: ServerResponse, methods: string): boolean {
  if (req.method !== 'OPTIONS') return false
  res.setHeader('Access-Control-Allow-Methods', methods)
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Entitlement-Token')
  res.statusCode = 204
  res.end()
  return true
}
