import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineConfig(({ command, mode }) => {
  const isDev = command === 'serve' || process.env.VITE_DEV_MODE === 'true'

  return {
    main: {
      plugins: [externalizeDepsPlugin()],
      build: {
        minify: !isDev,
        sourcemap: isDev ? 'inline' : false,
        rollupOptions: {
          input: {
            index: resolve(__dirname, 'src/main/index.js'),
          },
          output: isDev
            ? {
                preserveModules: true,
                preserveModulesRoot: 'src',
                entryFileNames: '[name].js',
                chunkFileNames: '[name].js',
              }
            : {},
        },
      },
    },
    preload: {
      plugins: [externalizeDepsPlugin()],
      build: {
        minify: !isDev,
        sourcemap: isDev ? 'inline' : false,
        rollupOptions: {
          input: {
            index: resolve(__dirname, 'src/preload/index.js'),
          },
          output: {
            format: 'cjs',
            entryFileNames: '[name].js',
            ...(isDev
              ? {
                  preserveModules: true,
                  preserveModulesRoot: 'src',
                }
              : {}),
          },
        },
      },
    },
    renderer: {
      root: '.',
      build: {
        minify: !isDev,
        sourcemap: isDev ? 'inline' : false,
        rollupOptions: {
          input: {
            index: resolve(__dirname, 'index.html'),
          },
          preserveEntrySignatures: isDev ? 'exports-only' : 'strict',
          output: isDev
            ? {
                preserveModules: true,
                preserveModulesRoot: 'src',
                entryFileNames: '[name].js',
                chunkFileNames: '[name].js',
                assetFileNames: '[name].[ext]',
              }
            : {},
        },
      },
    },
  }
})
