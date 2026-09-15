import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// API base URL. In dev mode we proxy /api and /uploads to the local backend.
// In production the same paths are served by nginx, but if you build for a
// remote backend set VITE_API_BASE (e.g. https://api.example.com).
const API_BASE: string = (import.meta as any).env?.VITE_API_BASE ?? 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': API_BASE,
      '/uploads': API_BASE,
    },
  },
  build: {
    outDir: 'dist',
  },
})
