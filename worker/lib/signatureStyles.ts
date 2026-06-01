export type SignatureStyleId = 'elegant' | 'bold' | 'classic'

export type SignatureStyle = {
  id: SignatureStyleId
  label: string
  description: string
  buildPrompt: (name: string) => string
}

const COMMON_SIGNATURE_RULES =
  'Single human autograph only. Looks like naturally signed with a real ballpoint pen by hand. Semi-legible stylized cursive, NOT clean typed lettering, NOT printed calligraphy font. Include natural stroke speed variation, slight shakiness, pressure changes, and subtle connecting flourishes. Black ink on pure white background only. No extra words, no logos, no paper texture, no watermark, no border.'

export const SIGNATURE_STYLES: SignatureStyle[] = [
  {
    id: 'elegant',
    label: 'Elegant script',
    description: 'Flowing cursive with light strokes',
    buildPrompt: (name) =>
      `Generate a realistic hand-signed autograph for the name "${name}". ${COMMON_SIGNATURE_RULES} Style: graceful flowing signature with long entry and exit strokes, smooth loops, and artistic flourish. Signature should feel authentic and a bit hard to read like a real signed name.`,
  },
  {
    id: 'bold',
    label: 'Bold confident',
    description: 'Strong strokes, assertive look',
    buildPrompt: (name) =>
      `Generate a realistic hand-signed autograph for the name "${name}". ${COMMON_SIGNATURE_RULES} Style: bold confident executive signature with strong pressure, fast slanted motion, and compressed letterforms. Keep it stylized and not fully readable like normal typed text.`,
  },
  {
    id: 'classic',
    label: 'Classic formal',
    description: 'Traditional, refined handwriting',
    buildPrompt: (name) =>
      `Generate a realistic hand-signed autograph for the name "${name}". ${COMMON_SIGNATURE_RULES} Style: traditional formal signature with balanced curves, restrained flourish, and mature penmanship. It must look human and naturally imperfect, not like a digital font rendering.`,
  },
]
