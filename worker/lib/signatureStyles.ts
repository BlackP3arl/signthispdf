export type SignatureStyleId = 'premium'

export type SignatureStyle = {
  id: SignatureStyleId
  label: string
  description: string
  buildPrompt: (name: string) => string
}

export function buildPremiumPrompt(name: string): string {
  return `Create a premium handwritten signature logo for the name "${name}".

Style:
Luxury calligraphy, professional personal branding, elegant handwritten signature, natural ink flow, realistic pen pressure variation, flowing connected cursive letters, artistic but readable, strong first letter, sophisticated finishing flourish, balanced composition, authentic handwritten appearance.

Requirements:
- Black ink
- Transparent background
- Vector-style quality
- No fonts
- No clipart
- No symbols
- Handcrafted look
- Professional CEO-level branding
- Suitable for watermark, logo, website, email signature and business cards`
}

export const SIGNATURE_STYLES: SignatureStyle[] = [
  {
    id: 'premium',
    label: 'Premium calligraphy',
    description: 'Luxury handwritten personal branding signature',
    buildPrompt: buildPremiumPrompt,
  },
]
