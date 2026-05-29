import type { IncomingMessage, ServerResponse } from 'node:http'
import { createEntitlementToken, getEntitlementSecret } from './entitlement'
import {
  applyCors,
  getAllowedOrigins,
  handleOptions,
  readJsonBody,
  sendJson,
} from './httpUtils'
import { createJustOnceCheckout, getStripe, verifyJustOncePayment } from './stripe'

export function createCheckoutHandler(env: Record<string, string>) {
  const allowedOrigins = getAllowedOrigins(env)

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

    const stripe = getStripe(env)
    if (!stripe) {
      sendJson(res, 500, { error: 'Stripe is not configured' })
      return
    }

    try {
      const origin = req.headers.origin as string
      const url = await createJustOnceCheckout(stripe, env, origin)
      sendJson(res, 200, { url })
    } catch {
      sendJson(res, 502, { error: 'Failed to start checkout' })
    }
  }
}

export function createVerifyPaymentHandler(env: Record<string, string>) {
  const allowedOrigins = getAllowedOrigins(env)
  const secret = getEntitlementSecret(env)

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

    if (!secret) {
      sendJson(res, 500, { error: 'Entitlement signing is not configured' })
      return
    }

    const stripe = getStripe(env)
    if (!stripe) {
      sendJson(res, 500, { error: 'Stripe is not configured' })
      return
    }

    try {
      const body = (await readJsonBody(req)) as { sessionId?: string }
      const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
      if (!sessionId) {
        sendJson(res, 400, { error: 'sessionId is required' })
        return
      }

      const { paid, sessionId: verifiedId } = await verifyJustOncePayment(stripe, sessionId)
      if (!paid) {
        sendJson(res, 402, { error: 'Payment not completed' })
        return
      }

      const entitlementToken = createEntitlementToken(secret, verifiedId, false)
      sendJson(res, 200, {
        entitlementToken,
        plan: 'just_once',
        generationUsed: false,
      })
    } catch {
      sendJson(res, 502, { error: 'Failed to verify payment' })
    }
  }
}
