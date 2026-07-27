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
  quadraticMultiplier,
  moveFileToQueue,
  handleNewQueueFeedback,
  handleProcessingFeedback,
  handleIntermediateFeedback,
  getQueueConfig,
  setQueueConfig,
  getAllFilesForRevision,
} from '../src/main/ipc/spaced.js'
import { error } from 'node:console'

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

  const relativePath = 'test-document.md'
  const filePath = path.join(TEST_WORKSPACE, relativePath)

  const content = `### test`

  fs.writeFile(filePath, content, (err) => {
    if (err) {
      console.error(err)
    } else {
      // file written successfully
    }
  })

  await addFileToQueue(filePath, libraryId, getCentralDbPath)

  const dayMilli = 3600 * 1000 * 24
  const dueTime = new Date(Date.now() - dayMilli * 7)
  let dueTimeString = dueTime.toISOString()
  const date = dueTimeString.split('T')[0]
  const time = dueTimeString.split('T')[1].split('.')[0]
  dueTimeString = date + ' ' + time
  console.log('dueTimeString', dueTimeString)

  // check updated count not zero
  db.prepare(
    `
    update file
    set due_time = ?
    where relative_path = ?
    `
  ).run(dueTimeString, relativePath)

  const res = await handleIntermediateFeedback(TEST_DB_PATH, libraryId, relativePath, 'maintain')
  if (res.success) {
    console.log('success')
  } else {
    console.error(res.error)
    throw Error('error handling feedback')
  }

  const file = db
    .prepare(
      `select due_time
     from file
     where relative_path = ?
     `
    )
    .get(relativePath)

  console.log('due_time after updaet', file.due_time)

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
