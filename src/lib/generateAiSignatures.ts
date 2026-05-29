import { getEntitlementToken, markGenerationUsed, setEntitlementToken } from './aiEntitlement'

export type AiSignatureVariation = {
  id: string
  label: string
  description: string
  dataUrl: string
}

export async function generateAiSignatures(name: string): Promise<AiSignatureVariation[]> {
  const token = getEntitlementToken()
  if (!token) {
    throw new Error('Payment required for AI signatures')
  }

  const response = await fetch('/api/generate-signatures', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Entitlement-Token': token,
    },
    body: JSON.stringify({ name: name.trim() }),
  })

  const body = (await response.json()) as {
    variations?: AiSignatureVariation[]
    entitlementToken?: string
    generationUsed?: boolean
    error?: string
  }

  if (!response.ok) {
    throw new Error(body.error ?? 'Failed to generate signatures')
  }

  if (body.entitlementToken) {
    setEntitlementToken(body.entitlementToken)
  }
  if (body.generationUsed) {
    markGenerationUsed()
  }

  if (!body.variations?.length) {
    throw new Error('No signature variations were returned')
  }

  return body.variations
}
