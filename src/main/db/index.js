import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'os'
import Database from 'better-sqlite3'

export function getXdgDataHome() {
  return process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')
}

export function getCentralDbPath() {
  const dataHome = getXdgDataHome()
  return path.join(dataHome, 'increvise', 'central.sqlite')
}

export function getIncreviseDataDir() {
  const dataHome = getXdgDataHome()
  return path.join(dataHome, 'increvise')
}

export async function initializeCentralDatabase() {
  const increviseDataDir = getIncreviseDataDir()
  const centralDbPath = getCentralDbPath()

  await fs.mkdir(increviseDataDir, { recursive: true })

  console.log('Central database path:', centralDbPath)
  try {
    const db = new Database(centralDbPath)

    db.exec(`
      CREATE TABLE IF NOT EXISTS workspace_history (
        library_id TEXT PRIMARY KEY,
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

// Get workspace database path by library UUID
export async function getWorkspaceDbPath(libraryId, getCentralDbPath) {
  try {
    const centralDbPath = getCentralDbPath()
    const db = new Database(centralDbPath, { readonly: true })

    const result = db
      .prepare('SELECT db_path, folder_path FROM workspace_history WHERE library_id = ?')
      .get(libraryId)

    db.close()

    if (result) {
      // Verify database file still exists
      try {
        await fs.access(result.db_path)
        return {
          found: true,
          dbPath: result.db_path,
          folderPath: result.folder_path,
        }
      } catch {
        return { found: false, error: 'Database file not found at registered path' }
      }
    }

    return { found: false, error: 'Library ID not found in central database' }
  } catch (err) {
    return { found: false, error: err.message }
  }
}
