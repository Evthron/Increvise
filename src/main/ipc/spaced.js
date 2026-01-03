// SPDX-FileCopyrightText: 2025 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Spaced Repetition IPC Handlers
import path from 'node:path'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import Database from 'better-sqlite3'
import { getWorkspaceDbPath } from '../db/index.js'

async function createDatabase(folderPath, getCentralDbPath) {
  try {
    const increviseFolder = path.join(folderPath, '.increvise')
    const dbFilePath = path.join(increviseFolder, 'db.sqlite')
    await fs.mkdir(increviseFolder, { recursive: true })

    // Check if database already exists
    try {
      await fs.access(dbFilePath)
      // Database exists, get its library_id
      const db = new Database(dbFilePath, { readonly: true })
      const library = db.prepare('SELECT library_id FROM library LIMIT 1').get()
      db.close()

      if (library) {
        return { success: true, path: dbFilePath, libraryId: library.library_id }
      }
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
              easiness REAL DEFAULT 0.0,
              rank REAL DEFAULT 70.0,
              interval INTEGER DEFAULT 1,
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
              parent_path TEXT,
              extract_type TEXT NOT NULL,
              range_start TEXT,
              range_end TEXT,
              source_hash TEXT,

              PRIMARY KEY (library_id, relative_path),
              FOREIGN KEY (library_id, relative_path) 
                  REFERENCES file(library_id, relative_path)
          );

          CREATE INDEX idx_note_source_parent ON note_source(library_id, parent_path);
          CREATE INDEX idx_note_source_hash ON note_source(library_id, source_hash);
        `)

      const libraryId = crypto.randomUUID()
      const libraryName = path.basename(folderPath)
      db.prepare('INSERT INTO library (library_id, library_name) VALUES (?, ?)').run(
        libraryId,
        libraryName
      )

      db.close()

      // Register in central database
      try {
        const centralDbPath = getCentralDbPath()
        const centralDb = new Database(centralDbPath)
        centralDb
          .prepare(
            `INSERT OR REPLACE INTO workspace_history 
             (library_id, folder_path, folder_name, db_path, last_opened, open_count)
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 1)`
          )
          .run(libraryId, folderPath, libraryName, dbFilePath)
        centralDb.close()
      } catch (err) {
        console.error('Failed to register workspace in central database:', err)
        // Continue anyway - database is created successfully
      }

      return { success: true, path: dbFilePath, libraryId }
    } catch (err) {
      return { success: false, error: err.message }
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

async function checkFileInQueue(filePath, libraryId, getCentralDbPath) {
  try {
    const dbInfo = await getWorkspaceDbPath(libraryId, getCentralDbPath)
    if (!dbInfo.found) {
      return { inQueue: false, error: dbInfo.error || 'Database not found' }
    }
    try {
      const db = new Database(dbInfo.dbPath)
      const relativePath = path.relative(dbInfo.folderPath, filePath)
      const { exists_flag } = db
        .prepare(
          'SELECT EXISTS ( SELECT 1 FROM file WHERE library_id = ? AND relative_path = ? ) AS exists_flag'
        )
        .get(libraryId, relativePath)
      const exists = exists_flag === 1
      db.close()
      return { inQueue: exists }
    } catch (err) {
      return { inQueue: false, error: err.message }
    }
  } catch (error) {
    return { inQueue: false, error: error.message }
  }
}

async function addFileToQueue(filePath, libraryId, getCentralDbPath) {
  try {
    const dbInfo = await getWorkspaceDbPath(libraryId, getCentralDbPath)
    if (!dbInfo.found) {
      return { success: false, error: dbInfo.error || 'Database not found' }
    }
    try {
      const db = new Database(dbInfo.dbPath)
      const relativePath = path.relative(dbInfo.folderPath, filePath)

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
        `INSERT INTO file (library_id, relative_path, added_time, review_count, easiness, rank, due_time)
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
}

async function getFilesForRevision(rootPath) {
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
                   review_count, easiness, due_time
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
}

async function getAllFilesForRevision(getCentralDbPath) {
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
                   review_count, easiness, due_time
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
}

