import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

/**
 * Content-Security-Policy for the packaged renderer. Injected at build time
 * only: the Vite dev server needs inline scripts (React refresh preamble) and
 * a websocket for HMR, which this policy would block.
 *
 * - The renderer talks to the main process over IPC only; it fetches nothing
 *   remote (sentry-ipc: is @sentry/electron's renderer → main transport).
 * - style-src needs 'unsafe-inline' for xterm.js and React style attributes.
 * - Fonts are bundled via @fontsource (url() or inlined data: URIs).
 */
const RENDERER_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' sentry-ipc:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
].join('; ')

function cspPlugin(): Plugin {
  return {
    name: 'netcopilot-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${RENDERER_CSP}" />`
      )
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@': resolve('src/renderer/src')
      }
    },
    plugins: [react(), cspPlugin()],
    css: {
      postcss: './postcss.config.js'
    }
  }
})
