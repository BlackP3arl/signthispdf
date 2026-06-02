export type AiPreview = {
  previewId: string
  dataUrl: string
}

// Free, pre-payment preview: generates one premium signature and returns the
// (clean) image plus a previewId the user pays to unlock. The image is shown
// under a watermark overlay in the UI until payment completes.
export async function previewAiSignature(name: string): Promise<AiPreview> {
  const response = await fetch('/api/preview-signature', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.trim() }),
  })

  const body = (await response.json()) as {
    previewId?: string
    dataUrl?: string
    error?: string
  }

  if (!response.ok || !body.previewId || !body.dataUrl) {
    throw new Error(body.error ?? 'Failed to generate preview')
  }

  return { previewId: body.previewId, dataUrl: body.dataUrl }
}
