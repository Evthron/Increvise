// SPDX-FileCopyrightText: 2025 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Workspace IPC Handlers
import path from 'node:path'
import Database from 'better-sqlite3'

async function recordWorkspace(folderPath, getCentralDbPath) {
  const centralDbPath = getCentralDbPath()
  const folderName = path.basename(folderPath)
  const dbPath = path.join(folderPath, '.increvise', 'db.sqlite')
  try {
    // Get the library_id from the folder database
    let libraryId
    try {
      const folderDb = new Database(dbPath, { readonly: true })
      const library = folderDb.prepare('SELECT library_id FROM library LIMIT 1').get()
      folderDb.close()

      if (!library) {
        return { success: false, error: 'Workspace database has no library record' }
      }
      libraryId = library.library_id
    } catch (err) {
      return { success: false, error: `Failed to read workspace database: ${err.message}` }
    }

    const db = new Database(centralDbPath)
    const stmt = db.prepare(`
        INSERT INTO workspace_history 
        (library_id, folder_path, folder_name, db_path, last_opened, open_count)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 1)
        ON CONFLICT(library_id) DO UPDATE SET
          folder_path = excluded.folder_path,
          folder_name = excluded.folder_name,
          db_path = excluded.db_path,
          last_opened = CURRENT_TIMESTAMP,
          open_count = open_count + 1
      `)
    const info = stmt.run(libraryId, folderPath, folderName, dbPath)
    db.close()
    return { success: true, id: info.lastInsertRowid, libraryId }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

async function getRecentWorkspaces(limit = 10, getCentralDbPath) {
  const centralDbPath = getCentralDbPath()
  try {
    const db = new Database(centralDbPath)
    const rows = db
      .prepare(
        `
        SELECT * FROM workspace_history 
        ORDER BY last_opened DESC 
        LIMIT ?
      `
      )
      .all(limit)
    db.close()
    return rows || []
  } catch (err) {
    return []
  }
}

async function updateWorkspaceStats(folderPath, totalFiles, filesDueToday, getCentralDbPath) {
  const centralDbPath = getCentralDbPath()
  try {
    const db = new Database(centralDbPath)
    const stmt = db.prepare(`
        UPDATE workspace_history 
        SET total_files = ?, files_due_today = ?
        WHERE folder_path = ?
      `)
    const info = stmt.run(totalFiles, filesDueToday, folderPath)
    db.close()
    return { success: true, changes: info.changes }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

async function removeWorkspace(folderPath, getCentralDbPath) {
  const centralDbPath = getCentralDbPath()
  try {
    const db = new Database(centralDbPath)
    const stmt = db.prepare(`
      DELETE FROM workspace_history 
      WHERE folder_path = ?
    `)
    const info = stmt.run(folderPath)
    db.close()
    return { success: true, changes: info.changes }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

export function registerWorkspaceIpc(ipcMain, getCentralDbPath) {
  ipcMain.handle('record-workspace', async (event, folderPath) =>
    recordWorkspace(folderPath, getCentralDbPath)
  )

  ipcMain.handle('get-recent-workspaces', async (event, limit = 10) =>
    getRecentWorkspaces(limit, getCentralDbPath)
  )

  ipcMain.handle('update-workspace-stats', async (event, folderPath, totalFiles, filesDueToday) =>
    updateWorkspaceStats(folderPath, totalFiles, filesDueToday, getCentralDbPath)
  )

  ipcMain.handle('remove-workspace', async (event, folderPath) =>
    removeWorkspace(folderPath, getCentralDbPath)
  )
}

// Export functions for testing
export { recordWorkspace, getRecentWorkspaces, updateWorkspaceStats, removeWorkspace }
