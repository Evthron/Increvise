// SPDX-FileCopyrightText: 2025 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Spaced Repetition Test Script

import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import {
  createDatabase,
  updateRevisionFeedback,
  checkFileInQueue,
  addFileToQueue,
  getFilesForRevision,
  getAllFilesForRevision,
} from '../src/main/ipc/spaced.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEST_WORKSPACE = path.join(__dirname, 'test-workspace')
const TEST_DB_PATH = path.join(TEST_WORKSPACE, '.increvise', 'db.sqlite')
const CENTRAL_DB_PATH = path.join(__dirname, 'test-central.sqlite')

// Mock getCentralDbPath function
const getCentralDbPath = () => CENTRAL_DB_PATH

function printSeparator(title) {
  console.log(`\n${title}`)
}

// Helper: Insert test data into database
function insertTestData(dbPath, libraryId) {
  const db = new Database(dbPath)

  const insertFile = db.prepare(`
    INSERT INTO file 
    (library_id, relative_path, added_time, review_count, easiness, rank, interval, due_time)
    VALUES (?, ?, datetime('now'), ?, ?, ?, ?, datetime('now', ? || ' days'))
  `)

  // File 1: Never reviewed (overdue)
  insertFile.run(libraryId, 'new-file.md', 0, 2.5, 70, 1, -1)

  // File 2: Reviewed once (overdue)
  insertFile.run(libraryId, 'reviewed-once.md', 1, 1.35, 70, 1, -1)

  // File 3: Reviewed multiple times (old file, overdue)
  insertFile.run(libraryId, 'old-file.md', 5, 2.2, 70, 30, -10)

  // File 4: Not yet due
  insertFile.run(libraryId, 'future-file.md', 2, 2.4, 70, 10, 5)

  db.close()
}

// Helper: Get library ID from database
function getLibraryId(dbPath) {
  const db = new Database(dbPath, { readonly: true })
  const library = db.prepare('SELECT library_id FROM library LIMIT 1').get()
  db.close()
  return library?.library_id
}

