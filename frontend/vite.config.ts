import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replaceAll('\\', '/')

          if (!normalizedId.includes('/node_modules/')) {
            return undefined
          }

          if (normalizedId.includes('/react-markdown/') || normalizedId.includes('/remark-gfm/') || normalizedId.includes('/micromark/') || normalizedId.includes('/mdast-') || normalizedId.includes('/hast-') || normalizedId.includes('/unist-')) {
            return 'markdown-vendor'
          }

          if (normalizedId.includes('/lucide-react/')) {
            return 'icon-vendor'
          }

          if (normalizedId.includes('/react-router/') || normalizedId.includes('/react-router-dom/')) {
            return 'router-vendor'
          }

          if (normalizedId.includes('/react/') || normalizedId.includes('/react-dom/')) {
            return 'react-vendor'
          }

          if (normalizedId.includes('/zod/')) {
            return 'schema-vendor'
          }

          return 'vendor'
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
})
