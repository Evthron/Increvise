import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { resolve, dirname, basename } from 'path'
import { fileURLToPath } from 'url'
import { copyFileSync, mkdirSync, readdirSync, statSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Plugin to copy SQL migration files
function copySqlFiles() {
  return {
    name: 'copy-sql-files',
    closeBundle() {
      const sourceDirs = [
        resolve(__dirname, 'src/main/db/migration-central'),
        resolve(__dirname, 'src/main/db/migration-workspace'),
      ]

      const destBase = resolve(__dirname, 'out/main/db')

      sourceDirs.forEach((sourceDir) => {
        const dirName = basename(sourceDir)
        const destDir = resolve(destBase, dirName)

        try {
          mkdirSync(destDir, { recursive: true })

          const files = readdirSync(sourceDir)
          files.forEach((file) => {
            if (file.endsWith('.sql')) {
              const sourcePath = resolve(sourceDir, file)
              const destPath = resolve(destDir, file)
              copyFileSync(sourcePath, destPath)
              console.log(`Copied ${file} to ${destDir}`)
            }
          })
        } catch (err) {
          console.error(`Failed to copy SQL files from ${sourceDir}:`, err)
        }
      })
    },
  }
}

// Plugin to copy Shoelace assets
function copyShoelaceAssets() {
  return {
    name: 'copy-shoelace-assets',
    closeBundle() {
      const sourceDir = resolve(__dirname, 'node_modules/@shoelace-style/shoelace/dist/assets')
      const destDir = resolve(
        __dirname,
        'out/renderer/node_modules/@shoelace-style/shoelace/dist/assets'
      )

      try {
        mkdirSync(destDir, { recursive: true })
        copyDirectoryRecursive(sourceDir, destDir)
        console.log(`Copied Shoelace assets to ${destDir}`)
      } catch (err) {
        console.error(`Failed to copy Shoelace assets:`, err)
      }
    },
  }
}

// Helper function to recursively copy directories
function copyDirectoryRecursive(source, dest) {
  const entries = readdirSync(source, { withFileTypes: true })

  entries.forEach((entry) => {
    const sourcePath = resolve(source, entry.name)
    const destPath = resolve(dest, entry.name)

    if (entry.isDirectory()) {
      mkdirSync(destPath, { recursive: true })
      copyDirectoryRecursive(sourcePath, destPath)
    } else {
      copyFileSync(sourcePath, destPath)
    }
  })
}

export default defineConfig(({ command, mode }) => {
  const isDev = command === 'serve' || process.env.VITE_DEV_MODE === 'true'

  return {
    main: {
      plugins: [externalizeDepsPlugin(), copySqlFiles()],
      build: {
        minify: !isDev,
        sourcemap: isDev ? true : false,
        rollupOptions: {
          input: {
            index: resolve(__dirname, 'src/main/index.js'),
          },
          output: isDev
            ? {
                preserveModules: true,
                preserveModulesRoot: 'src/main',
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
                  preserveModulesRoot: 'src/preload',
                }
              : {}),
          },
        },
      },
    },
    renderer: {
      root: '.',
      plugins: [copyShoelaceAssets()],
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
                manualChunks: undefined,
              }
            : {},
        },
      },
      ...(isDev
        ? {
            optimizeDeps: {
              noDiscovery: true,
              include: undefined,
            },
          }
        : {}),
    },
  }
})
