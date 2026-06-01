import { markGenerationUsed, setEntitlementToken } from './aiEntitlement'

export async function startJustOnceCheckout(): Promise<void> {
  const response = await fetch('/api/create-transaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
  const body = (await response.json()) as { url?: string; error?: string }
  if (!response.ok || !body.url) {
    throw new Error(body.error ?? 'Failed to start checkout')
  }
  window.location.href = body.url
}

export async function verifyCheckoutSession(localId: string): Promise<void> {
  const response = await fetch('/api/verify-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ localId }),
  })
  const body = (await response.json()) as {
    entitlementToken?: string
    generationUsed?: boolean
    error?: string
  }
  if (!response.ok || !body.entitlementToken) {
    throw new Error(body.error ?? 'Payment verification failed')
  }
  setEntitlementToken(body.entitlementToken)
  if (body.generationUsed) {
    markGenerationUsed()
  }
}
