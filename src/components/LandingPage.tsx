import { useState } from 'react'
import '../LandingPage.css'

type Props = {
  onStart: () => void
}

const FAQ = [
  {
    q: 'Do I need to create an account?',
    a: 'No. Open a PDF, add your signature, and download — no signup, no password, no waiting.',
  },
  {
    q: 'Is my document uploaded to a server?',
    a: 'Your PDF stays in your browser. Signing happens locally on your device for maximum privacy.',
  },
  {
    q: 'What does the $1 AI signature include?',
    a: 'One AI generation per session gives you three handwritten-style options. Pick one, then sign unlimited PDFs with it until you close the tab.',
  },
  {
    q: 'Can I use a photo of my signature instead?',
    a: 'Yes. Upload a PNG, JPG, WebP, or SVG image — free, anytime.',
  },
]

export function LandingPage({ onStart }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  const scrollTo = (id: string) => {
    setMenuOpen(false)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="landing">
      <header className="landing-nav">
        <a className="landing-logo" href="#" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
          <span className="landing-logo-mark" aria-hidden />
          SignThisPDF
        </a>

        <button
          type="button"
          className="landing-menu-btn"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <span />
          <span />
          <span />
        </button>

        <nav className={`landing-links${menuOpen ? ' open' : ''}`}>
          <button type="button" onClick={() => scrollTo('features')}>Features</button>
          <button type="button" onClick={() => scrollTo('how')}>How it works</button>
          <button type="button" onClick={() => scrollTo('pricing')}>Pricing</button>
          <button type="button" className="landing-cta-sm" onClick={onStart}>Sign free</button>
        </nav>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <p className="landing-eyebrow">Private · Instant · No account</p>
          <h1>
            Sign any PDF in <em>under a minute</em>
          </h1>
          <p className="landing-lead">
            The fastest way to sign contracts, forms, and agreements — right in your browser.
            Type, upload, or generate a real handwritten signature with AI. Place it anywhere. Download instantly.
          </p>
          <div className="landing-hero-actions">
            <button type="button" className="landing-btn primary" onClick={onStart}>
              Start signing — it&apos;s free
            </button>
            <button type="button" className="landing-btn ghost" onClick={() => scrollTo('how')}>
              See how it works
            </button>
          </div>
          <ul className="landing-trust">
            <li>No signup required</li>
            <li>PDF never leaves your device</li>
            <li>Works on phone &amp; desktop</li>
          </ul>
        </div>

        <div className="landing-hero-visual" aria-hidden>
          <div className="doc-mock">
            <div className="doc-line long" />
            <div className="doc-line" />
            <div className="doc-line medium" />
            <div className="doc-line" />
            <div className="doc-signature-zone">
              <svg viewBox="0 0 200 48" className="sig-stroke">
                <path d="M8,32 C40,8 60,44 88,24 S140,8 192,28" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              <span>Signed</span>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-strip">
        <div><strong>60 sec</strong><span>Average time to first signature</span></div>
        <div><strong>$0</strong><span>To start — type or upload free</span></div>
        <div><strong>100%</strong><span>Browser-local PDF processing</span></div>
      </section>

      <section id="features" className="landing-section">
        <p className="section-label">Why SignThisPDF</p>
        <h2>Everything you need. Nothing you don&apos;t.</h2>
        <div className="feature-grid">
          <article className="feature-card">
            <span className="feature-icon">⚡</span>
            <h3>Instant signing</h3>
            <p>Open a PDF, drop your signature, download. No apps to install, no accounts to create.</p>
          </article>
          <article className="feature-card">
            <span className="feature-icon">🔒</span>
            <h3>Private by design</h3>
            <p>Your documents are processed locally in your browser. We never store your PDFs on our servers.</p>
          </article>
          <article className="feature-card">
            <span className="feature-icon">✍️</span>
            <h3>Three ways to sign</h3>
            <p>Type your name, upload an image, or unlock AI-generated handwritten signatures that look like the real thing.</p>
          </article>
          <article className="feature-card">
            <span className="feature-icon">📐</span>
            <h3>Place &amp; resize freely</h3>
            <p>Drag your signature anywhere on any page. Resize with a corner handle until it looks perfect.</p>
          </article>
          <article className="feature-card">
            <span className="feature-icon">📄</span>
            <h3>Multi-page support</h3>
            <p>Navigate pages and sign each one. Export one clean, flattened signed PDF when you&apos;re done.</p>
          </article>
          <article className="feature-card">
            <span className="feature-icon">📱</span>
            <h3>Mobile-ready</h3>
            <p>Sign on the go from your phone or tablet. Fully optimized for touch screens.</p>
          </article>
        </div>
      </section>

      <section id="how" className="landing-section landing-section-alt">
        <p className="section-label">How it works</p>
        <h2>Three steps. Done.</h2>
        <ol className="steps">
          <li>
            <span className="step-num">1</span>
            <div>
              <h3>Open your PDF</h3>
              <p>Drag and drop or choose a file from your device. It loads instantly in your browser.</p>
            </div>
          </li>
          <li>
            <span className="step-num">2</span>
            <div>
              <h3>Create your signature</h3>
              <p>Type it, upload a photo, or pay $1 once for an AI handwritten signature — then pick your favorite style.</p>
            </div>
          </li>
          <li>
            <span className="step-num">3</span>
            <div>
              <h3>Download signed PDF</h3>
              <p>Place, resize, and download. Use the same signature on as many documents as you need this session.</p>
            </div>
          </li>
        </ol>
      </section>

      <section id="pricing" className="landing-section">
        <p className="section-label">Simple pricing</p>
        <h2>Start free. Upgrade only if you want AI.</h2>
        <div className="pricing-grid">
          <article className="price-card">
            <h3>Free</h3>
            <p className="price-amount">$0</p>
            <p className="price-tag">Forever free</p>
            <ul>
              <li>Type your signature (3 font styles)</li>
              <li>Upload image signature</li>
              <li>Unlimited PDF signing</li>
              <li>Drag, resize &amp; download</li>
            </ul>
            <button type="button" className="landing-btn secondary full" onClick={onStart}>
              Start free
            </button>
          </article>
          <article className="price-card featured">
            <span className="price-badge">Most popular</span>
            <h3>Just Once</h3>
            <p className="price-amount">$1</p>
            <p className="price-tag">Per session · no subscription</p>
            <ul>
              <li>Everything in Free</li>
              <li>One AI signature generation</li>
              <li>3 handwritten-style options</li>
              <li>Sign unlimited PDFs with it</li>
              <li>No signup required</li>
            </ul>
            <button type="button" className="landing-btn primary full" onClick={onStart}>
              Sign now — add AI for $1
            </button>
          </article>
        </div>
      </section>

      <section className="landing-section landing-section-alt">
        <p className="section-label">Built for</p>
        <h2>Who uses SignThisPDF?</h2>
        <div className="audience-grid">
          <div className="audience-pill">Freelancers &amp; contractors</div>
          <div className="audience-pill">Small business owners</div>
          <div className="audience-pill">Landlords &amp; tenants</div>
          <div className="audience-pill">Students &amp; educators</div>
          <div className="audience-pill">HR &amp; onboarding forms</div>
          <div className="audience-pill">Anyone who hates DocuSign fees</div>
        </div>
      </section>

      <section className="landing-section">
        <p className="section-label">FAQ</p>
        <h2>Questions? Answered.</h2>
        <div className="faq-list">
          {FAQ.map((item, i) => (
            <div key={item.q} className={`faq-item${openFaq === i ? ' open' : ''}`}>
              <button
                type="button"
                className="faq-q"
                aria-expanded={openFaq === i}
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
              >
                {item.q}
                <span aria-hidden>+</span>
              </button>
              <div className="faq-a">{item.a}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-cta-band">
        <h2>Your PDF is waiting.</h2>
        <p>Stop printing, scanning, and emailing. Sign it now — free, private, and done in seconds.</p>
        <button type="button" className="landing-btn primary large" onClick={onStart}>
          Sign my PDF now
        </button>
      </section>

      <footer className="landing-footer">
        <p>© {new Date().getFullYear()} SignThisPDF · Private browser-based PDF signing</p>
      </footer>

      <div className="landing-mobile-bar">
        <button type="button" className="landing-btn primary full" onClick={onStart}>
          Sign free — no account
        </button>
      </div>
    </div>
  )
}
