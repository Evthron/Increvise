// SPDX-FileCopyrightText: 2025 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { app, BrowserWindow, ipcMain } from 'electron/main'
import path from 'node:path'
import { getCentralDbPath, findIncreviseDatabase, initializeCentralDatabase } from './db/index.js'
import { registerFileIpc } from './ipc/file.js'
import { registerSpacedIpc } from './ipc/spaced.js'
import { registerIncrementalIpc } from './ipc/incremental.js'
import { registerWorkspaceIpc } from './ipc/workspace.js'

const createWindow = () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(path.dirname(new URL(import.meta.url).pathname), 'preload.js'),
    },
  })

  win.loadFile('index.html')
}

app.whenReady().then(async () => {
  try {
    await initializeCentralDatabase()
    console.log('Central database ready')
  } catch (error) {
    console.error('Failed to initialize central database:', error)
  }

  // Register IPC handlers
  registerFileIpc(ipcMain)
  registerSpacedIpc(ipcMain, findIncreviseDatabase, getCentralDbPath)
  registerIncrementalIpc(ipcMain, findIncreviseDatabase)
  registerWorkspaceIpc(ipcMain, getCentralDbPath)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