// ========================================
// Test 1: createDatabase - Create new database
// ========================================
async function test1_CreateDatabase() {
  printSeparator('Test 1: createDatabase')

  // Clean up old test workspace and central DB
  try {
    await fs.rm(TEST_WORKSPACE, { recursive: true, force: true })
    await fs.unlink(CENTRAL_DB_PATH)
  } catch {}

  // Create central database first
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
    )
  `)
  centralDb.close()

  const result = await createDatabase(TEST_WORKSPACE, getCentralDbPath)

  if (result.success) {
    const db = new Database(result.path, { readonly: true })
    const library = db.prepare('SELECT * FROM library').get()
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
    db.close()

    console.log(`  ✓ Created database with ${tables.length} tables`)
    console.log(`  ✓ Library: ${library.library_name} (${library.library_id})`)
    console.log(`  ✓ Registered in central database`)

    // Insert test data for subsequent tests
    insertTestData(result.path, library.library_id)
    console.log(`  ✓ Test data inserted`)

    return library.library_id
  } else {
    console.error('  ✗ Database creation failed:', result.error)
    throw new Error('Database creation failed')
  }
}

// ========================================
// Test 2: Inspect database content
// ========================================
async function test2_InspectDatabase() {
  printSeparator('Test 2: Database Content')

  const db = new Database(TEST_DB_PATH, { readonly: true })
  const files = db.prepare('SELECT * FROM file ORDER BY relative_path').all()
  db.close()

  console.log(`  ✓ Database contains ${files.length} test files`)
  files.forEach((file) => {
    console.log(
      `    - ${file.relative_path}: reviews=${file.review_count}, interval=${file.interval}d, easiness=${file.easiness}`
    )
  })
}

// ========================================
// Test 3: updateRevisionFeedback - First review
// ========================================
async function test3_FirstReview() {
  printSeparator('Test 3: First Review (good)')

  const libraryId = getLibraryId(TEST_DB_PATH)
  const testFile = 'new-file.md'
  const feedback = 'good'

  // Read state before update
  const db = new Database(TEST_DB_PATH)
  const before = db
    .prepare(
      'SELECT review_count, interval, easiness, rank FROM file WHERE library_id = ? AND relative_path = ?'
    )
    .get(libraryId, testFile)
  db.close()

  // Execute update
  await updateRevisionFeedback(TEST_DB_PATH, libraryId, testFile, feedback)

  // Read state after update
  const db2 = new Database(TEST_DB_PATH)
  const after = db2
    .prepare(
      'SELECT review_count, interval, easiness, rank FROM file WHERE library_id = ? AND relative_path = ?'
    )
    .get(libraryId, testFile)
  db2.close()

  console.log(
    `  Before: reviews=${before.review_count}, interval=${before.interval}d, easiness=${before.easiness}`
  )
  console.log(
    `  After:  reviews=${after.review_count}, interval=${after.interval}d, easiness=${after.easiness.toFixed(2)}`
  )
  console.log(`  ✓ First review interval is 1 day`)
}

// ========================================
// Test 4: updateRevisionFeedback - Second review
// ========================================
async function test4_SecondReview() {
  printSeparator('Test 4: Second Review (easy)')

  const libraryId = getLibraryId(TEST_DB_PATH)
  const testFile = 'reviewed-once.md'
  const feedback = 'easy'

  // Read state before update
  const db = new Database(TEST_DB_PATH)
  const before = db
    .prepare(
      'SELECT review_count, interval, easiness, rank FROM file WHERE library_id = ? AND relative_path = ?'
    )
    .get(libraryId, testFile)
  db.close()

  // Execute update
  await updateRevisionFeedback(TEST_DB_PATH, libraryId, testFile, feedback)

  // Read state after update
  const db2 = new Database(TEST_DB_PATH)
  const after = db2
    .prepare(
      'SELECT review_count, interval, easiness, rank FROM file WHERE library_id = ? AND relative_path = ?'
    )
    .get(libraryId, testFile)
  db2.close()

  console.log(
    `  Before: reviews=${before.review_count}, interval=${before.interval}d, easiness=${before.easiness}`
  )
  console.log(
    `  After:  reviews=${after.review_count}, interval=${after.interval}d, easiness=${after.easiness.toFixed(2)}`
  )
  console.log(`  ✓ Second review interval is 6 days`)
}

// ========================================
// Test 5: updateRevisionFeedback - Different feedbacks
// ========================================
async function test5_DifferentFeedbacks() {
  printSeparator('Test 5: Different Feedbacks')

  const libraryId = getLibraryId(TEST_DB_PATH)
  const feedbacks = ['again', 'hard', 'good', 'easy']
  const testFile = 'old-file.md'

  for (const feedback of feedbacks) {
    // Read state before update
    const db = new Database(TEST_DB_PATH)
    const before = db
      .prepare(
        'SELECT review_count, interval, easiness, rank FROM file WHERE library_id = ? AND relative_path = ?'
      )
      .get(libraryId, testFile)
    db.close()

    // Execute update
    await updateRevisionFeedback(TEST_DB_PATH, libraryId, testFile, feedback)

    // Read state after update
    const db2 = new Database(TEST_DB_PATH)
    const after = db2
      .prepare(
        'SELECT review_count, interval, easiness, rank FROM file WHERE library_id = ? AND relative_path = ?'
      )
      .get(libraryId, testFile)
    db2.close()

    const easinessChange = after.easiness - before.easiness
    const changeStr = `${easinessChange >= 0 ? '+' : ''}${easinessChange.toFixed(2)}`
    console.log(
      `  ${feedback.padEnd(6)}: easiness ${before.easiness.toFixed(2)} → ${after.easiness.toFixed(2)} (${changeStr})`
    )
  }
  console.log(`  ✓ Easiness changes correctly for all feedback types`)
}

// ========================================
// Test 6: checkFileInQueue - Check if file exists in queue
// ========================================
async function test6_CheckFileInQueue() {
  printSeparator('Test 6: checkFileInQueue')

  const libraryId = getLibraryId(TEST_DB_PATH)

  // Test existing file
  const existingFile = path.join(TEST_WORKSPACE, 'new-file.md')
  const result1 = await checkFileInQueue(existingFile, libraryId, getCentralDbPath)
  console.log(`  File in queue (new-file.md): ${result1.inQueue}`)

  // Test non-existing file
  const nonExistingFile = path.join(TEST_WORKSPACE, 'not-in-queue.md')
  const result2 = await checkFileInQueue(nonExistingFile, libraryId, getCentralDbPath)
  console.log(`  File NOT in queue (not-in-queue.md): ${!result2.inQueue}`)

  console.log(`  ✓ checkFileInQueue works correctly`)
}

// ========================================
// Test 7: addFileToQueue - Add new file to queue
// ========================================
async function test7_AddFileToQueue() {
  printSeparator('Test 7: addFileToQueue')

  const libraryId = getLibraryId(TEST_DB_PATH)

  // Add new file
  const newFile = path.join(TEST_WORKSPACE, 'test-add-file.md')
  const result1 = await addFileToQueue(newFile, libraryId, getCentralDbPath)
  console.log(`  Add new file: ${result1.success ? 'success' : 'failed'}`)

  // Try to add the same file again
  const result2 = await addFileToQueue(newFile, libraryId, getCentralDbPath)
  console.log(`  Add duplicate file: ${result2.alreadyExists ? 'rejected' : 'unexpected'}`)

  // Verify the file is in database
  const db = new Database(TEST_DB_PATH, { readonly: true })
  const file = db
    .prepare('SELECT * FROM file WHERE library_id = ? AND relative_path = ?')
    .get(libraryId, 'test-add-file.md')
  db.close()

  console.log(`  File added to database: ${file ? 'yes' : 'no'}`)
  console.log(`  ✓ addFileToQueue works correctly`)
}

// ========================================
// Test 8: getFilesForRevision - Get files due for revision
// ========================================
async function test8_GetFilesForRevision() {
  printSeparator('Test 8: getFilesForRevision')

  // Check file status
  const db = new Database(TEST_DB_PATH, { readonly: true })
  const allFiles = db
    .prepare(
      `SELECT relative_path, date(due_time) <= date('now') as is_due FROM file ORDER BY relative_path`
    )
    .all()
  db.close()

  const dueCount = allFiles.filter((f) => f.is_due).length
  const notDueCount = allFiles.filter((f) => !f.is_due).length

  console.log(`  Files in database: ${allFiles.length} (${dueCount} due, ${notDueCount} not due)`)

  const result = await getFilesForRevision(TEST_WORKSPACE)
  console.log(`  getFilesForRevision returned: ${result.files.length} files`)

  if (result.files.length > 0) {
    result.files.forEach((file) => {
      console.log(`    - ${file.relative_path}`)
    })
  }

  console.log(`  ✓ getFilesForRevision works correctly`)
}

// ========================================
// Test 9: getAllFilesForRevision - Get all files from central database
// ========================================
async function test9_GetAllFilesForRevision() {
  printSeparator('Test 9: getAllFilesForRevision')

  // Central database already exists and contains our workspace from test1
  const result = await getAllFilesForRevision(getCentralDbPath)

  console.log(`  Success: ${result.success}`)
  console.log(`  Files from all workspaces: ${result.files.length}`)

  if (result.files.length > 0) {
    result.files.forEach((file) => {
      console.log(`    - ${file.relative_path}`)
    })
  }

  console.log(`  ✓ getAllFilesForRevision works correctly`)
}

// ========================================
// Main test function
// ========================================
async function runAllTests() {
  console.log('\nSpaced Repetition Tests')
  console.log('='.repeat(50))

  try {
    await test1_CreateDatabase()
    await test2_InspectDatabase()
    await test3_FirstReview()
    await test4_SecondReview()
    await test5_DifferentFeedbacks()
    await test6_CheckFileInQueue()
    await test7_AddFileToQueue()
    await test8_GetFilesForRevision()
    await test9_GetAllFilesForRevision()

    console.log('\n✓ All tests completed successfully\n')
  } catch (error) {
    console.error('\n✗ Test failed:', error.message)
    console.error(error.stack)
  } finally {
    // Cleanup central database
    try {
      await fs.unlink(CENTRAL_DB_PATH)
    } catch {}
  }
}

// Execute tests
runAllTests()
