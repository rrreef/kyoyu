import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // Prevent Rollup from shadowing browser built-ins (Image, Audio, URL…)
      // with mangled local names like Image$1 that crash in WKWebView.
      output: {
        globals: { Image: 'Image', Audio: 'Audio', URL: 'URL' },
      },
    },
  },
})
