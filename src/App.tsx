import { useCallback, useMemo, useRef, useState } from 'react'
import type * as pdfjs from 'pdfjs-dist'
import { loadPdfDocument } from './lib/pdfRender'
import { exportSignedPdf } from './lib/exportPdf'
import { sourceToDataUrl } from './lib/signatureImage'
import type { PageMetrics, PlacedSignature, SignatureSource } from './types'
import { PdfViewer } from './components/PdfViewer'
import { SignatureCreator } from './components/SignatureCreator'
import './App.css'

function newId() {
  return crypto.randomUUID()
}

async function defaultSignatureSize(source: SignatureSource): Promise<{ width: number; height: number }> {
  const dataUrl = await sourceToDataUrl(source)
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const maxW = 220
      const scale = Math.min(1, maxW / img.width)
      resolve({
        width: Math.round(img.width * scale),
        height: Math.round(img.height * scale),
      })
    }
    img.src = dataUrl
  })
}

export default function App() {
  const [pdfDoc, setPdfDoc] = useState<pdfjs.PDFDocumentProxy | null>(null)
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null)
  const [fileName, setFileName] = useState('document.pdf')
  const [pageIndex, setPageIndex] = useState(0)
  const [numPages, setNumPages] = useState(0)
  const [signatures, setSignatures] = useState<PlacedSignature[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const pageMetricsRef = useRef<Map<number, PageMetrics>>(new Map())

  const handleFile = async (file: File | null) => {
    if (!file) return
    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    const doc = await loadPdfDocument(bytes)
    setPdfBytes(bytes)
    setPdfDoc(doc)
    setFileName(file.name)
    setNumPages(doc.numPages)
    setPageIndex(0)
    setSignatures([])
    setSelectedId(null)
    pageMetricsRef.current = new Map()
  }

  const onPageMetrics = useCallback((index: number, metrics: PageMetrics) => {
    pageMetricsRef.current.set(index, metrics)
  }, [])

  const placeSignature = async (source: SignatureSource) => {
    const metrics = pageMetricsRef.current.get(pageIndex)
    const size = await defaultSignatureSize(source)
    const width = metrics?.displayWidth ?? 600
    const height = metrics?.displayHeight ?? 800
    const sig: PlacedSignature = {
      id: newId(),
      pageIndex,
      x: Math.max(20, (width - size.width) / 2),
      y: Math.max(20, height - size.height - 80),
      width: size.width,
      height: size.height,
      source,
    }
    setSignatures((prev) => [...prev, sig])
    setSelectedId(sig.id)
  }

  const updateSignature = (id: string, patch: Partial<Pick<PlacedSignature, 'x' | 'y' | 'width' | 'height'>>) => {
    setSignatures((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    )
  }

  const removeSignature = (id: string) => {
    setSignatures((prev) => prev.filter((s) => s.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  const handleExport = async () => {
    if (!pdfBytes || signatures.length === 0) return
    setExporting(true)
    try {
      await exportSignedPdf(pdfBytes, signatures, pageMetricsRef.current, fileName)
    } finally {
      setExporting(false)
    }
  }

  const sigCount = signatures.length
  const canExport = pdfBytes && sigCount > 0

  const pageLabel = useMemo(() => {
    if (!numPages) return ''
    return `Page ${pageIndex + 1} of ${numPages}`
  }, [pageIndex, numPages])

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <div>
            <h1>Sign PDF</h1>
            <p>Add a signature anywhere, then download a signed copy.</p>
          </div>
        </div>
        <div className="header-actions">
          <label className="btn secondary file-btn">
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
            {pdfDoc ? 'Change PDF' : 'Open PDF'}
          </label>
          <button
            type="button"
            className="btn primary"
            disabled={!canExport || exporting}
            onClick={handleExport}
          >
            {exporting ? 'Creating…' : 'Download signed PDF'}
          </button>
        </div>
      </header>

      <main className="app-main">
        <aside className="sidebar">
          <SignatureCreator onCreate={placeSignature} />
          {pdfDoc && (
            <section className="panel meta-panel">
              <p className="file-name">{fileName}</p>
              <p className="sig-count">
                {sigCount === 0
                  ? 'No signatures yet'
                  : `${sigCount} signature${sigCount === 1 ? '' : 's'} on document`}
              </p>
            </section>
          )}
        </aside>

        <section className="workspace">
          {!pdfDoc ? (
            <div className="empty-state">
              <div className="empty-icon" aria-hidden />
              <h2>Open a PDF to begin</h2>
              <p>Your file stays in the browser — nothing is uploaded to a server.</p>
              <label className="btn primary file-btn">
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                />
                Choose PDF
              </label>
            </div>
          ) : (
            <>
              <div className="page-toolbar">
                <button
                  type="button"
                  className="btn icon"
                  disabled={pageIndex <= 0}
                  onClick={() => setPageIndex((p) => p - 1)}
                  aria-label="Previous page"
                >
                  ‹
                </button>
                <span className="page-label">{pageLabel}</span>
                <button
                  type="button"
                  className="btn icon"
                  disabled={pageIndex >= numPages - 1}
                  onClick={() => setPageIndex((p) => p + 1)}
                  aria-label="Next page"
                >
                  ›
                </button>
              </div>
              <PdfViewer
                pdf={pdfDoc}
                pageIndex={pageIndex}
                signatures={signatures}
                selectedId={selectedId}
                onPageMetrics={onPageMetrics}
                onSelect={setSelectedId}
                onUpdateSignature={updateSignature}
                onRemoveSignature={removeSignature}
              />
            </>
          )}
        </section>
      </main>
    </div>
  )
}
