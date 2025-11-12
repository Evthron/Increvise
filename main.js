// SPDX-FileCopyrightText: 2025 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { app, BrowserWindow, ipcMain } from 'electron/main'
import path from 'node:path'
import fs from 'node:fs/promises'
import Database from 'better-sqlite3'
import os from 'os'
import { registerFileIpc } from './ipc/file.js'
import { registerSpacedIpc } from './ipc/spaced.js'
import { registerIncrementalIpc } from './ipc/incremental.js'
import { registerWorkspaceIpc } from './ipc/workspace.js'

function getXdgDataHome() {
  return process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')
}

function getCentralDbPath() {
  const dataHome = getXdgDataHome()
  return path.join(dataHome, 'increvise', 'central.sqlite')
}

function getIncreviseDataDir() {
  const dataHome = getXdgDataHome()
  return path.join(dataHome, 'increvise')
}

async function findIncreviseDatabase(filePath) {
  let currentDir = path.dirname(filePath)
  const rootDir = path.parse(currentDir).root
  
  while (currentDir !== rootDir) {
    const increviseDir = path.join(currentDir, '.increvise')
    const dbPath = path.join(increviseDir, 'db.sqlite')
    
    try {
      await fs.access(dbPath)
      return {
        found: true,
        dbPath: dbPath,
        rootPath: currentDir
      }
    } catch {
    }
    
    currentDir = path.dirname(currentDir)
  }
  
  return { found: false, dbPath: null, rootPath: null }
}

async function initializeCentralDatabase() {
  const increviseDataDir = getIncreviseDataDir()
  const centralDbPath = getCentralDbPath()
  
  await fs.mkdir(increviseDataDir, { recursive: true })
  
  console.log('Central database path:', centralDbPath)
  try {
    const db = new Database(centralDbPath)
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS workspace_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        folder_path TEXT NOT NULL UNIQUE,
        folder_name TEXT NOT NULL,
        db_path TEXT NOT NULL,
        first_opened DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_opened DATETIME DEFAULT CURRENT_TIMESTAMP,
        open_count INTEGER DEFAULT 1,
        total_files INTEGER DEFAULT 0,
        files_due_today INTEGER DEFAULT 0
      );
      
      CREATE INDEX IF NOT EXISTS idx_last_opened 
      ON workspace_history(last_opened DESC);
      
      CREATE INDEX IF NOT EXISTS idx_folder_path 
      ON workspace_history(folder_path);
    `)
    
    db.close()
    console.log('Central database initialized successfully')
    return true
    
  } catch (err) {
    console.error('Error creating central database:', err)
    throw err
  }
}

const createWindow = () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(path.dirname(new URL(import.meta.url).pathname), 'preload.js')
    }
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