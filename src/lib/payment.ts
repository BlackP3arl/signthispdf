// Starts a BML Connect checkout for a specific previewed signature. The
// previewId binds the payment to the image the user previewed.
export async function startJustOnceCheckout(previewId: string): Promise<void> {
  const response = await fetch('/api/create-transaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ previewId }),
  })
  const body = (await response.json()) as { url?: string; error?: string }
  if (!response.ok || !body.url) {
    throw new Error(body.error ?? 'Failed to start checkout')
  }
  window.location.href = body.url
}

// Verifies a completed BML payment and returns the clean (unwatermarked)
// signature image that was generated at preview time.
export async function verifyCheckoutSession(localId: string): Promise<string> {
  const response = await fetch('/api/verify-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ localId }),
  })
  const body = (await response.json()) as { dataUrl?: string; error?: string }
  if (!response.ok || !body.dataUrl) {
    throw new Error(body.error ?? 'Payment verification failed')
  }
  return body.dataUrl
}
