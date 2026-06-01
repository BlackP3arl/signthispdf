import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { signatureApiPlugin } from './vite-plugin-signature-api'

import { cloudflare } from "@cloudflare/vite-plugin";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), signatureApiPlugin(), cloudflare()],
})