async function updateRevisionFeedback(dbPath, libraryId, relativePath, feedback) {
  const response_quality = { again: 0, hard: 1, medium: 3, easy: 5 }
  const q = response_quality[feedback]
  const easiness_update = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)
  try {
    const db = new Database(dbPath)
    // Get parameters needed for SM-2 (review_count, interval, easiness)
    const row = db
      .prepare(
        'SELECT review_count, interval, easiness, rank FROM file WHERE library_id = ? AND relative_path = ?'
      )
      .get(libraryId, relativePath)
    const reviewCount = row ? row.review_count : 0
    const interval = row ? row.interval : 1
    const easiness = row ? row.easiness : 2.5
    const rank = row ? row.rank : 70
    const newEasiness = Math.max(1.3, Math.min(2.5, easiness + easiness_update))
    const newRank = rank + Math.floor(easiness_update * 5)
    let newInterval
    if (q === 0) {
      newInterval = 1
    } else if (reviewCount === 0) {
      newInterval = 1
    } else if (reviewCount === 1) {
      newInterval = 6
    } else {
      newInterval = Math.floor(interval * newEasiness)
    }
    const stmt = db.prepare(`
          UPDATE file
          SET last_revised_time = datetime('now'),
              review_count = review_count + 1,
              easiness = ?,
              interval = ?,
              due_time = datetime('now', '+' || ? || ' days'),
              rank = ?
          WHERE library_id = ? AND relative_path = ?
        `)
    const info = stmt.run(newEasiness, newInterval, newInterval, newRank, libraryId, relativePath)
    db.close()
    return {
      success: true,
      message: `File updated. Next review in ${interval} day(s)`,
      changes: info.changes,
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

async function forgetFile(filePath, libraryId, getCentralDbPath) {
  try {
    const dbInfo = await getWorkspaceDbPath(libraryId, getCentralDbPath)
    if (!dbInfo.found) {
      return { success: false, error: dbInfo.error || 'Database not found' }
    }
    try {
      const db = new Database(dbInfo.dbPath)
      const relativePath = path.relative(dbInfo.folderPath, filePath)

      // Check if file exists in database
      const { exists_flag } = db
        .prepare(
          'SELECT EXISTS ( SELECT 1 FROM file WHERE library_id = ? AND relative_path = ? ) AS exists_flag'
        )
        .get(libraryId, relativePath)
      const exists = exists_flag === 1
      if (!exists) {
        db.close()
        return { success: false, error: 'File not found in database' }
      }

      // Delete all revision data from note_source table
      const deleteNoteSource = db.prepare(
        'DELETE FROM note_source WHERE library_id = ? AND relative_path = ?'
      )
      const noteSourceResult = deleteNoteSource.run(libraryId, relativePath)

      // Reset spaced repetition data in file table
      const resetFile = db.prepare(`
        UPDATE file
        SET last_revised_time = NULL,
            review_count = 0,
            easiness = 0.0,
            rank = 70.0,
            interval = 1,
            due_time = datetime('now')
        WHERE library_id = ? AND relative_path = ?
      `)
      const fileResult = resetFile.run(libraryId, relativePath)

      db.close()
      return {
        success: true,
        message: 'File revision data erased, but entry kept in database',
        deletedRevisions: noteSourceResult.changes,
        updatedFile: fileResult.changes > 0,
        resetValues: {
          last_revised_time: null,
          review_count: 0,
          easiness: 0.0,
          rank: 70.0,
          interval: 1,
          due_time: new Date().toISOString()
        }
      }
    } catch (err) {
      return { success: false, error: err.message }
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

export function registerSpacedIpc(ipcMain, getCentralDbPath) {
  ipcMain.handle('create-database', (event, folderPath) =>
    createDatabase(folderPath, getCentralDbPath)
  )
  ipcMain.handle('check-file-in-queue', (event, filePath, libraryId) =>
    checkFileInQueue(filePath, libraryId, getCentralDbPath)
  )
  ipcMain.handle('add-file-to-queue', (event, filePath, libraryId) =>
    addFileToQueue(filePath, libraryId, getCentralDbPath)
  )
  ipcMain.handle('get-files-for-revision', (event, rootPath) => getFilesForRevision(rootPath))
  ipcMain.handle('get-all-files-for-revision', (event) => getAllFilesForRevision(getCentralDbPath))
  ipcMain.handle('update-revision-feedback', (event, dbPath, libraryId, relativePath, feedback) =>
    updateRevisionFeedback(dbPath, libraryId, relativePath, feedback)
  )
  ipcMain.handle('forget-file', (event, filePath, libraryId) =>
    forgetFile(filePath, libraryId, getCentralDbPath)
  )
}

// Export functions for testing
export {
  createDatabase,
  checkFileInQueue,
  addFileToQueue,
  getFilesForRevision,
  getAllFilesForRevision,
  updateRevisionFeedback,
  forgetFile,
}
