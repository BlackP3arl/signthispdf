import { useEffect, useState } from 'react'
import type { SignatureSource } from '../types'
import { getSavedAiSignature, hasPaidAccess, saveAiSignature } from '../lib/aiEntitlement'
import { previewAiSignature } from '../lib/generateAiSignatures'
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

  // AI preview-before-pay state
  const [paid, setPaid] = useState(hasPaidAccess)
  const [savedSignature, setSavedSignature] = useState<string | null>(getSavedAiSignature)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)

  const font = FONTS.find((f) => f.id === fontId) ?? FONTS[0]

  useEffect(() => {
    if (paymentNotice?.includes('successful')) {
      setPaid(hasPaidAccess())
      setSavedSignature(getSavedAiSignature())
    }
  }, [paymentNotice])

  useEffect(() => {
    if (mode !== 'text' || textMode !== 'simple' || !text.trim()) {
      setTextPreview(null)
      return
    }
    setTextPreview(textToDataUrl(text.trim(), font.family, '#1a2744'))
  }, [mode, textMode, text, font.family])

  const resetPreview = () => {
    setPreviewId(null)
    setPreviewUrl(null)
    setPreviewError(null)
  }

  const handleImage = (file: File | null) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setImagePreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  const handlePreview = async () => {
    if (!text.trim()) return
    setPreviewLoading(true)
    setPreviewError(null)
    resetPreview()
    try {
      const { previewId: id, dataUrl } = await previewAiSignature(text)
      setPreviewId(id)
      setPreviewUrl(dataUrl)
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Preview failed')
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleCheckout = async () => {
    if (!previewId) return
    setCheckoutLoading(true)
    setPreviewError(null)
    try {
      await startJustOnceCheckout(previewId)
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Checkout failed')
      setCheckoutLoading(false)
    }
  }

  const placeSaved = async () => {
    if (!savedSignature) return
    try {
      const processed = await processSignatureImage(savedSignature)
      saveAiSignature(processed)
      setSavedSignature(processed)
      onCreate({ type: 'image', dataUrl: processed })
    } catch {
      onCreate({ type: 'image', dataUrl: savedSignature })
    }
  }

  const handleAdd = () => {
    if (mode === 'image' && imagePreview) {
      onCreate({ type: 'image', dataUrl: imagePreview })
      setImagePreview(null)
      return
    }
    if (mode === 'text' && textMode === 'simple' && text.trim()) {
      onCreate({ type: 'text', text: text.trim(), fontFamily: font.family, color: '#1a2744' })
      return
    }
    if (mode === 'text' && textMode === 'ai' && savedSignature) {
      void placeSaved()
    }
  }

  const canAdd =
    (mode === 'image' && !!imagePreview) ||
    (mode === 'text' && textMode === 'simple' && text.trim().length > 0) ||
    (mode === 'text' && textMode === 'ai' && !!savedSignature)

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
              onClick={() => setTextMode('simple')}
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
                if (textMode === 'ai') resetPreview()
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
          ) : savedSignature ? (
            <>
              <p className="ai-intro">
                Your AI signature is ready. Place it on as many documents as you want this session.
              </p>
              <div className="preview-box">
                <span className="preview-caption">Your AI signature</span>
                <img src={savedSignature} alt="Saved AI signature" />
              </div>
            </>
          ) : (
            <>
              <p className="ai-intro">
                Premium handwritten calligraphy signature. Preview it free — pay <strong>$1</strong> only when you
                love it.
              </p>
              <button
                type="button"
                className="btn secondary generate-btn"
                disabled={!text.trim() || previewLoading || paid}
                onClick={handlePreview}
              >
                {previewLoading ? 'Creating preview…' : previewUrl ? 'Regenerate preview' : 'Preview signature (free)'}
              </button>

              {previewError && <p className="error-text">{previewError}</p>}

              {previewLoading && (
                <div className="preview-box">
                  <div className="variation-card skeleton" aria-hidden />
                </div>
              )}

              {!previewLoading && previewUrl && (
                <>
                  <div className="preview-box ai-watermark-wrap">
                    <span className="preview-caption">Preview</span>
                    <div className="ai-watermark" aria-label="Watermarked preview">
                      <img
                        src={previewUrl}
                        alt="Watermarked signature preview"
                        draggable={false}
                        onContextMenu={(e) => e.preventDefault()}
                      />
                    </div>
                    <small className="hint">Watermark is removed after payment.</small>
                  </div>

                  <div className="paywall">
                    <p className="plan-name">Plan 1: Just Once</p>
                    <p className="plan-price">$1</p>
                    <ul className="plan-features">
                      <li>Unlock this exact signature</li>
                      <li>Sign unlimited PDFs with it this session</li>
                      <li>No signup required</li>
                    </ul>
                    <button
                      type="button"
                      className="btn primary"
                      disabled={checkoutLoading}
                      onClick={handleCheckout}
                    >
                      {checkoutLoading ? 'Redirecting to checkout…' : 'Pay $1 to unlock'}
                    </button>
                  </div>
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
