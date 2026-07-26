// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import {
  createDatabase,
  addFileToQueue,
  getFileQueue,
  moveFileToQueue,
  handleNewQueueFeedback,
  handleProcessingFeedback,
  handleIntermediateFeedback,
  getQueueConfig,
  setQueueConfig,
  getAllFilesForRevision,
} from '../src/main/ipc/spaced.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEST_WORKSPACE = path.join(__dirname, 'test-workspace')
const TEST_DB_PATH = path.join(TEST_WORKSPACE, '.increvise', 'db.sqlite')
const CENTRAL_DB_PATH = path.join(__dirname, 'test-central.sqlite')

// Mock getCentralDbPath function
const getCentralDbPath = () => CENTRAL_DB_PATH

function printSeparator(title) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(title)
  console.log('='.repeat(60))
}

// ========================================
// Test 1: Create database with queue system
// ========================================
async function test1_CreateDatabaseWithQueues() {
  printSeparator('Test 1: Create Database with Queue System')

  // Clean up
  await fs.rm(TEST_WORKSPACE, { recursive: true, force: true })
  // Create central database
  const centralDb = new Database(CENTRAL_DB_PATH)
  centralDb.exec(`
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

    CREATE INDEX IF NOT EXISTS idx_last_opened ON workspace_history(last_opened DESC);
    CREATE INDEX IF NOT EXISTS idx_folder_path ON workspace_history(folder_path);
  `)
  centralDb.close()

  await createDatabase(TEST_WORKSPACE, getCentralDbPath)

  const db = new Database(TEST_DB_PATH)
  const libraryId = db.prepare('SELECT library_id FROM library LIMIT 1').get().library_id

  const filePath = path.join(TEST_WORKSPACE, 'test-document.md')

  const content = `### test`

  fs.writeFile(filePath, content, (err) => {
    if (err) {
      console.error(err)
    } else {
      // file written successfully
    }
  })

  await addFileToQueue(filePath, libraryId, getCentralDbPath)

  db.prepare(
    `
    update file
    set due_time = datetime('now')
    where relative_path = ?
    `
  ).run(filePath)

  const res = db
    .prepare(
      `select added_time,
       last_revised_time,
          due_time,
          intermediate_interval
        from file
      `
    )
    .all()

  for (const r of res) {
    const date = r.due_time.split(' ')[0]
    const time = r.due_time.split(' ')[1]
    const hour = time.split(':')[0]
    const minute = time.split(':')[1]
    const second = time.split(':')[2]
    const d = new Date(2024, 2, 10, 2, 30)
    console.log(date, time)
  }
  db.close()
}

async function runAllTests() {
  try {
    await test1_CreateDatabaseWithQueues()
  } catch (error) {
    console.error('\n✗ Test failed:', error.message)
    console.error(error.stack)
  }
}

// Execute tests
runAllTests()
