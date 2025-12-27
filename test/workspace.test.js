import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs/promises'
import Database from 'better-sqlite3'
import {
  recordWorkspace,
  getRecentWorkspaces,
  updateWorkspaceStats,
  removeWorkspace,
} from '../src/main/ipc/workspace.js'
import { createDatabase } from '../src/main/ipc/spaced.js'
import test from 'node:test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEST_WORKSPACE = path.join(__dirname, 'test-workspace')
const TEST_DB_PATH = path.join(TEST_WORKSPACE, '.increvise', 'db.sqlite')
const CENTRAL_DB_PATH = path.join(__dirname, 'test-central.sqlite')

// Mock getCentralDbPath function
const getCentralDbPath = () => CENTRAL_DB_PATH

// Initialize central database with required tables
async function initCentralDatabase() {
  try {
    // Remove existing database if present
    try {
      await fs.unlink(CENTRAL_DB_PATH)
    } catch {}

    const db = new Database(CENTRAL_DB_PATH)
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
    return true
  } catch (err) {
    console.error('Error initializing central database:', err)
    return false
  }
}

async function insertTestData(dbPath, libraryId) {
  db = new Database(dbPath)
  const insertFile = db.prepare(`
        INSERT INTO file
        (library_id, relative_path, added_time)
        VALUES
        (?, ?, datetime('now'))`)
  insertFile.run()
}

async function test1_record(folderPath, getCentralDbPath) {
  // Initialize central database first
  await initCentralDatabase()

  const res = await createDatabase(folderPath, getCentralDbPath)
  console.log('createDatabase:', res.success, res.path, res.libraryId)

  const result = await recordWorkspace(folderPath, getCentralDbPath)
  console.log('recordWorkspace:', result.success, result.id)
}

test1_record(TEST_WORKSPACE, getCentralDbPath)
