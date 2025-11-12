// Workspace IPC Handlers
import path from 'node:path'
import Database from 'better-sqlite3'

export function registerWorkspaceIpc(ipcMain, getCentralDbPath) {
  ipcMain.handle('record-workspace', async (event, folderPath) => {
    const centralDbPath = getCentralDbPath()
    const folderName = path.basename(folderPath)
    const dbPath = path.join(folderPath, '.increvise', 'db.sqlite')
    try {
      const db = new Database(centralDbPath)
      const stmt = db.prepare(`
        INSERT INTO workspace_history 
        (folder_path, folder_name, db_path, last_opened, open_count)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP, 1)
        ON CONFLICT(folder_path) DO UPDATE SET
          last_opened = CURRENT_TIMESTAMP,
          open_count = open_count + 1
      `)
      const info = stmt.run(folderPath, folderName, dbPath)
      db.close()
      return { success: true, id: info.lastInsertRowid }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('get-recent-workspaces', async (event, limit = 10) => {
    const centralDbPath = getCentralDbPath()
    try {
      const db = new Database(centralDbPath)
      const rows = db.prepare(`
        SELECT * FROM workspace_history 
        ORDER BY last_opened DESC 
        LIMIT ?
      `).all(limit)
      db.close()
      return rows || []
    } catch (err) {
      return []
    }
  })

  ipcMain.handle('update-workspace-stats', async (event, folderPath, totalFiles, filesDueToday) => {
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
  })

  ipcMain.handle('remove-workspace', async (event, folderPath) => {
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
  })
}
