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

export async function findIncreviseDatabase(filePath) {
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
        rootPath: currentDir,
      }
    } catch {}

    currentDir = path.dirname(currentDir)
  }

  return { found: false, dbPath: null, rootPath: null }
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
