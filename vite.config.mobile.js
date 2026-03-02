// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { defineConfig } from 'vite'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist-mobile',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
      },
    },
    // Copy SQL files as assets
    assetsInlineLimit: 0,
  },
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
