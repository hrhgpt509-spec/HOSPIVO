import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
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
  },
})
