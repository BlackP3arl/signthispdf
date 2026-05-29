import { useEffect, useState } from 'react'
import type { SignatureSource } from '../types'
import { generateAiSignatures, type AiSignatureVariation } from '../lib/generateAiSignatures'
import { processSignatureImage } from '../lib/processSignatureImage'
import { textToDataUrl } from '../lib/signatureImage'

const FONTS = [
  { id: 'cursive', label: 'Script', family: '"Segoe Script", "Brush Script MT", cursive' },
  { id: 'serif', label: 'Classic', family: 'Georgia, "Times New Roman", serif' },
  { id: 'mono', label: 'Modern', family: '"SF Mono", "Consolas", monospace' },
]

type TextMode = 'simple' | 'ai'

type Props = {
  onCreate: (source: SignatureSource) => void
}

export function SignatureCreator({ onCreate }: Props) {
  const [mode, setMode] = useState<'image' | 'text'>('text')
  const [textMode, setTextMode] = useState<TextMode>('simple')
  const [text, setText] = useState('')
  const [fontId, setFontId] = useState(FONTS[0].id)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [textPreview, setTextPreview] = useState<string | null>(null)

  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiVariations, setAiVariations] = useState<AiSignatureVariation[]>([])
  const [selectedVariationId, setSelectedVariationId] = useState<string | null>(null)
  const [processedPreview, setProcessedPreview] = useState<string | null>(null)

  const font = FONTS.find((f) => f.id === fontId) ?? FONTS[0]
  const selectedVariation = aiVariations.find((v) => v.id === selectedVariationId) ?? null

  useEffect(() => {
    if (mode !== 'text' || textMode !== 'simple' || !text.trim()) {
      setTextPreview(null)
      return
    }
    setTextPreview(textToDataUrl(text.trim(), font.family, '#1a2744'))
  }, [mode, textMode, text, font.family])

  useEffect(() => {
    if (!selectedVariation) {
      setProcessedPreview(null)
      return
    }
    let cancelled = false
    processSignatureImage(selectedVariation.dataUrl)
      .then((url) => {
        if (!cancelled) setProcessedPreview(url)
      })
      .catch(() => {
        if (!cancelled) setProcessedPreview(selectedVariation.dataUrl)
      })
    return () => {
      cancelled = true
    }
  }, [selectedVariation])

  const resetAi = () => {
    setAiVariations([])
    setSelectedVariationId(null)
    setAiError(null)
    setProcessedPreview(null)
  }

  const handleImage = (file: File | null) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setImagePreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleGenerateAi = async () => {
    if (!text.trim()) return
    setAiLoading(true)
    setAiError(null)
    resetAi()
    try {
      const variations = await generateAiSignatures(text)
      setAiVariations(variations)
      if (variations.length === 1) {
        setSelectedVariationId(variations[0].id)
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setAiLoading(false)
    }
  }

  const handleAdd = () => {
    if (mode === 'image' && imagePreview) {
      onCreate({ type: 'image', dataUrl: imagePreview })
      setImagePreview(null)
      return
    }

    if (mode === 'text' && textMode === 'simple' && text.trim()) {
      onCreate({
        type: 'text',
        text: text.trim(),
        fontFamily: font.family,
        color: '#1a2744',
      })
      return
    }

    if (mode === 'text' && textMode === 'ai' && processedPreview) {
      onCreate({ type: 'image', dataUrl: processedPreview })
      resetAi()
      setText('')
    }
  }

  const canAdd =
    (mode === 'image' && imagePreview) ||
    (mode === 'text' && textMode === 'simple' && text.trim().length > 0) ||
    (mode === 'text' && textMode === 'ai' && !!processedPreview)

  return (
    <section className="panel signature-creator">
      <h2>Your signature</h2>
      <div className="mode-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'text'}
          className={mode === 'text' ? 'active' : ''}
          onClick={() => setMode('text')}
        >
          Type
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'image'}
          className={mode === 'image' ? 'active' : ''}
          onClick={() => setMode('image')}
        >
          Image
        </button>
      </div>

      {mode === 'text' ? (
        <div className="creator-body">
          <div className="sub-mode-tabs" role="tablist" aria-label="Signature style">
            <button
              type="button"
              role="tab"
              aria-selected={textMode === 'simple'}
              className={textMode === 'simple' ? 'active' : ''}
              onClick={() => {
                setTextMode('simple')
                resetAi()
              }}
            >
              Simple
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={textMode === 'ai'}
              className={textMode === 'ai' ? 'active' : ''}
              onClick={() => setTextMode('ai')}
            >
              AI signature
            </button>
          </div>

          <label className="field">
            <span>Name / signature</span>
            <input
              type="text"
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                if (textMode === 'ai') resetAi()
              }}
              placeholder="Jane Doe"
              autoComplete="off"
            />
          </label>

          {textMode === 'simple' ? (
            <>
              <label className="field">
                <span>Style</span>
                <select value={fontId} onChange={(e) => setFontId(e.target.value)}>
                  {FONTS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              {textPreview && (
                <div className="preview-box">
                  <img src={textPreview} alt="Signature preview" />
                </div>
              )}
            </>
          ) : (
            <>
              <p className="ai-intro">
                Generates three handwritten-style signatures from your name using Gemini via
                OpenRouter.
              </p>
              <button
                type="button"
                className="btn secondary generate-btn"
                disabled={!text.trim() || aiLoading}
                onClick={handleGenerateAi}
              >
                {aiLoading ? 'Generating 3 options…' : 'Generate signatures'}
              </button>

              {aiError && <p className="error-text">{aiError}</p>}

              {aiLoading && (
                <div className="variation-grid loading">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="variation-card skeleton" aria-hidden />
                  ))}
                </div>
              )}

              {!aiLoading && aiVariations.length > 0 && (
                <>
                  <p className="pick-label">Choose one</p>
                  <div className="variation-grid" role="listbox" aria-label="AI signature options">
                    {aiVariations.map((variation) => (
                      <button
                        key={variation.id}
                        type="button"
                        role="option"
                        aria-selected={selectedVariationId === variation.id}
                        className={`variation-card${selectedVariationId === variation.id ? ' selected' : ''}`}
                        onClick={() => setSelectedVariationId(variation.id)}
                      >
                        <img src={variation.dataUrl} alt={variation.label} />
                        <span className="variation-label">{variation.label}</span>
                        <span className="variation-desc">{variation.description}</span>
                      </button>
                    ))}
                  </div>
                  {processedPreview && (
                    <div className="preview-box">
                      <span className="preview-caption">Selected (background removed)</span>
                      <img src={processedPreview} alt="Selected signature" />
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="creator-body">
          <label className="file-drop">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={(e) => handleImage(e.target.files?.[0] ?? null)}
            />
            <span>Drop an image or click to browse</span>
            <small>PNG, JPG, WebP, SVG</small>
          </label>
          {imagePreview && (
            <div className="preview-box">
              <img src={imagePreview} alt="Uploaded signature" />
            </div>
          )}
        </div>
      )}

      <button type="button" className="btn primary" disabled={!canAdd} onClick={handleAdd}>
        Place on page
      </button>
      <p className="hint">Drag to move · corner handle to resize</p>
    </section>
  )
}
