import { PDFDocument } from 'pdf-lib'
import type { PageMetrics, PlacedSignature } from '../types'
import { dataUrlToBytes, sourceToDataUrl } from './signatureImage'

export async function exportSignedPdf(
  pdfBytes: Uint8Array,
  signatures: PlacedSignature[],
  pageMetrics: Map<number, PageMetrics>,
  fileName: string,
): Promise<void> {
  const pdfDoc = await PDFDocument.load(pdfBytes)
  const pages = pdfDoc.getPages()

  const byPage = new Map<number, PlacedSignature[]>()
  for (const sig of signatures) {
    const list = byPage.get(sig.pageIndex) ?? []
    list.push(sig)
    byPage.set(sig.pageIndex, list)
  }

  for (const [pageIndex, pageSigs] of byPage) {
    const page = pages[pageIndex]
    const metrics = pageMetrics.get(pageIndex)
    if (!page || !metrics) continue

    const { pdfWidth, pdfHeight, displayWidth, displayHeight } = metrics
    const scaleX = pdfWidth / displayWidth
    const scaleY = pdfHeight / displayHeight

    for (const sig of pageSigs) {
      const dataUrl = await sourceToDataUrl(sig.source)
      const pngBytes = dataUrlToBytes(dataUrl)
      const image = await pdfDoc.embedPng(pngBytes)

      const pdfW = sig.width * scaleX
      const pdfH = sig.height * scaleY
      const pdfX = sig.x * scaleX
      const pdfY = pdfHeight - (sig.y + sig.height) * scaleY

      page.drawImage(image, {
        x: pdfX,
        y: pdfY,
        width: pdfW,
        height: pdfH,
      })
    }
  }

  const signedBytes = await pdfDoc.save()
  const blob = new Blob([Uint8Array.from(signedBytes)], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName.replace(/\.pdf$/i, '') + '-signed.pdf'
  anchor.click()
  URL.revokeObjectURL(url)
}
