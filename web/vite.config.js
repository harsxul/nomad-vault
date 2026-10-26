import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// API_URL lets you point the dev server at another backend; the default is the local Nomad Vault server.
const target = process.env.API_URL || 'http://localhost:8787';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves the site under /nomad-vault/ (npm run build:pages).
  base: process.env.PAGES ? '/nomad-vault/' : '/',
  // The Stellar SDK (~1 MB) is loaded lazily, only when a contractor creates a vault.
  build: { chunkSizeWarningLimit: 1100 },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target, changeOrigin: true } },
  },
  // `vite preview` behind a Cloudflare quick tunnel serves the full live demo (built app + real API) from this laptop.
  preview: {
    port: 4173,
    proxy: { '/api': { target, changeOrigin: true } },
    allowedHosts: ['.trycloudflare.com'],
  },
});
