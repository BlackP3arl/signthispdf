export type SignatureSource =
  | { type: 'image'; dataUrl: string }
  | { type: 'text'; text: string; fontFamily: string; color: string }

export type PlacedSignature = {
  id: string
  pageIndex: number
  x: number
  y: number
  width: number
  height: number
  source: SignatureSource
}

export type PageMetrics = {
  displayWidth: number
  displayHeight: number
  pdfWidth: number
  pdfHeight: number
}
