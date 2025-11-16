// SPDX-FileCopyrightText: 2025 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Incremental Reading IPC Handlers
import path from 'node:path'
import fs from 'node:fs/promises'
import Database from 'better-sqlite3'

export function registerIncrementalIpc(ipcMain, findIncreviseDatabase) {
  ipcMain.handle('read-file', async (event, filePath) => {
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      return { success: true, content }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('write-file', async (event, filePath, content) => {
    try {
      await fs.writeFile(filePath, content, 'utf-8')
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('extract-note', async (event, parentFilePath, selectedText) => {
    try {
      const parentDir = path.dirname(parentFilePath)
      const parentFileName = path.basename(parentFilePath, path.extname(parentFilePath))
      const matchNumber = (filename) => {
        const match = filename.match(/^(\d+(?:\.\d+)*)$/)
        if (!match) return null
        return match[1].split('.').map(Number)
      }
      const currentNumber = matchNumber(parentFileName)
      const isAlreadyInNoteFolder = currentNumber !== null
      let noteFolder, currentPrefix
      if (isAlreadyInNoteFolder) {
        noteFolder = parentDir
        currentPrefix = currentNumber
      } else {
        noteFolder = path.join(parentDir, parentFileName)
        await fs.mkdir(noteFolder, { recursive: true })
        const increviseDir = path.join(noteFolder, '.increvise')
        const noteFolderDbPath = path.join(increviseDir, 'data.sqlite')
        await fs.mkdir(increviseDir, { recursive: true })
        try {
          await fs.access(noteFolderDbPath)
        } catch {
          const noteDb = new Database(noteFolderDbPath)
          await new Promise((resolve, reject) => {
            noteDb.exec(`
              CREATE TABLE IF NOT EXISTS file (
                note_id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_path TEXT NOT NULL UNIQUE,
                creation_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_revised_time DATETIME,
                review_count INTEGER DEFAULT 0,
                difficulty REAL DEFAULT 0.0,
                due_time DATETIME
              );
            `, (err) => {
              noteDb.close()
              if (err) reject(err)
              else resolve()
            })
          })
        }
        currentPrefix = []
      }
      const existingFiles = await fs.readdir(noteFolder)
      const mdFiles = existingFiles.filter(f => f.endsWith('.md'))
      const allNumbers = mdFiles
        .map(f => matchNumber(path.basename(f, '.md')))
        .filter(n => n !== null)
      let nextNumber
      if (currentPrefix.length === 0) {
        if (allNumbers.length === 0) {
          nextNumber = [1]
        } else {
          const maxFirstLevel = Math.max(...allNumbers.map(n => n[0]))
          nextNumber = [maxFirstLevel + 1]
        }
      } else {
        const childNumbers = allNumbers.filter(n => {
          if (n.length !== currentPrefix.length + 1) return false
          for (let i = 0; i < currentPrefix.length; i++) {
            if (n[i] !== currentPrefix[i]) return false
          }
          return true
        })
        if (childNumbers.length === 0) {
          nextNumber = [...currentPrefix, 1]
        } else {
          const maxLastLevel = Math.max(...childNumbers.map(n => n[n.length - 1]))
          nextNumber = [...currentPrefix, maxLastLevel + 1]
        }
      }
      const newFileName = nextNumber.join('.') + '.md'
      const newFilePath = path.join(noteFolder, newFileName)
      await fs.writeFile(newFilePath, selectedText, 'utf-8')
      const result = await findIncreviseDatabase(newFilePath)
      if (result.found) {
        try {
          const db = new Database(result.dbPath)
          db.prepare(`
            INSERT INTO file (file_path, creation_time, review_count, difficulty, due_time)
            VALUES (?, datetime('now'), 0, 0.0, datetime('now'))
          `).run(newFilePath)
          db.close()
        } catch (err) {}
      }
      return {
        success: true,
        fileName: newFileName,
        filePath: newFilePath
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
}
