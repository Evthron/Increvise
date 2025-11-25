// SPDX-FileCopyrightText: 2025 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Spaced Repetition IPC Handlers
import path from 'node:path'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import Database from 'better-sqlite3'

// Helper function to create a short hash from a file path
function createLibraryId(folderPath) {
  const hash = crypto.createHash('sha256').update(folderPath).digest('hex')
  return hash.substring(0, 16) // Use first 16 characters for shorter ID
}

export function registerSpacedIpc(ipcMain, findIncreviseDatabase, getCentralDbPath) {
  ipcMain.handle('create-database', async (event, folderPath) => {
    try {
      const increviseFolder = path.join(folderPath, '.increvise')
      const dbFilePath = path.join(increviseFolder, 'db.sqlite')
      await fs.mkdir(increviseFolder, { recursive: true })
      try {
        // Database already exists
        await fs.access(dbFilePath)
        return { success: true, path: dbFilePath }
      } catch {}
      try {
        // Create and initialize the database
        const db = new Database(dbFilePath)
        db.exec(`
          CREATE TABLE library (
              library_id TEXT PRIMARY KEY,
              library_name TEXT NOT NULL,
              created_time DATETIME DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE file (
              library_id TEXT NOT NULL,
              relative_path TEXT NOT NULL,
              added_time DATETIME DEFAULT CURRENT_TIMESTAMP,
              last_revised_time DATETIME,
              review_count INTEGER DEFAULT 0,
              difficulty REAL DEFAULT 0.0,
              importance REAL DEFAULT 70.0,
              due_time DATETIME,

              PRIMARY KEY (library_id, relative_path),
              FOREIGN KEY (library_id) REFERENCES library(library_id)
          );

          CREATE TABLE review_queue (
              library_id TEXT NOT NULL,
              queue_name TEXT NOT NULL,
              description TEXT,
              created_time DATETIME DEFAULT CURRENT_TIMESTAMP,

              PRIMARY KEY (library_id, queue_name),
              FOREIGN KEY (library_id) REFERENCES library(library_id)
          );

          CREATE TABLE queue_membership (
              library_id TEXT NOT NULL,
              queue_name TEXT NOT NULL,
              relative_path TEXT NOT NULL,

              PRIMARY KEY (library_id, relative_path),
              FOREIGN KEY (library_id, relative_path)
                REFERENCES file(library_id, relative_path),
              FOREIGN KEY (library_id, queue_name)
                REFERENCES review_queue(library_id, queue_name)
          );

          CREATE TABLE note_source (
              library_id TEXT NOT NULL,
              relative_path TEXT NOT NULL,
              extract_type TEXT NOT NULL,
              range_start TEXT,
              range_end TEXT,
              source_hash TEXT,

              PRIMARY KEY (library_id, relative_path),
              FOREIGN KEY (library_id, relative_path) 
                  REFERENCES file(library_id, relative_path)
          );
        `)

        // Insert library record with hash-based ID
        const libraryId = createLibraryId(folderPath)
        const libraryName = path.basename(folderPath)
        db.prepare('INSERT INTO library (library_id, library_name) VALUES (?, ?)').run(
          libraryId,
          libraryName
        )

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
      if (!result.found) {
        return { inQueue: false, error: 'Database not found. Please create a database first.' }
      }
      try {
        const db = new Database(result.dbPath)
        const relativePath = path.relative(result.rootPath, filePath)
        const libraryId = db.prepare('SELECT library_id FROM library LIMIT 1').get()?.library_id
        if (!libraryId) {
          db.close()
          return { inQueue: false, error: 'Database library entry not found' }
        }
        const { exists_flag } = db
          .prepare(
            'SELECT EXISTS ( SELECT 1 FROM file WHERE library_id = ? AND relative_path = ? ) AS exists_flag'
          )
          .get(libraryId, relativePath)
        const exists = exists_flag === 1
        db.close()
        return { inQueue: exists }
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
        const relativePath = path.relative(result.rootPath, filePath)
        const libraryId = db.prepare('SELECT library_id FROM library LIMIT 1').get()?.library_id
        if (!libraryId) {
          db.close()
          return { success: false, error: 'Database library entry not found' }
        }

        const { exists_flag } = db
          .prepare(
            'SELECT EXISTS ( SELECT 1 FROM file WHERE library_id = ? AND relative_path = ? ) AS exists_flag'
          )
          .get(libraryId, relativePath)
        const exists = exists_flag === 1
        if (exists) {
          db.close()
          return { success: false, error: 'File already in queue', alreadyExists: true }
        }

        db.prepare(
          `INSERT INTO file (library_id, relative_path, added_time, review_count, difficulty, importance, due_time)
          VALUES (?, ?, datetime('now'), 0, 0.0, 70.0, datetime('now'))`
        ).run(libraryId, relativePath)

        db.close()
        return { success: true, message: 'File added to revision queue' }
      } catch (err) {
        return { success: false, error: err.message }
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('get-files-for-revision', async (event, rootPath) => {
    // Get all the increvise database under the specfied rootPath
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
              databases.push(...(await findDatabases(fullPath)))
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
          const dbRootPath = path.dirname(path.dirname(dbPath)) // Remove .increvise/db.sqlite
          const rows = db
            .prepare(
              `
            SELECT library_id, relative_path, added_time, last_revised_time, 
                   review_count, difficulty, due_time
            FROM file
            WHERE date(due_time) <= date('now')
            ORDER BY due_time ASC
          `
            )
            .all()
          allFiles.push(
            ...rows.map((row) => ({
              ...row,
              file_path: path.join(dbRootPath, row.relative_path),
              dbPath,
            }))
          )
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
        workspaces = db
          .prepare('SELECT folder_path, db_path FROM workspace_history ORDER BY last_opened DESC')
          .all()
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
          const rows = db
            .prepare(
              `
            SELECT library_id, relative_path, added_time, last_revised_time, 
                   review_count, difficulty, due_time
            FROM file
            WHERE date(due_time) <= date('now')
            ORDER BY due_time ASC
          `
            )
            .all()
          allFiles.push(
            ...rows.map((row) => ({
              ...row,
              file_path: path.join(workspace.folder_path, row.relative_path),
              dbPath: workspace.db_path,
              workspacePath: workspace.folder_path,
            }))
          )
          db.close()
        } catch (err) {}
      }
      allFiles.sort((a, b) => new Date(a.due_time) - new Date(b.due_time))
      return { success: true, files: allFiles }
    } catch (error) {
      return { success: false, error: error.message, files: [] }
    }
  })

  ipcMain.handle(
    'update-revision-feedback',
    async (event, dbPath, libraryId, relativePath, feedback) => {
      try {
        const intervals = { again: 0, hard: 1, medium: 3, easy: 7 }
        const daysToAdd = intervals[feedback] || 1
        const difficultyChanges = { again: 0.2, hard: 0.1, medium: 0, easy: -0.1 }
        const difficultyChange = difficultyChanges[feedback] || 0
        try {
          const db = new Database(dbPath)
          const stmt = db.prepare(`
          UPDATE file
          SET last_revised_time = datetime('now'),
              review_count = review_count + 1,
              difficulty = MAX(0.0, MIN(1.0, difficulty + ?)),
              due_time = datetime('now', '+' || ? || ' days')
          WHERE library_id = ? AND relative_path = ?
        `)
          const info = stmt.run(difficultyChange, daysToAdd, libraryId, relativePath)
          db.close()
          return {
            success: true,
            message: `File updated. Next review in ${daysToAdd} day(s)`,
            changes: info.changes,
          }
        } catch (err) {
          return { success: false, error: err.message }
        }
      } catch (error) {
        return { success: false, error: error.message }
      }
    }
  )
}
