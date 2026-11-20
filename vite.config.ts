import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import dns from 'node:dns'
import type { IncomingMessage, ServerResponse } from 'node:http'

// Ensure temporary files generated during build stay inside workspace
const tmpDir = path.resolve('node_modules/.tmp')
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true })
}
process.env.TEMP = tmpDir
process.env.TMP = tmpDir

const SUPABASE_HOST = 'njsxgbslgzlzdprcngzw.supabase.co'

const resolver = new dns.Resolver()
resolver.setServers(['8.8.8.8', '1.1.1.1'])

const supabaseAgent = new https.Agent({
  keepAlive: true,
  lookup: (hostname, options, callback) => {
    const cb = typeof options === 'function' ? options : callback
    if (hostname !== SUPABASE_HOST) {
      dns.lookup(hostname, options as dns.LookupOptions, cb as never)
      return
    }
    const all = typeof options === 'object' && options !== null && Boolean(options.all)
    resolver.resolve4(hostname, (err, addresses) => {
      const ips = !err && addresses && addresses.length > 0
        ? addresses
        : ['104.18.38.10', '172.64.149.246']
      if (all) {
        ; (cb as (err: null, addresses: dns.LookupAddress[]) => void)(
          null,
          ips.map((address) => ({ address, family: 4 })),
        )
      } else {
        ; (cb as (err: null, address: string, family: number) => void)(null, ips[0], 4)
      }
    })
  },
})

function supabaseProxyMiddleware(req: IncomingMessage, res: ServerResponse) {
  const targetPath = req.url && req.url.startsWith('/') ? req.url : `/${req.url || ''}`
  const headers: Record<string, string | string[] | undefined> = { ...req.headers }
  headers.host = SUPABASE_HOST
  delete headers.origin
  delete headers.referer
  delete headers.connection

  const proxyReq = https.request(
    {
      hostname: SUPABASE_HOST,
      servername: SUPABASE_HOST,
      port: 443,
      path: targetPath,
      method: req.method,
      headers,
      agent: supabaseAgent,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers)
      proxyRes.pipe(res)
    },
  )

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' })
    }
    res.end(JSON.stringify({ message: `Local Supabase proxy error: ${err.message}` }))
  })

  req.pipe(proxyReq)
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'favicon.ico',
        'favicon-16x16.png',
        'favicon-32x32.png',
        'apple-touch-icon.png',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'pwa-maskable-512x512.png',
      ],
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
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
    {
      name: 'supabase-local-proxy',
      configureServer(server) {
        server.middlewares.use('/api/sb', supabaseProxyMiddleware)
      },
      configurePreviewServer(server) {
        server.middlewares.use('/api/sb', supabaseProxyMiddleware)
      },
    },
  ],
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  preview: {
    port: 3000,
  },
})
