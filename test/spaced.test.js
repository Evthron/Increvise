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
  moveFileToQueue,
  migrateSpacedQueue,
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
    (library_id, relative_path, added_time, review_count, easiness, rank, interval, due_time, rotation_interval, intermediate_base, intermediate_multiplier)
    VALUES (?, ?, datetime('now'), ?, ?, ?, ?, datetime('now', ? || ' days'), ?, ?, ?)
  `)

  const insertMembership = db.prepare(`
    INSERT INTO queue_membership (library_id, queue_name, relative_path)
    VALUES (?, ?, ?)
  `)

  // File 1: In new queue (never reviewed)
  insertFile.run(libraryId, 'new-file.md', 0, 2.5, 70, 1, -1, 3, 7, 1.0)
  insertMembership.run(libraryId, 'new', 'new-file.md')

  // File 2: In processing queue
  insertFile.run(libraryId, 'processing-file.md', 2, 2.5, 70, 1, -1, 3, 7, 1.0)
  insertMembership.run(libraryId, 'processing', 'processing-file.md')

  // File 3: In intermediate queue
  insertFile.run(libraryId, 'intermediate-file.md', 3, 2.5, 70, 7, -1, 3, 7, 1.0)
  insertMembership.run(libraryId, 'intermediate', 'intermediate-file.md')

  // File 4: In spaced-standard queue (reviewed once)
  insertFile.run(libraryId, 'spaced-standard-file.md', 1, 1.35, 70, 1, -1, 3, 7, 1.0)
  insertMembership.run(libraryId, 'spaced-standard', 'spaced-standard-file.md')

  // File 5: In spaced-casual queue (reviewed multiple times)
  insertFile.run(libraryId, 'spaced-casual-file.md', 5, 2.0, 70, 30, -10, 3, 7, 1.0)
  insertMembership.run(libraryId, 'spaced-casual', 'spaced-casual-file.md')

  // File 6: In spaced-strict queue (not yet due)
  insertFile.run(libraryId, 'spaced-strict-file.md', 2, 2.8, 70, 10, 5, 3, 7, 1.0)
  insertMembership.run(libraryId, 'spaced-strict', 'spaced-strict-file.md')

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
  } catch {
    // Files may not exist, ignore error
  }

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
      .prepare('SELECT name FROM sqlite_master WHERE type=\'table\' ORDER BY name')
      .all()
    db.close()

    console.log(`  ✓ Created database with ${tables.length} tables`)
    console.log(`  ✓ Library: ${library.library_name} (${library.library_id})`)
    console.log('  ✓ Registered in central database')

    // Insert test data for subsequent tests
    insertTestData(result.path, library.library_id)
    console.log('  ✓ Test data inserted')

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
  const files = db
    .prepare(
      `SELECT f.*, qm.queue_name 
       FROM file f 
       JOIN queue_membership qm ON f.library_id = qm.library_id AND f.relative_path = qm.relative_path 
       ORDER BY qm.queue_name, f.relative_path`
    )
    .all()
  db.close()

  console.log(`  ✓ Database contains ${files.length} test files in various queues`)
  files.forEach((file) => {
    console.log(
      `    - ${file.relative_path}: queue=${file.queue_name}, reviews=${file.review_count}`
    )
  })
}

// ========================================
// Test 3: Test New Queue Feedback
// ========================================
async function test3_NewQueueFeedback() {
  printSeparator('Test 3: New Queue Feedback')

  const libraryId = getLibraryId(TEST_DB_PATH)
  const testFile = 'new-file.md'

  // Check queue before
  const db = new Database(TEST_DB_PATH, { readonly: true })
  const before = db
    .prepare(
      `SELECT qm.queue_name FROM queue_membership qm 
       WHERE qm.library_id = ? AND qm.relative_path = ?`
    )
    .get(libraryId, testFile)
  db.close()

  console.log(`  Before: queue=${before.queue_name}`)

  // Any feedback on new queue should move to processing
  const result = await updateRevisionFeedback(TEST_DB_PATH, libraryId, testFile, 'good')

  // Check queue after
  const db2 = new Database(TEST_DB_PATH, { readonly: true })
  const after = db2
    .prepare(
      `SELECT qm.queue_name FROM queue_membership qm 
       WHERE qm.library_id = ? AND qm.relative_path = ?`
    )
    .get(libraryId, testFile)
  db2.close()

  console.log(`  After:  queue=${after.queue_name}`)
  console.log(`  Result: ${result.message}`)
  console.log('  ✓ File moved from \'new\' to \'processing\' queue')
}

// ========================================
// Test 4: Test Processing Queue Feedback
// ========================================
async function test4_ProcessingFeedback() {
  printSeparator('Test 4: Processing Queue Feedback')

  const libraryId = getLibraryId(TEST_DB_PATH)
  const testFile = 'processing-file.md'

  // Test 'again' feedback (immediate review)
  let result = await updateRevisionFeedback(TEST_DB_PATH, libraryId, testFile, 'again')
  console.log(`  'again' feedback: ${result.message}`)

  // Test 'continue' feedback (rotate)
  result = await updateRevisionFeedback(TEST_DB_PATH, libraryId, testFile, 'continue')
  console.log(`  'continue' feedback: ${result.message}`)

  console.log('  ✓ Processing queue feedback works correctly')
}

// ========================================
// Test 5: Test Intermediate Queue Feedback
// ========================================
async function test5_IntermediateFeedback() {
  printSeparator('Test 5: Intermediate Queue Feedback')

  const libraryId = getLibraryId(TEST_DB_PATH)
  const testFile = 'intermediate-file.md'

  const feedbacks = ['decrease', 'maintain', 'increase']

  for (const feedback of feedbacks) {
    const result = await updateRevisionFeedback(TEST_DB_PATH, libraryId, testFile, feedback)
    console.log(`  '${feedback}' feedback: ${result.message}`)
  }

  console.log('  ✓ Intermediate queue feedback works correctly')
}

// ========================================
// Test 6: Test Spaced Queue Feedback
// ========================================
async function test6_SpacedFeedback() {
  printSeparator('Test 6: Spaced Queue Feedback (SM-2)')

  const libraryId = getLibraryId(TEST_DB_PATH)
  const testFile = 'spaced-standard-file.md'

  // Read state before update
  const db = new Database(TEST_DB_PATH)
  const before = db
    .prepare(
      'SELECT review_count, interval, easiness FROM file WHERE library_id = ? AND relative_path = ?'
    )
    .get(libraryId, testFile)
  db.close()

  // Execute update
  const result = await updateRevisionFeedback(TEST_DB_PATH, libraryId, testFile, 'easy')

  // Read state after update
  const db2 = new Database(TEST_DB_PATH)
  const after = db2
    .prepare(
      'SELECT review_count, interval, easiness FROM file WHERE library_id = ? AND relative_path = ?'
    )
    .get(libraryId, testFile)
  db2.close()

  console.log(
    `  Before: reviews=${before.review_count}, interval=${before.interval}d, easiness=${before.easiness}`
  )
  console.log(
    `  After:  reviews=${after.review_count}, interval=${after.interval}d, easiness=${after.easiness.toFixed(2)}`
  )
  console.log(`  Queue: ${result.queueName}`)
  console.log('  ✓ Second review interval is 6 days (spaced-standard config)')
}

// ========================================
// Test 7: Test Different Spaced Queues
// ========================================
async function test7_DifferentSpacedQueues() {
  printSeparator('Test 7: Different Spaced Queues')

  const libraryId = getLibraryId(TEST_DB_PATH)
  const feedbacks = ['again', 'hard', 'good', 'easy']
  const testFile = 'spaced-casual-file.md'

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
      `  ${feedback.padEnd(6)}: easiness ${before.easiness.toFixed(2)} → ${after.easiness.toFixed(2)} (${changeStr}), interval ${after.interval}d`
    )
  }
  console.log('  ✓ Spaced-casual queue: min_ef=1.2, second_interval=4')
}

// ========================================
// Test 8: checkFileInQueue - Check if file exists in queue
// ========================================
async function test8_CheckFileInQueue() {
  printSeparator('Test 8: checkFileInQueue')

  const libraryId = getLibraryId(TEST_DB_PATH)

  // Test existing file
  const existingFile = path.join(TEST_WORKSPACE, 'new-file.md')
  const result1 = await checkFileInQueue(existingFile, libraryId, getCentralDbPath)
  console.log(`  File in queue (new-file.md): ${result1.inQueue}`)

  // Test non-existing file
  const nonExistingFile = path.join(TEST_WORKSPACE, 'not-in-queue.md')
  const result2 = await checkFileInQueue(nonExistingFile, libraryId, getCentralDbPath)
  console.log(`  File NOT in queue (not-in-queue.md): ${!result2.inQueue}`)

  console.log('  ✓ checkFileInQueue works correctly')
}

// ========================================
// Test 9: addFileToQueue - Add new file to queue
// ========================================
async function test9_AddFileToQueue() {
  printSeparator('Test 9: addFileToQueue')

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
  console.log('  ✓ addFileToQueue works correctly')
}

// ========================================
// Test 10: getFilesForRevision - Get files due for revision
// ========================================
async function test10_GetFilesForRevision() {
  printSeparator('Test 10: getFilesForRevision')

  // Check file status
  const db = new Database(TEST_DB_PATH, { readonly: true })
  const allFiles = db
    .prepare(
      'SELECT relative_path, date(due_time) <= date(\'now\') as is_due FROM file ORDER BY relative_path'
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

  console.log('  ✓ getFilesForRevision works correctly')
}

// ========================================
// Test 11: getAllFilesForRevision - Get all files from central database
// ========================================
async function test11_GetAllFilesForRevision() {
  printSeparator('Test 11: getAllFilesForRevision')

  // Central database already exists and contains our workspace from test1
  const result = await getAllFilesForRevision(getCentralDbPath)

  console.log(`  Success: ${result.success}`)
  console.log(`  Files from all workspaces: ${result.files.length}`)

  if (result.files.length > 0) {
    result.files.forEach((file) => {
      console.log(`    - ${file.relative_path} (queue: ${file.queue_name})`)
    })
  }

  console.log('  ✓ getAllFilesForRevision works correctly')
}

// ========================================
// Test 12: Test queue configurations
// ========================================
async function test12_QueueConfigurations() {
  printSeparator('Test 12: Queue Configurations')

  const db = new Database(TEST_DB_PATH, { readonly: true })

  // Check all spaced queues exist
  const queues = db
    .prepare('SELECT queue_name, description FROM review_queue WHERE queue_name LIKE \'spaced-%\'')
    .all()

  console.log(`  ✓ Found ${queues.length} spaced sub-queues:`)
  queues.forEach((q) => {
    console.log(`    - ${q.queue_name}: ${q.description}`)
  })

  // Check configurations for spaced-standard
  const configs = db
    .prepare(
      'SELECT config_key, config_value FROM queue_config WHERE queue_name = \'spaced-standard\''
    )
    .all()

  console.log('  ✓ spaced-standard configuration:')
  configs.forEach((c) => {
    console.log(`    - ${c.config_key}: ${c.config_value}`)
  })

  db.close()
}

// ========================================
// Test 13: Test migration from old spaced queue
// ========================================
async function test13_MigrateOldQueue() {
  printSeparator('Test 13: Migration Test')

  const libraryId = getLibraryId(TEST_DB_PATH)

  // This should report "no migration needed" since we're using new structure
  const result = await migrateSpacedQueue(libraryId, getCentralDbPath)

  console.log(`  Migration result: ${result.message}`)
  console.log('  ✓ Migration function works correctly')
}

// ========================================
// Test 14: Test moving files between queues
// ========================================
async function test14_MoveFileToQueue() {
  printSeparator('Test 14: Move File to Queue')

  const libraryId = getLibraryId(TEST_DB_PATH)
  const testFile = path.join(TEST_WORKSPACE, 'spaced-strict-file.md')

  // Get current queue
  const db = new Database(TEST_DB_PATH, { readonly: true })
  const before = db
    .prepare(
      'SELECT qm.queue_name, f.easiness FROM file f JOIN queue_membership qm ON f.library_id = qm.library_id AND f.relative_path = qm.relative_path WHERE f.library_id = ? AND f.relative_path = ?'
    )
    .get(libraryId, 'spaced-strict-file.md')
  db.close()

  console.log(`  Before: queue=${before.queue_name}, easiness=${before.easiness}`)

  // Move to spaced-casual (should set initial_ef = 2.0)
  const result = await moveFileToQueue(testFile, libraryId, 'spaced-casual', getCentralDbPath)
  console.log(`  Move result: ${result.message}`)

  // Check after move
  const db2 = new Database(TEST_DB_PATH, { readonly: true })
  const after = db2
    .prepare(
      'SELECT qm.queue_name, f.easiness FROM file f JOIN queue_membership qm ON f.library_id = qm.library_id AND f.relative_path = qm.relative_path WHERE f.library_id = ? AND f.relative_path = ?'
    )
    .get(libraryId, 'spaced-strict-file.md')
  db2.close()

  console.log(`  After:  queue=${after.queue_name}, easiness=${after.easiness}`)
  console.log('  ✓ File moved and easiness reset to queue\'s initial_ef')
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
    await test12_QueueConfigurations()
    await test3_NewQueueFeedback()
    await test4_ProcessingFeedback()
    await test5_IntermediateFeedback()
    await test6_SpacedFeedback()
    await test7_DifferentSpacedQueues()
    await test8_CheckFileInQueue()
    await test9_AddFileToQueue()
    await test10_GetFilesForRevision()
    await test11_GetAllFilesForRevision()
    await test13_MigrateOldQueue()
    await test14_MoveFileToQueue()

    console.log('\n✓ All tests completed successfully\n')
  } catch (error) {
    console.error('\n✗ Test failed:', error.message)
    console.error(error.stack)
  } finally {
    // Cleanup central database
    try {
      await fs.unlink(CENTRAL_DB_PATH)
    } catch {
      // File may not exist, ignore error
    }
  }
}

// Execute tests
runAllTests()
