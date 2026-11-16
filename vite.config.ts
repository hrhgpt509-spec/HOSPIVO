import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import dns from 'node:dns'

// Resolver configured with public DNS (Google 8.8.8.8 and Cloudflare 1.1.1.1) to bypass local ISP DNS blocking
const dnsResolver = new dns.Resolver()
dnsResolver.setServers(['8.8.8.8', '1.1.1.1'])

const supabaseAgent = new https.Agent({
  keepAlive: true,
  lookup: (hostname: string, options: any, callback: any) => {
    const cb = typeof options === 'function' ? options : callback
    dnsResolver.resolve4(hostname, (err, addresses) => {
      if (!err && addresses && addresses.length > 0) {
        if (typeof options === 'object' && options?.all) {
          cb(null, addresses.map((address) => ({ address, family: 4 })))
        } else {
          cb(null, addresses[0], 4)
        }
      } else {
        dns.lookup(hostname, options, cb)
      }
    })
  },
})

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
        agent: supabaseAgent,
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
        agent: supabaseAgent,
      },
    },
  },
})
