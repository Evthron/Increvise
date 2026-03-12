// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// File Watcher IPC Handlers
// Watches workspace directories for file system changes
import fs from 'node:fs'
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

    // Create watcher with recursive option
    const watcher = fs.watch(
      workspacePath,
      { recursive: true, persistent: false },
      (eventType, filename) => {
        // Ignore .increvise directory changes and hidden files
        if (!filename || filename.includes('.increvise') || filename.startsWith('.')) {
          return
        }

        console.log('[FileWatcher]', eventType, filename)

        // Debounce: clear previous timer
        if (debounceTimer) {
          clearTimeout(debounceTimer)
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
    )

    // Handle watcher errors
    watcher.on('error', (error) => {
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
function stopWatching(workspacePath) {
  const watcher = activeWatchers.get(workspacePath)
  if (watcher) {
    console.log('[FileWatcher] Stopping watch on:', workspacePath)
    watcher.close()
    activeWatchers.delete(workspacePath)
  }
}

/**
 * Stop all active watchers
 */
function stopAllWatchers() {
  console.log('[FileWatcher] Stopping all watchers')
  for (const [path, watcher] of activeWatchers.entries()) {
    watcher.close()
  }
  activeWatchers.clear()
}

export function registerFileWatcherIpc(ipcMain, getMainWindow) {
  ipcMain.handle('start-watching-workspace', async (event, workspacePath) => {
    const mainWindow = getMainWindow()
    return startWatching(workspacePath, mainWindow)
  })

  ipcMain.handle('stop-watching-workspace', async (event, workspacePath) => {
    stopWatching(workspacePath)
    return { success: true }
  })

  ipcMain.handle('stop-all-watchers', async () => {
    stopAllWatchers()
    return { success: true }
  })
}
