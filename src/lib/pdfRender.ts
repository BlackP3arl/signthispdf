import * as pdfjs from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker

export async function loadPdfDocument(data: Uint8Array) {
  const loadingTask = pdfjs.getDocument({ data: data.slice() })
  return loadingTask.promise
}

export async function renderPageToCanvas(
  pdf: pdfjs.PDFDocumentProxy,
  pageIndex: number,
  canvas: HTMLCanvasElement,
  maxWidth: number,
): Promise<{ pdfWidth: number; pdfHeight: number; displayWidth: number; displayHeight: number }> {
  const page = await pdf.getPage(pageIndex + 1)
  const viewport1 = page.getViewport({ scale: 1 })
  const scale = maxWidth / viewport1.width
  const viewport = page.getViewport({ scale })

  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas not supported')

  canvas.width = viewport.width
  canvas.height = viewport.height

  await page.render({ canvasContext: context, viewport, canvas }).promise

  return {
    pdfWidth: viewport1.width,
    pdfHeight: viewport1.height,
    displayWidth: viewport.width,
    displayHeight: viewport.height,
  }
}
