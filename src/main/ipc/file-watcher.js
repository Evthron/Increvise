// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// File Watcher IPC Handlers
// Watches workspace directories for file system changes using chokidar
// (fs.watch recursive option doesn't work on Linux)
import chokidar from 'chokidar'
import path from 'node:path'

// Store active watchers by workspace path
const activeWatchers = new Map()

// Debounce timer to avoid excessive events
let debounceTimer = null
const DEBOUNCE_DELAY = 500 // ms

/**
 * Start watching a workspace directory for file changes
 * @param {string} workspacePath - Absolute path to workspace
 * @param {BrowserWindow} mainWindow - Main window to send events to
 * @returns {{success: boolean, error?: string}}
 */
function startWatching(workspacePath, mainWindow) {
  try {
    // Stop existing watcher for this path if any
    stopWatching(workspacePath)

    console.log('[FileWatcher] Starting watch on:', workspacePath)

    // Create chokidar watcher with recursive watching
    const watcher = chokidar.watch(workspacePath, {
      ignored: [
        /(^|[\\/])\.increvise/, // ignore .increvise directory
        /(^|[\\/])\..+/, // ignore hidden files/directories
      ],
      persistent: true,
      ignoreInitial: true, // don't emit 'add' events for existing files
      depth: undefined, // watch all subdirectory levels
    })

    // Handle all file events
    const handleEvent = (eventType, filePath) => {
      const filename = path.relative(workspacePath, filePath)

      console.log('[FileWatcher]', eventType, filename)

      // Debounce: clear previous timer
      if (debounceTimer) {
        globalThis.clearTimeout(debounceTimer)
      }

      // Set new timer to send event after delay
      debounceTimer = setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('workspace-files-changed', {
            eventType,
            filename,
            workspacePath,
          })
        }
      }, DEBOUNCE_DELAY)
    }

    watcher
      .on('add', (filePath) => handleEvent('rename', filePath))
      .on('change', (filePath) => handleEvent('change', filePath))
      .on('unlink', (filePath) => handleEvent('rename', filePath))
      .on('addDir', (filePath) => handleEvent('rename', filePath))
      .on('unlinkDir', (filePath) => handleEvent('rename', filePath))
      .on('error', (error) => {
        console.error('[FileWatcher] Error:', error)
        stopWatching(workspacePath)
      })

    // Store watcher
    activeWatchers.set(workspacePath, watcher)

    return { success: true }
  } catch (error) {
    console.error('[FileWatcher] Failed to start watching:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Stop watching a workspace directory
 * @param {string} workspacePath - Absolute path to workspace
 */
async function stopWatching(workspacePath) {
  const watcher = activeWatchers.get(workspacePath)
  if (watcher) {
    console.log('[FileWatcher] Stopping watch on:', workspacePath)
    await watcher.close()
    activeWatchers.delete(workspacePath)
  }
}

/**
 * Stop all active watchers
 */
async function stopAllWatchers() {
  console.log('[FileWatcher] Stopping all watchers')
  const promises = []
  for (const watcher of activeWatchers.values()) {
    promises.push(watcher.close())
  }
  await Promise.all(promises)
  activeWatchers.clear()
}

export function registerFileWatcherIpc(ipcMain, getMainWindow) {
  ipcMain.handle('start-watching-workspace', async (event, workspacePath) => {
    const mainWindow = getMainWindow()
    return startWatching(workspacePath, mainWindow)
  })

  ipcMain.handle('stop-watching-workspace', async (event, workspacePath) => {
    await stopWatching(workspacePath)
    return { success: true }
  })

  ipcMain.handle('stop-all-watchers', async () => {
    await stopAllWatchers()
    return { success: true }
  })
}
