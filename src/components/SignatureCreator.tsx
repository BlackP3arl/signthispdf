import { useEffect, useState } from 'react'
import type { SignatureSource } from '../types'
import {
  getSavedAiSignature,
  hasPaidAccess,
  isGenerationUsed,
  saveAiSignature,
} from '../lib/aiEntitlement'
import { generateAiSignatures, type AiSignatureVariation } from '../lib/generateAiSignatures'
import { startJustOnceCheckout } from '../lib/payment'
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
  paymentNotice?: string | null
  paymentVerifying?: boolean
}

export function SignatureCreator({ onCreate, paymentNotice, paymentVerifying }: Props) {
  const [mode, setMode] = useState<'image' | 'text'>('text')
  const [textMode, setTextMode] = useState<TextMode>('simple')
  const [text, setText] = useState('')
  const [fontId, setFontId] = useState(FONTS[0].id)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [textPreview, setTextPreview] = useState<string | null>(null)

  const [paid, setPaid] = useState(hasPaidAccess)
  const [generationUsed, setGenerationUsed] = useState(isGenerationUsed)
  const [savedSignature, setSavedSignature] = useState<string | null>(getSavedAiSignature)
  const [checkoutLoading, setCheckoutLoading] = useState(false)

  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiVariations, setAiVariations] = useState<AiSignatureVariation[]>([])
  const [selectedVariationId, setSelectedVariationId] = useState<string | null>(null)
  const [processedPreview, setProcessedPreview] = useState<string | null>(null)

  const font = FONTS.find((f) => f.id === fontId) ?? FONTS[0]
  const selectedVariation = aiVariations.find((v) => v.id === selectedVariationId) ?? null
  const activeAiSignature = processedPreview ?? savedSignature

  useEffect(() => {
    if (paymentNotice?.includes('successful')) {
      setPaid(hasPaidAccess())
      setGenerationUsed(isGenerationUsed())
    }
  }, [paymentNotice])

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
        if (!cancelled) {
          setProcessedPreview(url)
          saveAiSignature(url)
          setSavedSignature(url)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProcessedPreview(selectedVariation.dataUrl)
          saveAiSignature(selectedVariation.dataUrl)
          setSavedSignature(selectedVariation.dataUrl)
        }
      })
    return () => {
      cancelled = true
    }
  }, [selectedVariation])

  const resetAiVariations = () => {
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

  const handleCheckout = async () => {
    setCheckoutLoading(true)
    setAiError(null)
    try {
      await startJustOnceCheckout()
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Checkout failed')
      setCheckoutLoading(false)
    }
  }

  const handleGenerateAi = async () => {
    if (!text.trim() || generationUsed) return
    setAiLoading(true)
    setAiError(null)
    resetAiVariations()
    try {
      const variations = await generateAiSignatures(text)
      setAiVariations(variations)
      setGenerationUsed(true)
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

    if (mode === 'text' && textMode === 'ai' && activeAiSignature) {
      onCreate({ type: 'image', dataUrl: activeAiSignature })
    }
  }

  const canAdd =
    (mode === 'image' && imagePreview) ||
    (mode === 'text' && textMode === 'simple' && text.trim().length > 0) ||
    (mode === 'text' && textMode === 'ai' && !!activeAiSignature)

  return (
    <section className="panel signature-creator">
      <h2>Your signature</h2>
      {paymentNotice && <p className="payment-notice">{paymentNotice}</p>}
      {paymentVerifying && <p className="payment-notice">Verifying payment…</p>}

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
                resetAiVariations()
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
                if (textMode === 'ai' && !generationUsed) resetAiVariations()
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
          ) : !paid ? (
            <div className="paywall">
              <p className="plan-name">Plan 1: Just Once</p>
              <p className="plan-price">$1</p>
              <ul className="plan-features">
                <li>One AI signature generation this session</li>
                <li>Sign unlimited PDFs with that signature</li>
                <li>No signup required</li>
              </ul>
              <button
                type="button"
                className="btn primary"
                disabled={checkoutLoading}
                onClick={handleCheckout}
              >
                {checkoutLoading ? 'Redirecting to checkout…' : 'Pay $1 to unlock AI'}
              </button>
            </div>
          ) : generationUsed && savedSignature && aiVariations.length === 0 ? (
            <>
              <p className="ai-intro">
                Your AI signature is ready. Place it on as many documents as you want this session.
              </p>
              <div className="preview-box">
                <span className="preview-caption">Saved AI signature</span>
                <img src={savedSignature} alt="Saved AI signature" />
              </div>
            </>
          ) : generationUsed && aiVariations.length === 0 ? (
            <p className="ai-intro">AI generation was used this session. Pick a saved signature if available.</p>
          ) : (
            <>
              <p className="ai-intro">
                Paid — you can generate AI signatures once this session, then sign unlimited PDFs.
              </p>
              <button
                type="button"
                className="btn secondary generate-btn"
                disabled={!text.trim() || aiLoading}
                onClick={handleGenerateAi}
              >
                {aiLoading ? 'Generating 3 options…' : 'Generate signatures (once)'}
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
