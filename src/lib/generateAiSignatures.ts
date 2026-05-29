export type AiSignatureVariation = {
  id: string
  label: string
  description: string
  dataUrl: string
}

export async function generateAiSignatures(name: string): Promise<AiSignatureVariation[]> {
  const response = await fetch('/api/generate-signatures', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.trim() }),
  })

  const body = (await response.json()) as {
    variations?: AiSignatureVariation[]
    error?: string
  }

  if (!response.ok) {
    throw new Error(body.error ?? 'Failed to generate signatures')
  }

  if (!body.variations?.length) {
    throw new Error('No signature variations were returned')
  }

  return body.variations
}
