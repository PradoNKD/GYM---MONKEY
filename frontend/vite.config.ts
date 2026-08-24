import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Em dev e nos testes a app roda na raiz ('/'); no GitHub Pages ela fica sob
// o subcaminho do repositorio. O workflow de deploy passa VITE_BASE=/GYM---MONKEY/.
// Sem isso, os caminhos absolutos apontariam pra raiz do dominio e a pagina
// abriria sem assets.
const base = process.env.VITE_BASE ?? '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: true },
      includeAssets: ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'GYM MONKEY',
        short_name: 'GYM MONKEY',
        description: 'Registro de check-in e check-out de treino',
        theme_color: '#ff4d3d',
        background_color: '#f4f4f2',
        display: 'standalone',
        scope: base,
        start_url: base,
        icons: [
          {
            src: `${base}icon-192.png`,
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: `${base}icon-512.png`,
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    css: false,
  },
})
