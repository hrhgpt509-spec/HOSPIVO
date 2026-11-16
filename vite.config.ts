import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'node:fs'
import path from 'node:path'

// Ensure temporary files generated during build stay inside workspace
const tmpDir = path.resolve('node_modules/.tmp')
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true })
}
process.env.TEMP = tmpDir
process.env.TMP = tmpDir

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      manifest: {
        name: 'Hospivo',
        short_name: 'Hospivo',
        description: 'Hospivo Pharmacy Management System',
        theme_color: '#1b8f4a',
        background_color: '#f1fcf6',
        display: 'standalone',
        display_override: ['fullscreen', 'standalone'],
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api/sb': {
        target: 'https://njsxgbslglzdprcngzw.supabase.co',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/sb/, ''),
      },
    },
  },
  preview: {
    port: 3000,
    proxy: {
      '/api/sb': {
        target: 'https://njsxgbslglzdprcngzw.supabase.co',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/sb/, ''),
      },
    },
  },
})
