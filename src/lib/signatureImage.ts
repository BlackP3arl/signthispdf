const TEXT_PADDING = 12

export function textToDataUrl(
  text: string,
  fontFamily: string,
  color: string,
): string {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')

  const fontSize = 42
  ctx.font = `${fontSize}px ${fontFamily}`
  const metrics = ctx.measureText(text)
  const width = Math.ceil(metrics.width) + TEXT_PADDING * 2
  const height = fontSize + TEXT_PADDING * 2

  canvas.width = width
  canvas.height = height

  ctx.font = `${fontSize}px ${fontFamily}`
  ctx.fillStyle = color
  ctx.textBaseline = 'middle'
  ctx.fillText(text, TEXT_PADDING, height / 2)

  return canvas.toDataURL('image/png')
}

export async function sourceToDataUrl(source: {
  type: 'image'
  dataUrl: string
} | {
  type: 'text'
  text: string
  fontFamily: string
  color: string
}): Promise<string> {
  if (source.type === 'image') return source.dataUrl
  return textToDataUrl(source.text, source.fontFamily, source.color)
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1]
  if (!base64) throw new Error('Invalid data URL')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
