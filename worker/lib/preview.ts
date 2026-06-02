import type { Env } from '../env'

// Preview images are generated pre-payment, cached in KV, and only the clean
// version is released after a verified payment links the preview to a paid sid.
const PREVIEW_TTL_SECONDS = 60 * 60 // 1h to complete payment
const PAID_TTL_SECONDS = 26 * 60 * 60 // matches entitlement window

// Stores a generated signature image and returns its previewId.
export async function savePreview(env: Env, dataUrl: string): Promise<string> {
  const id = crypto.randomUUID()
  await env.ENTITLEMENTS.put(`preview:${id}`, dataUrl, { expirationTtl: PREVIEW_TTL_SECONDS })
  return id
}

export async function getPreview(env: Env, previewId: string): Promise<string | null> {
  return env.ENTITLEMENTS.get(`preview:${previewId}`)
}

// After payment verifies, copy the clean preview image under the paid sid so the
// client can fetch it. No second OpenRouter call.
export async function linkPreviewToPaid(env: Env, sid: string, previewId: string): Promise<void> {
  const dataUrl = await getPreview(env, previewId)
  if (!dataUrl) throw new Error('Preview not found or expired')
  await env.ENTITLEMENTS.put(`paid:${sid}`, dataUrl, { expirationTtl: PAID_TTL_SECONDS })
}

export async function getPaidSignature(env: Env, sid: string): Promise<string | null> {
  return env.ENTITLEMENTS.get(`paid:${sid}`)
}
