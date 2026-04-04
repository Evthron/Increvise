// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { defineConfig } from 'vite'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { rename } from 'fs/promises'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Plugin to rename index.mobile.html to index.html after build
function renameIndexPlugin() {
  return {
    name: 'rename-index',
    async closeBundle() {
      const oldPath = resolve(__dirname, 'dist-mobile/index.mobile.html')
      const newPath = resolve(__dirname, 'dist-mobile/index.html')
      try {
        await rename(oldPath, newPath)
        console.log('✓ Renamed index.mobile.html to index.html')
      } catch (err) {
        console.error('Failed to rename HTML file:', err)
      }
    },
  }
}

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist-mobile',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.mobile.html'),
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
    // Copy SQL files as assets
    assetsInlineLimit: 0,
  },
  plugins: [renameIndexPlugin()],
  define: {
    // Inject environment variable to indicate mobile platform
    'import.meta.env.VITE_PLATFORM': JSON.stringify('mobile'),
  },
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer'),
      '@services': resolve(__dirname, 'src/services'),
      '@adapters': resolve(__dirname, 'src/adapters'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  // Load SQL files as raw strings
  assetsInclude: ['**/*.sql'],
})
