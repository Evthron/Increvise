// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Queue System Test Script

import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import {
  createDatabase,
  addFileToQueue,
  getFileQueue,
  moveFileToQueue,
  handleExtraction,
  handleNewQueueFeedback,
  handleProcessingFeedback,
  handleIntermediateFeedback,
  getQueueConfig,
  setQueueConfig,
  getAllFilesForRevision,
} from '../src/main/ipc/spaced.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEST_WORKSPACE = path.join(__dirname, 'test-queue-workspace')
const TEST_DB_PATH = path.join(TEST_WORKSPACE, '.increvise', 'db.sqlite')
const CENTRAL_DB_PATH = path.join(__dirname, 'test-queue-central.sqlite')

// Mock getCentralDbPath function
const getCentralDbPath = () => CENTRAL_DB_PATH

function printSeparator(title) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(title)
  console.log('='.repeat(60))
}

// Helper: Get library ID from database
function getLibraryId(dbPath) {
  const db = new Database(dbPath, { readonly: true })
  const library = db.prepare('SELECT library_id FROM library LIMIT 1').get()
  db.close()
  return library?.library_id
}

// ========================================
// Test 1: Create database with queue system
// ========================================
async function test1_CreateDatabaseWithQueues() {
  printSeparator('Test 1: Create Database with Queue System')

  // Clean up
  try {
    await fs.rm(TEST_WORKSPACE, { recursive: true, force: true })
    await fs.unlink(CENTRAL_DB_PATH)
  } catch {}

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
    )
  `)
  centralDb.close()

  const result = await createDatabase(TEST_WORKSPACE, getCentralDbPath)

  if (result.success) {
    const db = new Database(result.path, { readonly: true })

    // Check tables
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
    console.log(`✓ Created database with ${tables.length} tables`)

    // Check queues
    const queues = db.prepare('SELECT queue_name, description FROM review_queue').all()
    console.log(`✓ Created ${queues.length} default queues:`)
    queues.forEach((q) => console.log(`  - ${q.queue_name}: ${q.description}`))

    // Check configs
    const configs = db
      .prepare('SELECT queue_name, config_key, config_value FROM queue_config')
      .all()
    console.log(`✓ Created ${configs.length} default configs:`)
    configs.forEach((c) => console.log(`  - ${c.queue_name}.${c.config_key} = ${c.config_value}`))
    console.log(`  (Note: 'global' is a config namespace, not a real queue)`)

    db.close()
    return result.libraryId
  } else {
    console.error('✗ Database creation failed:', result.error)
    throw new Error('Database creation failed')
  }
}

// ========================================
// Test 2: Add file to new queue
// ========================================
async function test2_AddFileToNewQueue() {
  printSeparator('Test 2: Add File to New Queue')

  const libraryId = getLibraryId(TEST_DB_PATH)
  const filePath = path.join(TEST_WORKSPACE, 'test-document.md')

  const result = await addFileToQueue(filePath, libraryId, getCentralDbPath)
  console.log(`Add file result: ${result.success ? 'success' : 'failed'}`)

  if (result.success) {
    const queueResult = await getFileQueue(filePath, libraryId, getCentralDbPath)
    console.log(`✓ File added to queue: ${queueResult.queueName}`)

    const db = new Database(TEST_DB_PATH, { readonly: true })
    const file = db
      .prepare('SELECT * FROM file WHERE library_id = ? AND relative_path = ?')
      .get(libraryId, 'test-document.md')
    console.log(`✓ File parameters:`)
    console.log(`  - rank: ${file.rank}`)
    console.log(`  - easiness: ${file.easiness}`)
    console.log(`  - rotation_interval: ${file.rotation_interval}`)
    console.log(`  - intermediate_interval: ${file.intermediate_interval}`)
    db.close()
  }
}

// ========================================
// Test 3: Move from new to processing queue
// ========================================
async function test3_MoveToProcessingQueue() {
  printSeparator('Test 3: Move from New to Processing Queue')

  const libraryId = getLibraryId(TEST_DB_PATH)
  const filePath = path.join(TEST_WORKSPACE, 'test-document.md')

  // Simulate first view (new queue auto-moves to processing)
  const db = new Database(TEST_DB_PATH)
  const result = await handleNewQueueFeedback(TEST_DB_PATH, libraryId, 'test-document.md')

  console.log(`Move to processing: ${result.success ? 'success' : 'failed'}`)

  if (result.success) {
    const queueResult = await getFileQueue(filePath, libraryId, getCentralDbPath)
    console.log(`✓ File now in queue: ${queueResult.queueName}`)

    const file = db
      .prepare(
        'SELECT due_time, rotation_interval FROM file WHERE library_id = ? AND relative_path = ?'
      )
      .get(libraryId, 'test-document.md')
    console.log(`✓ Due time set: ${file.due_time}`)
    console.log(`✓ Rotation interval: ${file.rotation_interval} days`)
  }
  db.close()
}

// ========================================
// Test 4: Processing queue feedback
// ========================================
async function test4_ProcessingFeedback() {
  printSeparator('Test 4: Processing Queue Feedback')

  const libraryId = getLibraryId(TEST_DB_PATH)

  // Test 'continue' feedback
  console.log('\nTesting "continue" feedback:')
  const result1 = await handleProcessingFeedback(
    TEST_DB_PATH,
    libraryId,
    'test-document.md',
    'continue'
  )
  console.log(`  Result: ${result1.success ? 'success' : 'failed'}`)

  // Test 'again' feedback
  console.log('\nTesting "again" feedback:')
  const result2 = await handleProcessingFeedback(
    TEST_DB_PATH,
    libraryId,
    'test-document.md',
    'again'
  )
  console.log(`  Result: ${result2.success ? 'success' : 'failed'}`)

  const db = new Database(TEST_DB_PATH, { readonly: true })
  const file = db
    .prepare('SELECT due_time FROM file WHERE library_id = ? AND relative_path = ?')
    .get(libraryId, 'test-document.md')
  console.log(`  ✓ Due time after 'again': ${file.due_time}`)
  db.close()
}

// ========================================
// Test 5: Extract and create child note
// ========================================
async function test5_Extraction() {
  printSeparator('Test 5: Extract and Create Child Note')

  const libraryId = getLibraryId(TEST_DB_PATH)
  const parentPath = path.join(TEST_WORKSPACE, 'test-document.md')
  const childPath = path.join(TEST_WORKSPACE, 'test-document', 'extract-1.md')

  const db = new Database(TEST_DB_PATH, { readonly: true })
  const parentBefore = db
    .prepare('SELECT rank, extraction_count FROM file WHERE library_id = ? AND relative_path = ?')
    .get(libraryId, 'test-document.md')
  console.log(`Parent before extraction:`)
  console.log(`  - rank: ${parentBefore.rank}`)
  console.log(`  - extraction_count: ${parentBefore.extraction_count}`)
  db.close()

  const result = await handleExtraction(parentPath, childPath, libraryId, getCentralDbPath)
  console.log(`\nExtraction result: ${result.success ? 'success' : 'failed'}`)

  if (result.success) {
    console.log(`✓ Child queue: ${result.childQueue}`)
    console.log(`✓ Parent rank penalty: ${result.parentRankPenalty}`)

    const db2 = new Database(TEST_DB_PATH, { readonly: true })
    const parentAfter = db2
      .prepare('SELECT rank, extraction_count FROM file WHERE library_id = ? AND relative_path = ?')
      .get(libraryId, 'test-document.md')
    console.log(`\nParent after extraction:`)
    console.log(
      `  - rank: ${parentAfter.rank} (increased by ${parentAfter.rank - parentBefore.rank})`
    )
    console.log(`  - extraction_count: ${parentAfter.extraction_count}`)

    const child = db2
      .prepare('SELECT rank FROM file WHERE library_id = ? AND relative_path = ?')
      .get(libraryId, path.relative(TEST_WORKSPACE, childPath))
    console.log(`\nChild note:`)
    console.log(`  - rank: ${child.rank} (inherited from parent)`)

    const childQueue = db2
      .prepare('SELECT queue_name FROM queue_membership WHERE library_id = ? AND relative_path = ?')
      .get(libraryId, path.relative(TEST_WORKSPACE, childPath))
    console.log(`  ✓ Child in queue: ${childQueue.queue_name}`)
    db2.close()
  }
}

// ========================================
// Test 6: Intermediate queue feedback
// ========================================
async function test6_IntermediateFeedback() {
  printSeparator('Test 6: Intermediate Queue Feedback')

  const libraryId = getLibraryId(TEST_DB_PATH)
  const childPath = 'test-document/extract-1.md'

  const feedbacks = ['maintain', 'increase', 'decrease']

  for (const feedback of feedbacks) {
    const db = new Database(TEST_DB_PATH, { readonly: true })
    const before = db
      .prepare('SELECT intermediate_interval FROM file WHERE library_id = ? AND relative_path = ?')
      .get(libraryId, childPath)
    db.close()

    const result = await handleIntermediateFeedback(TEST_DB_PATH, libraryId, childPath, feedback)

    const db2 = new Database(TEST_DB_PATH, { readonly: true })
    const after = db2
      .prepare('SELECT intermediate_interval FROM file WHERE library_id = ? AND relative_path = ?')
      .get(libraryId, childPath)
    db2.close()

    console.log(`\nFeedback: ${feedback}`)
    console.log(`  Interval: ${before.intermediate_interval} → ${after.intermediate_interval} days`)
    console.log(`  Result new interval: ${result.newInterval} days`)
  }
}

// ========================================
// Test 7: Move to different queues
// ========================================
async function test7_MoveToQueues() {
  printSeparator('Test 7: Move to Different Queues')

  const libraryId = getLibraryId(TEST_DB_PATH)
  const childPath = path.join(TEST_WORKSPACE, 'test-document', 'extract-1.md')

  const queues = ['spaced', 'archived', 'intermediate']

  for (const targetQueue of queues) {
    const result = await moveFileToQueue(childPath, libraryId, targetQueue, getCentralDbPath)
    console.log(`\nMove to ${targetQueue}: ${result.success ? 'success' : 'failed'}`)

    if (result.success) {
      const queueResult = await getFileQueue(childPath, libraryId, getCentralDbPath)
      console.log(`  ✓ Current queue: ${queueResult.queueName}`)
    }
  }
}

// ========================================
// Test 8: Queue configuration
// ========================================
async function test8_QueueConfiguration() {
  printSeparator('Test 8: Queue Configuration')

  const libraryId = getLibraryId(TEST_DB_PATH)

  // Get config
  const result1 = await getQueueConfig(libraryId, 'new', 'max_per_day', getCentralDbPath)
  console.log(`\nGet config: ${result1.success ? 'success' : 'failed'}`)
  if (result1.success) {
    console.log(`  Current max_per_day: ${result1.value}`)
  }

  // Set config
  const result2 = await setQueueConfig(libraryId, 'new', 'max_per_day', '15', getCentralDbPath)
  console.log(`\nSet config: ${result2.success ? 'success' : 'failed'}`)

  // Verify
  const result3 = await getQueueConfig(libraryId, 'new', 'max_per_day', getCentralDbPath)
  if (result3.success) {
    console.log(`  ✓ Updated max_per_day: ${result3.value}`)
  }
}

// ========================================
// Test 9: Get daily review items
// ========================================
async function test9_GetDailyReview() {
  printSeparator('Test 9: Get Daily Review Items')

  // Add more test files to different queues
  const libraryId = getLibraryId(TEST_DB_PATH)
  const db = new Database(TEST_DB_PATH)

  // Add files to different queues
  const testFiles = [
    { path: 'new-1.md', queue: 'new' },
    { path: 'new-2.md', queue: 'new' },
    { path: 'processing-1.md', queue: 'processing' },
    { path: 'intermediate-1.md', queue: 'intermediate' },
  ]

  for (const file of testFiles) {
    db.prepare(
      `INSERT INTO file (library_id, relative_path, added_time, due_time)
       VALUES (?, ?, datetime('now', '-' || ? || ' days'), datetime('now', '-1 day'))`
    ).run(libraryId, file.path, Math.floor(Math.random() * 10))

    db.prepare(
      `INSERT INTO queue_membership (library_id, queue_name, relative_path)
       VALUES (?, ?, ?)`
    ).run(libraryId, file.queue, file.path)
  }
  db.close()

  // Get daily review
  const result = await getAllFilesForRevision(getCentralDbPath)
  console.log(`\nGet daily review: ${result.success ? 'success' : 'failed'}`)

  if (result.success) {
    console.log(`✓ Total files for review: ${result.files.length}`)

    const queueCounts = {}
    result.files.forEach((f) => {
      queueCounts[f.queue_name] = (queueCounts[f.queue_name] || 0) + 1
    })

    console.log(`\nFiles by queue:`)
    Object.entries(queueCounts).forEach(([queue, count]) => {
      console.log(`  - ${queue}: ${count}`)
    })
  }
}

// ========================================
// Main test function
// ========================================
async function runAllTests() {
  console.log('\nQueue System Tests')
  console.log('='.repeat(60))

  try {
    await test1_CreateDatabaseWithQueues()
    await test2_AddFileToNewQueue()
    await test3_MoveToProcessingQueue()
    await test4_ProcessingFeedback()
    await test5_Extraction()
    await test6_IntermediateFeedback()
    await test7_MoveToQueues()
    await test8_QueueConfiguration()
    await test9_GetDailyReview()

    console.log('\n' + '='.repeat(60))
    console.log('✓ All tests completed successfully')
    console.log('='.repeat(60) + '\n')
  } catch (error) {
    console.error('\n✗ Test failed:', error.message)
    console.error(error.stack)
  } finally {
    // Cleanup
    try {
      await fs.unlink(CENTRAL_DB_PATH)
    } catch {}
  }
}

// Execute tests
runAllTests()
