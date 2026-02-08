import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
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

      const destBase = resolve(__dirname, 'out/main/main/db')

      sourceDirs.forEach((sourceDir) => {
        const dirName = sourceDir.split('/').pop()
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
