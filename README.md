# Sign PDF

A simple browser app to sign PDF documents. Create a signature by typing your name or uploading an image, place it anywhere on any page, resize it, and download a signed PDF.

Everything runs locally in your browser — files are never uploaded to a server.

## Features

- Open any PDF file
- **Typed signature** — Simple mode with three font styles
- **AI signature (paid)** — Plan 1 “Just Once” ($1): one AI generation per session, unlimited PDF signing with that signature, no signup
- **Image signature** (PNG, JPG, WebP, SVG)
- Drag to position, resize with the corner handle
- Multi-page support
- Download flattened signed PDF

## Quick start

```bash
npm install
cp .env.example .env
# Add your OpenRouter API key to .env (required for AI signatures)
npm run dev
```

Open the URL shown in the terminal (usually http://localhost:5173).

### AI signatures (Stripe + OpenRouter + Gemini)

1. Copy `.env.example` to `.env`
2. Set `OPENROUTER_API_KEY` from [openrouter.ai/keys](https://openrouter.ai/keys)
3. Set `STRIPE_SECRET_KEY` from [Stripe Dashboard](https://dashboard.stripe.com/apikeys) (test mode is fine)
4. Set `ENTITLEMENT_SECRET` to a long random string
5. Set `VITE_APP_URL` to your app URL (e.g. `http://localhost:5173`)
6. Optional: set `OPENROUTER_IMAGE_MODEL` (default: `google/gemini-2.5-flash-image`)

Under **Type → AI signature**, pay **$1 (Just Once)** to unlock one AI generation this browser session. Pick one of three variations, then place that signature on unlimited PDFs until you close the tab.

API calls run through a local Vite proxy so secrets never ship to the browser.

## Build

```bash
npm run build
npm run preview
```

## How to use

1. Click **Open PDF** and choose your document.
2. Create a signature under **Your signature** (Type → Simple, Type → AI, or Image).
3. For AI: generate, pick one of the three options, then **Place on page**.
4. Drag and resize on the document.
4. Use page arrows to sign other pages if needed.
5. Click **Download signed PDF**.
