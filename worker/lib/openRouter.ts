import { SIGNATURE_STYLES, type SignatureStyleId } from './signatureStyles'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const OPENROUTER_TIMEOUT_MS = 20_000

export type GeneratedVariation = {
  id: SignatureStyleId
  label: string
  description: string
  dataUrl: string
}

type OpenRouterMessage = {
  role: string
  content?: string
  images?: Array<{ type?: string; image_url?: { url?: string } }>
}

type OpenRouterResponse = {
  choices?: Array<{ message?: OpenRouterMessage }>
  error?: { message?: string }
}

function extractImageDataUrl(message: OpenRouterMessage | undefined): string | null {
  if (!message?.images?.length) return null
  const url = message.images[0]?.image_url?.url
  return url?.startsWith('data:image') ? url : null
}

async function generateOne(apiKey: string, model: string, styleId: SignatureStyleId, name: string): Promise<GeneratedVariation> {
  const style = SIGNATURE_STYLES.find((s) => s.id === styleId)
  if (!style) throw new Error(`Unknown style: ${styleId}`)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS)

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://signthispdf.com',
      'X-Title': 'SignThisPDF',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: style.buildPrompt(name) }],
      modalities: ['image', 'text'],
      image_config: { aspect_ratio: '3:2', image_size: '1K' },
    }),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout))

  const body = (await response.json()) as OpenRouterResponse
  if (!response.ok) throw new Error(`OpenRouter request failed (${response.status})`)
  const dataUrl = extractImageDataUrl(body.choices?.[0]?.message)
  if (!dataUrl) throw new Error('Model returned no image')

  return { id: style.id, label: style.label, description: style.description, dataUrl }
}

export async function generateSignatureVariations(apiKey: string, model: string, name: string): Promise<GeneratedVariation[]> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Name is required')

  const results = await Promise.allSettled(
    SIGNATURE_STYLES.map((style) => generateOne(apiKey, model, style.id, trimmed)),
  )
  const ok = results
    .filter((r): r is PromiseFulfilledResult<GeneratedVariation> => r.status === 'fulfilled')
    .map((r) => r.value)
  if (ok.length === 0) {
    const firstError = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined
    throw new Error(firstError?.reason?.message ?? 'All signature generations failed')
  }
  return ok
}
