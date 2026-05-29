import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlacedSignature as PlacedSignatureType } from '../types'
import { sourceToDataUrl } from '../lib/signatureImage'

type Props = {
  signature: PlacedSignatureType
  selected: boolean
  onSelect: () => void
  onChange: (patch: Partial<Pick<PlacedSignatureType, 'x' | 'y' | 'width' | 'height'>>) => void
  onRemove: () => void
}

type DragMode = 'move' | 'resize' | null

export function PlacedSignatureOverlay({
  signature,
  selected,
  onSelect,
  onChange,
  onRemove,
}: Props) {
  const [previewUrl, setPreviewUrl] = useState<string>('')
  const dragRef = useRef<{
    mode: DragMode
    startX: number
    startY: number
    origX: number
    origY: number
    origW: number
    origH: number
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    sourceToDataUrl(signature.source).then((url) => {
      if (!cancelled) setPreviewUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [signature.source])

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current
      if (!drag?.mode) return
      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY

      if (drag.mode === 'move') {
        onChange({ x: drag.origX + dx, y: drag.origY + dy })
      } else {
        const newW = Math.max(40, drag.origW + dx)
        const newH = Math.max(24, drag.origH + dy)
        onChange({ width: newW, height: newH })
      }
    },
    [onChange],
  )

  const endDrag = useCallback(() => {
    dragRef.current = null
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', endDrag)
  }, [onPointerMove])

  const startDrag = (mode: DragMode, e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    onSelect()
    dragRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origX: signature.x,
      origY: signature.y,
      origW: signature.width,
      origH: signature.height,
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', endDrag)
  }

  return (
    <div
      className={`placed-signature${selected ? ' selected' : ''}`}
      style={{
        left: signature.x,
        top: signature.y,
        width: signature.width,
        height: signature.height,
      }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('.resize-handle, .remove-btn')) return
        startDrag('move', e)
      }}
    >
      {previewUrl && <img src={previewUrl} alt="" draggable={false} />}
      {selected && (
        <>
          <button
            type="button"
            className="remove-btn"
            aria-label="Remove signature"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
          >
            ×
          </button>
          <span
            className="resize-handle"
            onPointerDown={(e) => startDrag('resize', e)}
          />
        </>
      )}
    </div>
  )
}
