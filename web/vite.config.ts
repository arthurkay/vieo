import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        configure: (proxy) => {
          // Prevent an ECONNRESET (or any backend socket error) from crashing
          // the dev server. Log it and return a clean 502 to the client.
          proxy.on('error', (err, _req, res) => {
            console.error('[vite proxy] backend error:', err.message)
            const response = res as { headersSent?: boolean; writeHead?: (code: number) => void; end?: (body: string) => void } | undefined
            if (response && !response.headersSent && response.writeHead) {
              response.writeHead(502)
              response.end('Backend unavailable')
            }
          })
          // Swallow ECONNRESET on the outgoing socket to the backend so it
          // doesn't bubble up as an unhandled 'error' event.
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.on('error', () => {})
          })
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.socket?.on('error', () => {})
          })
        },
      },
    },
  },
  build: {
    outDir: 'dist',
  },
})
