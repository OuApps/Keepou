import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// API back FastAPI servie sur :8000 — proxy /api en dev.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL ?? 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
