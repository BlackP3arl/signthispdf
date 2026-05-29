import { useCallback, useEffect, useRef, useState } from 'react'
import type * as pdfjs from 'pdfjs-dist'
import { renderPageToCanvas } from '../lib/pdfRender'
import type { PageMetrics, PlacedSignature } from '../types'
import { PlacedSignatureOverlay } from './PlacedSignature'

type Props = {
  pdf: pdfjs.PDFDocumentProxy
  pageIndex: number
  signatures: PlacedSignature[]
  selectedId: string | null
  onPageMetrics: (pageIndex: number, metrics: PageMetrics) => void
  onSelect: (id: string | null) => void
  onUpdateSignature: (id: string, patch: Partial<Pick<PlacedSignature, 'x' | 'y' | 'width' | 'height'>>) => void
  onRemoveSignature: (id: string) => void
}

export function PdfViewer({
  pdf,
  pageIndex,
  signatures,
  selectedId,
  onPageMetrics,
  onSelect,
  onUpdateSignature,
  onRemoveSignature,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 })

  const renderPage = useCallback(async () => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const maxWidth = Math.min(container.clientWidth - 2, 720)
    const metrics = await renderPageToCanvas(pdf, pageIndex, canvas, maxWidth)
    setPageSize({ width: metrics.displayWidth, height: metrics.displayHeight })
    onPageMetrics(pageIndex, {
      displayWidth: metrics.displayWidth,
      displayHeight: metrics.displayHeight,
      pdfWidth: metrics.pdfWidth,
      pdfHeight: metrics.pdfHeight,
    })
  }, [pdf, pageIndex, onPageMetrics])

  useEffect(() => {
    renderPage()
    const ro = new ResizeObserver(() => renderPage())
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [renderPage])

  const pageSignatures = signatures.filter((s) => s.pageIndex === pageIndex)

  return (
    <div
      className="pdf-stage"
      ref={containerRef}
      onPointerDown={() => onSelect(null)}
    >
      <div
        className="page-surface"
        style={{ width: pageSize.width, height: pageSize.height }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <canvas ref={canvasRef} className="pdf-canvas" />
        <div className="signature-layer">
          {pageSignatures.map((sig) => (
            <PlacedSignatureOverlay
              key={sig.id}
              signature={sig}
              selected={selectedId === sig.id}
              onSelect={() => onSelect(sig.id)}
              onChange={(patch) => onUpdateSignature(sig.id, patch)}
              onRemove={() => onRemoveSignature(sig.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
