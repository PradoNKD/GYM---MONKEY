import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'

// Em dev e nos testes a app roda na raiz ('/'); no GitHub Pages ela fica sob
// o subcaminho do repositorio. O workflow de deploy passa VITE_BASE=/GYM---MONKEY/.
// Sem isso, os caminhos absolutos apontariam pra raiz do dominio e a pagina
// abriria sem assets.
const base = process.env.VITE_BASE ?? '/'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // `npm run dev:mobile` (mode=mobile) sobe o dev server em HTTPS e escutando
  // na rede local, pra abrir no iPhone real e testar a instalacao do PWA. O
  // service worker so registra em HTTPS quando o host nao e localhost, dai o
  // certificado autoassinado do basic-ssl. O `npm run dev` normal segue igual.
  const modoMobile = mode === 'mobile'

  return {
    base,
    plugins: [
      react(),
      ...(modoMobile ? [basicSsl()] : []),
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
    // host: true -> escuta em 0.0.0.0 pra o celular na mesma rede alcancar.
    server: modoMobile ? { host: true } : undefined,
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.ts',
      css: false,
    },
  }
})
