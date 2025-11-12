// Spaced Repetition IPC Handlers
import path from 'node:path'
import fs from 'node:fs/promises'
import Database from 'better-sqlite3'

export function registerSpacedIpc(ipcMain, findIncreviseDatabase, getCentralDbPath) {
  ipcMain.handle('create-database', async (event, dbPath) => {
    try {
      const oldDbPath = path.join(dbPath, 'db.sqlite')
      const increviseFolder = path.join(dbPath, '.increvise')
      const dbFilePath = path.join(increviseFolder, 'db.sqlite')
      await fs.mkdir(increviseFolder, { recursive: true })
      try {
        await fs.access(oldDbPath)
        await fs.rename(oldDbPath, dbFilePath)
        return { success: true, path: dbFilePath }
      } catch {}
      try {
        await fs.access(dbFilePath)
        return { success: true, path: dbFilePath }
      } catch {}
      try {
        const db = new Database(dbFilePath)
        db.exec(`
          CREATE TABLE IF NOT EXISTS note_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            array_name TEXT NOT NULL,
            array_of_notes TEXT,
            sr_setting TEXT,
            created_time DATETIME DEFAULT CURRENT_TIMESTAMP
          );
          CREATE TABLE IF NOT EXISTS file (
            note_id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_path TEXT NOT NULL UNIQUE,
            creation_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_revised_time DATETIME,
            review_count INTEGER DEFAULT 0,
            difficulty REAL DEFAULT 0.0,
            due_time DATETIME
          );
          CREATE TABLE IF NOT EXISTS folder_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            folder_path TEXT NOT NULL UNIQUE,
            overall_priority INTEGER DEFAULT 0,
            created_time DATETIME DEFAULT CURRENT_TIMESTAMP
          );
        `)
        db.close()
        return { success: true, path: dbFilePath }
      } catch (err) {
        return { success: false, error: err.message }
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('check-file-in-queue', async (event, filePath) => {
    try {
      const result = await findIncreviseDatabase(filePath)
      if (!result.found) return { inQueue: false }
      try {
        const db = new Database(result.dbPath)
        const row = db.prepare('SELECT note_id FROM file WHERE file_path = ?').get(filePath)
        db.close()
        return { inQueue: !!row }
      } catch (err) {
        return { inQueue: false }
      }
    } catch (error) {
      return { inQueue: false }
    }
  })

  ipcMain.handle('add-file-to-queue', async (event, filePath) => {
    try {
      const result = await findIncreviseDatabase(filePath)
      if (!result.found) {
        return { success: false, error: 'Database not found. Please create a database first.' }
      }
      try {
        const db = new Database(result.dbPath)
        const row = db.prepare('SELECT note_id FROM file WHERE file_path = ?').get(filePath)
        if (row) {
          db.close()
          return { success: false, error: 'File already in queue', alreadyExists: true }
        }
        const insertStmt = db.prepare('INSERT INTO file (file_path, creation_time, review_count, difficulty, due_time) VALUES (?, datetime(\'now\'), 0, 0.0, datetime(\'now\'))')
        const info = insertStmt.run(filePath)
        const noteId = info.lastInsertRowid
        db.prepare('INSERT OR IGNORE INTO folder_data (folder_path, overall_priority) VALUES (?, 0)').run(result.rootPath)
        db.close()
        return { success: true, noteId, message: 'File added to revision queue' }
      } catch (err) {
        return { success: false, error: err.message }
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('get-files-for-revision', async (event, rootPath) => {
    try {
      const findDatabases = async (dir) => {
        const databases = []
        const items = await fs.readdir(dir, { withFileTypes: true })
        for (const item of items) {
          const fullPath = path.join(dir, item.name)
          if (item.isDirectory()) {
            if (item.name === '.increvise') {
              const dbFile = path.join(fullPath, 'db.sqlite')
              try {
                await fs.access(dbFile)
                databases.push(dbFile)
              } catch {}
            } else {
              databases.push(...await findDatabases(fullPath))
            }
          }
        }
        return databases
      }
      const dbPaths = await findDatabases(rootPath)
      const allFiles = []
      for (const dbPath of dbPaths) {
        try {
          const db = new Database(dbPath, { readonly: true })
          const rows = db.prepare(`
            SELECT note_id, file_path, creation_time, last_revised_time, 
                   review_count, difficulty, due_time
            FROM file
            WHERE date(due_time) <= date('now')
            ORDER BY due_time ASC
          `).all()
          allFiles.push(...rows.map(row => ({ ...row, dbPath })))
          db.close()
        } catch (err) {}
      }
      return { success: true, files: allFiles }
    } catch (error) {
      return { success: false, error: error.message, files: [] }
    }
  })

  ipcMain.handle('get-all-files-for-revision', async (event) => {
    try {
      const centralDbPath = getCentralDbPath()
      let workspaces = []
      try {
        const db = new Database(centralDbPath, { readonly: true })
        workspaces = db.prepare('SELECT folder_path, db_path FROM workspace_history ORDER BY last_opened DESC').all()
        db.close()
      } catch (err) {
        return { success: false, error: err.message, files: [] }
      }
      const allFiles = []
      for (const workspace of workspaces) {
        try {
          await fs.access(workspace.db_path)
        } catch {
          continue
        }
        try {
          const db = new Database(workspace.db_path, { readonly: true })
          const rows = db.prepare(`
            SELECT note_id, file_path, creation_time, last_revised_time, 
                   review_count, difficulty, due_time
            FROM file
            WHERE date(due_time) <= date('now')
            ORDER BY due_time ASC
          `).all()
          allFiles.push(...rows.map(row => ({
            ...row,
            dbPath: workspace.db_path,
            workspacePath: workspace.folder_path
          })))
          db.close()
        } catch (err) {}
      }
      allFiles.sort((a, b) => new Date(a.due_time) - new Date(b.due_time))
      return { success: true, files: allFiles }
    } catch (error) {
      return { success: false, error: error.message, files: [] }
    }
  })

  ipcMain.handle('update-revision-feedback', async (event, dbPath, noteId, feedback) => {
    try {
      const intervals = { 'again': 0, 'hard': 1, 'medium': 3, 'easy': 7 }
      const daysToAdd = intervals[feedback] || 1
      const difficultyChanges = { 'again': 0.2, 'hard': 0.1, 'medium': 0, 'easy': -0.1 }
      const difficultyChange = difficultyChanges[feedback] || 0
      try {
        const db = new Database(dbPath)
        const stmt = db.prepare(`
          UPDATE file
          SET last_revised_time = datetime('now'),
              review_count = review_count + 1,
              difficulty = MAX(0.0, MIN(1.0, difficulty + ?)),
              due_time = datetime('now', '+' || ? || ' days')
          WHERE note_id = ?
        `)
        const info = stmt.run(difficultyChange, daysToAdd, noteId)
        db.close()
        return {
          success: true,
          message: `File updated. Next review in ${daysToAdd} day(s)`,
          changes: info.changes
        }
      } catch (err) {
        return { success: false, error: err.message }
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
}
