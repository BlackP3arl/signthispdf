import type { IncomingMessage, ServerResponse } from 'node:http'
import { createCheckoutHandler, createVerifyPaymentHandler } from './paymentHandlers'
import { createSignatureApiHandler } from './signatureApiHandler'

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>

export function createApiRouter(env: Record<string, string>): Handler {
  const routes: Record<string, Handler> = {
    '/generate-signatures': createSignatureApiHandler(env),
    '/create-checkout-session': createCheckoutHandler(env),
    '/verify-payment': createVerifyPaymentHandler(env),
  }

  return async (req, res) => {
    const raw = req.url?.split('?')[0] ?? ''
    const url = raw.startsWith('/api') ? raw.slice(4) || '/' : raw
    const handler = routes[url]
    if (!handler) {
      res.statusCode = 404
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Not found' }))
      return
    }
    await handler(req, res)
  }
}
