import { buildPremiumPrompt } from './signatureStyles'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const OPENROUTER_TIMEOUT_MS = 30_000

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

// Generates a single premium-calligraphy signature image (data URL) for a name.
export async function generateSignature(apiKey: string, model: string, name: string): Promise<string> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Name is required')

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
      messages: [{ role: 'user', content: buildPremiumPrompt(trimmed) }],
      modalities: ['image', 'text'],
      image_config: { aspect_ratio: '3:2', image_size: '1K' },
    }),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout))

  const body = (await response.json()) as OpenRouterResponse
  if (!response.ok) throw new Error(`OpenRouter request failed (${response.status})`)
  const dataUrl = extractImageDataUrl(body.choices?.[0]?.message)
  if (!dataUrl) throw new Error('Model returned no image')
  return dataUrl
}
