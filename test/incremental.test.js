// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Incremental Reading Test Script

import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import crypto from 'node:crypto'
import {
  readFile,
  writeFile,
  extractNote,
  parseNoteFileName,
  generateChildNoteName,
  findTopLevelNoteFolder,
  findParentPath,
  getNoteExtractInfo,
} from '../src/main/ipc/incremental.js'
import { createDatabase } from '../src/main/ipc/spaced.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEST_WORKSPACE = path.join(__dirname, 'test-incremental-workspace')
const TEST_DB_PATH = path.join(TEST_WORKSPACE, '.increvise', 'db.sqlite')
const CENTRAL_DB_PATH = path.join(__dirname, 'test-incremental-central.sqlite')

// Mock getCentralDbPath function
const getCentralDbPath = () => CENTRAL_DB_PATH

// Store library ID for tests
let LIBRARY_ID = null

function printSeparator(title) {
  console.log(`\n${title}`)
}

// Helper: Create test file with N lines
async function createTestFile(filePath, numLines = 25) {
  const lines = Array.from(
    { length: numLines },
    (_, i) => `Line ${i + 1}: This is test content for line number ${i + 1}.`
  )
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, lines.join('\n'), 'utf-8')
}

// ========================================
// Test 0: Setup
// ========================================
async function test0_Setup() {
  printSeparator('Test 0: Setup')

  // Clean up old test workspace and central DB
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

  console.log('  ✓ Created test workspace directory')
  console.log('  ✓ Created central database')

  // Create workspace database
  const result = await createDatabase(TEST_WORKSPACE, getCentralDbPath)

  if (result.success) {
    const db = new Database(result.path, { readonly: true })
    const library = db.prepare('SELECT * FROM library').get()
    db.close()

    LIBRARY_ID = library.library_id
    console.log(`  ✓ Workspace database created with library_id: ${LIBRARY_ID}`)
  } else {
    throw new Error('Failed to create workspace database: ' + result.error)
  }
}

// ========================================
// Test 1: parseNoteFileName - Valid formats
// ========================================
async function test1_ParseNoteFileName_Valid() {
  printSeparator('Test 1: parseNoteFileName - Valid formats')

  // Test single layer
  const result1 = parseNoteFileName('10-20-intro')
  console.log(`  ✓ Single layer: "10-20-intro" → ${result1.length} layer`)
  if (result1[0].rangeStart !== 10 || result1[0].rangeEnd !== 20 || result1[0].name !== 'intro') {
    throw new Error('Single layer parsing failed')
  }

  // Test two layers
  const result2 = parseNoteFileName('10-20-intro.15-18-core')
  console.log(`  ✓ Two layers: "10-20-intro.15-18-core" → ${result2.length} layers`)
  if (result2.length !== 2 || result2[1].name !== 'core') {
    throw new Error('Two layer parsing failed')
  }

  // Test three layers
  const result3 = parseNoteFileName('10-20-intro.15-18-core.16-17-detail')
  console.log(`  ✓ Three layers: "10-20-intro.15-18-core.16-17-detail" → ${result3.length} layers`)
  if (result3.length !== 3 || result3[2].name !== 'detail') {
    throw new Error('Three layer parsing failed')
  }
}

// ========================================
// Test 2: parseNoteFileName - Invalid formats
// ========================================
async function test2_ParseNoteFileName_Invalid() {
  printSeparator('Test 2: parseNoteFileName - Invalid formats')

  // Test invalid format (no range)
  const result1 = parseNoteFileName('invalid-format')
  console.log(`  ✓ "invalid-format" → ${result1 === null ? 'null' : 'unexpected'}`)
  if (result1 !== null) {
    throw new Error('Should return null for invalid format')
  }

  // Test missing end range
  const result2 = parseNoteFileName('10-intro')
  console.log(`  ✓ "10-intro" → ${result2 === null ? 'null' : 'unexpected'}`)
  if (result2 !== null) {
    throw new Error('Should return null for missing end range')
  }

  // Test empty string
  const result3 = parseNoteFileName('')
  console.log(`  ✓ "" → ${result3 === null ? 'null' : 'unexpected'}`)
  if (result3 !== null) {
    throw new Error('Should return null for empty string')
  }
}

// ========================================
// Test 3: readFile - Existing file
// ========================================
async function test3_ReadFile_Existing() {
  printSeparator('Test 3: readFile - Existing file')

  // Create test file
  const testFilePath = path.join(TEST_WORKSPACE, 'test-read.txt')
  const testContent = 'Hello, this is test content!'
  await fs.writeFile(testFilePath, testContent, 'utf-8')

  // Read file
  const result = await readFile(testFilePath)

  if (result.success) {
    console.log(`  ✓ Read ${result.content.length} bytes from test file`)
    if (result.content === testContent) {
      console.log('  ✓ Content matches expected')
    } else {
      throw new Error('Content mismatch')
    }
  } else {
    throw new Error('Failed to read file: ' + result.error)
  }
}

// ========================================
// Test 4: readFile - Non-existent file
// ========================================
async function test4_ReadFile_NonExistent() {
  printSeparator('Test 4: readFile - Non-existent file')

  const nonExistentPath = path.join(TEST_WORKSPACE, 'does-not-exist.txt')
  const result = await readFile(nonExistentPath)

  if (!result.success) {
    console.log(`  ✓ Returns error: "${result.error.substring(0, 40)}..."`)
  } else {
    throw new Error('Should have failed reading non-existent file')
  }
}

// ========================================
// Test 5: writeFile - New file
// ========================================
async function test5_WriteFile_New() {
  printSeparator('Test 5: writeFile - New file')

  const testFilePath = path.join(TEST_WORKSPACE, 'test-write-new.txt')
  const testContent = 'This is new content'

  // Write file
  const result = await writeFile(testFilePath, testContent)

  if (result.success) {
    console.log('  ✓ File created successfully')

    // Verify content
    const readContent = await fs.readFile(testFilePath, 'utf-8')
    if (readContent === testContent) {
      console.log('  ✓ Content verified')
    } else {
      throw new Error('Content verification failed')
    }
  } else {
    throw new Error('Failed to write file: ' + result.error)
  }
}

// ========================================
// Test 6: writeFile - Overwrite
// ========================================
async function test6_WriteFile_Overwrite() {
  printSeparator('Test 6: writeFile - Overwrite')

  const testFilePath = path.join(TEST_WORKSPACE, 'test-overwrite.txt')
  const originalContent = 'Original content'
  const newContent = 'Updated content'

  // Create original file
  await fs.writeFile(testFilePath, originalContent, 'utf-8')

  // Overwrite file
  const result = await writeFile(testFilePath, newContent)

  if (result.success) {
    console.log('  ✓ File overwritten successfully')

    // Verify new content
    const readContent = await fs.readFile(testFilePath, 'utf-8')
    if (readContent === newContent) {
      console.log('  ✓ New content verified')
    } else {
      throw new Error('Content verification failed')
    }
  } else {
    throw new Error('Failed to overwrite file: ' + result.error)
  }
}

// ========================================
// Test 7: generateChildNoteName - From top-level file
// ========================================
async function test7_GenerateChildNoteName_TopLevel() {
  printSeparator('Test 7: generateChildNoteName - From top-level file')

  const parentFilePath = path.join(TEST_WORKSPACE, 'my-research-paper.md')
  const rangeStart = 10
  const rangeEnd = 20
  const text = 'Introduction to quantum mechanics'

  const result = generateChildNoteName(parentFilePath, rangeStart, rangeEnd, text)

  console.log(`  Parent: "my-research-paper.md"`)
  console.log(`  Range: ${rangeStart}-${rangeEnd}, Text: "${text}"`)
  console.log(`  ✓ Generated: "${result}"`)

  if (result !== '10-20-my-research-paper') {
    throw new Error(`Expected "10-20-my-research-paper", got "${result}"`)
  }
}

// ========================================
// Test 8: generateChildNoteName - From 1-layer note
// ========================================
async function test8_GenerateChildNoteName_OneLayer() {
  printSeparator('Test 8: generateChildNoteName - From 1-layer note')

  const parentFilePath = path.join(TEST_WORKSPACE, 'notes', '10-20-introduction.md')
  const rangeStart = 15
  const rangeEnd = 18
  const text = 'Core concepts of the theory'

  const result = generateChildNoteName(parentFilePath, rangeStart, rangeEnd, text)

  console.log(`  Parent: "10-20-introduction.md"`)
  console.log(`  Range: ${rangeStart}-${rangeEnd}, Text: "${text}"`)
  console.log(`  ✓ Generated: "${result}"`)
  console.log('  ✓ Flat structure: keeps all parent layers')

  if (result !== '10-20-introduction.15-18-core-concepts-of') {
    throw new Error(`Expected "10-20-introduction.15-18-core-concepts-of", got "${result}"`)
  }
}

// ========================================
// Test 9: generateChildNoteName - From 3-layer note
// ========================================
async function test9_GenerateChildNoteName_ThreeLayers() {
  printSeparator('Test 9: generateChildNoteName - From 3-layer note')

  const parentFilePath = path.join(
    TEST_WORKSPACE,
    'notes',
    '10-20-intro.15-20-core.16-18-detail.md'
  )
  const rangeStart = 17
  const rangeEnd = 17
  const text = 'Important note here'

  const result = generateChildNoteName(parentFilePath, rangeStart, rangeEnd, text)

  console.log(`  Parent: "10-20-intro.15-20-core.16-18-detail.md"`)
  console.log(`  Range: ${rangeStart}-${rangeEnd}, Text: "${text}"`)
  console.log(`  ✓ Generated: "${result}"`)
  console.log('  ✓ Flat structure: keeps all 3 parent layers')

  if (result !== '10-20-intro.15-20-core.16-18-detail.17-17-important-note-here') {
    throw new Error(
      `Expected "10-20-intro.15-20-core.16-18-detail.17-17-important-note-here", got "${result}"`
    )
  }
}

// ========================================
// Test 10: findParentPath - Find parent from database
// ========================================
async function test10_FindParentPath() {
  printSeparator('Test 10: findParentPath')

  // Insert test data into database
  const db = new Database(TEST_DB_PATH)

  // First insert parent file
  db.prepare(
    `
    INSERT INTO file (library_id, relative_path, added_time, review_count, easiness, rank, due_time)
    VALUES (?, ?, datetime('now'), 0, 0.0, 70.0, datetime('now'))
  `
  ).run(LIBRARY_ID, 'research-paper.md')

  // Insert child file
  db.prepare(
    `
    INSERT INTO file (library_id, relative_path, added_time, review_count, easiness, rank, due_time)
    VALUES (?, ?, datetime('now'), 0, 0.0, 70.0, datetime('now'))
  `
  ).run(LIBRARY_ID, 'research-paper/10-20-research-paper.md')

  // Insert standalone file
  db.prepare(
    `
    INSERT INTO file (library_id, relative_path, added_time, review_count, easiness, rank, due_time)
    VALUES (?, ?, datetime('now'), 0, 0.0, 70.0, datetime('now'))
  `
  ).run(LIBRARY_ID, 'standalone-note.md')

  // Create note_source entries
  db.prepare(
    `
    INSERT INTO note_source (library_id, relative_path, parent_path, extract_type, range_start, range_end, source_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    LIBRARY_ID,
    'research-paper/10-20-research-paper.md',
    'research-paper.md',
    'text-lines',
    '10',
    '20',
    'dummy-hash-1'
  )

  db.prepare(
    `
    INSERT INTO note_source (library_id, relative_path, parent_path, extract_type, range_start, range_end, source_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    LIBRARY_ID,
    'standalone-note.md',
    null, // No parent
    'text-lines',
    '1',
    '10',
    'dummy-hash-2'
  )

  // Test finding parent
  const noteFilePath = path.join(TEST_WORKSPACE, 'research-paper/10-20-research-paper.md')
  const parentPath = await findParentPath(noteFilePath, db, LIBRARY_ID, TEST_WORKSPACE)

  console.log(`  ✓ Found parent: "${parentPath}"`)
  if (parentPath !== 'research-paper.md') {
    throw new Error(`Expected "research-paper.md", got "${parentPath}"`)
  }

  // Test note with no parent
  const standaloneNotePath = path.join(TEST_WORKSPACE, 'standalone-note.md')
  const noParent = await findParentPath(standaloneNotePath, db, LIBRARY_ID, TEST_WORKSPACE)

  console.log(`  ✓ No parent returns: ${noParent === null ? 'null' : noParent}`)
  if (noParent !== null) {
    throw new Error('Expected null for note with no parent')
  }

  db.close()
}

// ========================================
// Test 11: extractNote - Extract from top-level file (full workflow)
// ========================================
async function test11_ExtractNote_TopLevel() {
  printSeparator('Test 11: extractNote - Extract from top-level file')

  // Create parent file with 25 lines
  const parentFilePath = path.join(TEST_WORKSPACE, 'research-paper.md')
  await createTestFile(parentFilePath, 25)

  // Extract lines 10-15
  const selectedText = `Line 10: This is test content for line number 10.
Line 11: This is test content for line number 11.
Line 12: This is test content for line number 12.
Line 13: This is test content for line number 13.
Line 14: This is test content for line number 14.
Line 15: This is test content for line number 15.`

  console.log('  Parent: "research-paper.md" (lines 10-15)')

  const result = await extractNote(
    parentFilePath,
    selectedText,
    10,
    15,
    LIBRARY_ID,
    getCentralDbPath
  )

  if (!result.success) {
    throw new Error('Extract failed: ' + result.error)
  }

  console.log(`  ✓ Child created: "${result.fileName}"`)

  // Verify file exists and contains extracted text
  const childContent = await fs.readFile(result.filePath, 'utf-8')
  if (childContent !== selectedText) {
    throw new Error('Child file content mismatch')
  }
  console.log('  ✓ File contains extracted text')

  // Verify database file entry
  const db = new Database(TEST_DB_PATH)
  const fileEntry = db
    .prepare('SELECT * FROM file WHERE library_id = ? AND relative_path = ?')
    .get(LIBRARY_ID, path.relative(TEST_WORKSPACE, result.filePath))

  if (!fileEntry) {
    throw new Error('File entry not found in database')
  }
  console.log('  ✓ Database file entry created')
  console.log(`    - review_count: ${fileEntry.review_count}`)
  console.log(`    - easiness: ${fileEntry.easiness}`)
  console.log(`    - rank: ${fileEntry.rank}`)

  // Verify database note_source entry
  const noteSourceEntry = db
    .prepare('SELECT * FROM note_source WHERE library_id = ? AND relative_path = ?')
    .get(LIBRARY_ID, path.relative(TEST_WORKSPACE, result.filePath))

  if (!noteSourceEntry) {
    throw new Error('note_source entry not found in database')
  }
  console.log('  ✓ Database note_source entry created')
  console.log(`    - parent_path: "${noteSourceEntry.parent_path}"`)
  console.log(`    - extract_type: ${noteSourceEntry.extract_type}`)
  console.log(`    - range: ${noteSourceEntry.range_start}-${noteSourceEntry.range_end}`)

  // Verify source hash
  const expectedHash = crypto.createHash('sha256').update(selectedText).digest('hex')
  if (noteSourceEntry.source_hash !== expectedHash) {
    throw new Error('Source hash mismatch')
  }
  console.log('  ✓ Source hash matches')

  db.close()
}

// ========================================
// Test 12: extractNote - Extract from hierarchical note (flat structure)
// ========================================
async function test12_ExtractNote_Hierarchical() {
  printSeparator('Test 12: extractNote - From hierarchical note (flat structure)')

  // Create parent note (child of research-paper.md)
  const parentNotePath = path.join(TEST_WORKSPACE, 'research-paper', '10-15-research-paper.md')
  await createTestFile(parentNotePath, 15)

  // Extract lines 5-8
  const selectedText = `Line 5: This is test content for line number 5.
Line 6: This is test content for line number 6.
Line 7: This is test content for line number 7.
Line 8: This is test content for line number 8.`

  console.log('  Parent: "research-paper/10-15-research-paper.md" (lines 5-8)')

  const result = await extractNote(parentNotePath, selectedText, 5, 8, LIBRARY_ID, getCentralDbPath)

  if (!result.success) {
    throw new Error('Extract failed: ' + result.error)
  }

  console.log(`  ✓ Grandchild created: "${result.fileName}"`)

  // Verify hierarchical naming (flat structure keeps all layers)
  const expectedFileName = '10-15-research-paper.5-8-line-5-this.md'
  if (result.fileName !== expectedFileName) {
    throw new Error(`Expected "${expectedFileName}", got "${result.fileName}"`)
  }
  console.log('  ✓ Follows flat structure naming (keeps all parent layers)')

  // Verify file is in same folder as parent (flat structure)
  const expectedFolder = path.join(TEST_WORKSPACE, 'research-paper')
  const actualFolder = path.dirname(result.filePath)
  if (actualFolder !== expectedFolder) {
    throw new Error(`Expected folder "${expectedFolder}", got "${actualFolder}"`)
  }
  console.log('  ✓ File is in same folder as parent (flat structure)')

  // Verify database tracking
  const db = new Database(TEST_DB_PATH)
  const noteSourceEntry = db
    .prepare('SELECT * FROM note_source WHERE library_id = ? AND relative_path = ?')
    .get(LIBRARY_ID, path.relative(TEST_WORKSPACE, result.filePath))

  if (!noteSourceEntry) {
    throw new Error('note_source entry not found')
  }

  const expectedParentPath = 'research-paper/10-15-research-paper.md'
  if (noteSourceEntry.parent_path !== expectedParentPath) {
    throw new Error(`Expected parent "${expectedParentPath}", got "${noteSourceEntry.parent_path}"`)
  }
  console.log('  ✓ Database tracking correct')

  db.close()
}

// ========================================
// Test 13: extractNote - Duplicate filename rejection
// ========================================
async function test13_ExtractNote_Duplicate() {
  printSeparator('Test 13: extractNote - Duplicate rejection')

  const parentFilePath = path.join(TEST_WORKSPACE, 'test-duplicate.md')
  await createTestFile(parentFilePath, 25)

  const selectedText = 'Some test content'

  // First extraction should succeed
  const result1 = await extractNote(
    parentFilePath,
    selectedText,
    10,
    15,
    LIBRARY_ID,
    getCentralDbPath
  )

  if (!result1.success) {
    throw new Error('First extraction failed: ' + result1.error)
  }
  console.log('  ✓ First extraction succeeded')

  // Second extraction with same range should fail
  const result2 = await extractNote(
    parentFilePath,
    selectedText,
    10,
    15,
    LIBRARY_ID,
    getCentralDbPath
  )

  if (result2.success) {
    throw new Error('Second extraction should have failed')
  }

  console.log(`  ✓ Duplicate extraction rejected`)
  console.log(`    Error: "${result2.error}"`)

  if (!result2.error.includes('already exists')) {
    throw new Error('Expected "already exists" error message')
  }
}

// ========================================
// Test 14: extractNote - Multi-level flat structure
// ========================================
async function test14_ExtractNote_MultiLevel_Flat() {
  printSeparator('Test 14: extractNote - Multi-level flat structure')

  // Create a top-level file
  const topLevelPath = path.join(TEST_WORKSPACE, 'article.md')
  await createTestFile(topLevelPath, 30)

  // First extraction (level 1)
  const text1 = `Line 10: This is test content for line number 10.
Line 11: This is test content for line number 11.
Line 12: This is test content for line number 12.`

  console.log('  Step 1: Extract from top-level "article.md" (lines 10-12)')
  const result1 = await extractNote(topLevelPath, text1, 10, 12, LIBRARY_ID, getCentralDbPath)

  if (!result1.success) {
    throw new Error('First extraction failed: ' + result1.error)
  }
  console.log(`  ✓ Level 1 created: "${result1.fileName}"`)

  // Verify level 1 is in article/ folder
  const expectedFolder1 = path.join(TEST_WORKSPACE, 'article')
  const actualFolder1 = path.dirname(result1.filePath)
  if (actualFolder1 !== expectedFolder1) {
    throw new Error(`Expected folder "${expectedFolder1}", got "${actualFolder1}"`)
  }
  console.log('  ✓ Level 1 in "article/" folder')

  // Second extraction (level 2 from level 1)
  const text2 = `Line 10: This is test content for line number 10.
Line 11: This is test content for line number 11.`

  console.log(`  Step 2: Extract from level 1 "${result1.fileName}" (lines 10-11)`)
  const result2 = await extractNote(result1.filePath, text2, 10, 11, LIBRARY_ID, getCentralDbPath)

  if (!result2.success) {
    throw new Error('Second extraction failed: ' + result2.error)
  }
  console.log(`  ✓ Level 2 created: "${result2.fileName}"`)

  // Verify level 2 is ALSO in article/ folder (flat structure)
  const actualFolder2 = path.dirname(result2.filePath)
  if (actualFolder2 !== expectedFolder1) {
    throw new Error(`Expected flat structure in "${expectedFolder1}", but got "${actualFolder2}"`)
  }
  console.log('  ✓ Level 2 ALSO in "article/" folder (flat structure works!)')

  // Third extraction (level 3 from level 2)
  const text3 = `Line 10: This is test content for line number 10.`

  console.log(`  Step 3: Extract from level 2 "${result2.fileName}" (line 10)`)
  const result3 = await extractNote(result2.filePath, text3, 10, 10, LIBRARY_ID, getCentralDbPath)

  if (!result3.success) {
    throw new Error('Third extraction failed: ' + result3.error)
  }
  console.log(`  ✓ Level 3 created: "${result3.fileName}"`)

  // Verify level 3 is ALSO in article/ folder (flat structure)
  const actualFolder3 = path.dirname(result3.filePath)
  if (actualFolder3 !== expectedFolder1) {
    throw new Error(`Expected flat structure in "${expectedFolder1}", but got "${actualFolder3}"`)
  }
  console.log('  ✓ Level 3 ALSO in "article/" folder (flat structure works!)')

  // Verify all files are in the same flat folder
  console.log('  ✓ All 3 levels in same flat folder structure')
}

// ========================================
// Test 15: findTopLevelNoteFolder - Recursively find top-level folder
// ========================================
async function test15_FindTopLevelNoteFolder() {
  printSeparator('Test 15: findTopLevelNoteFolder - Find top-level folder')

  const db = new Database(TEST_DB_PATH)

  // Test 1: Top-level file (no parent in database)
  const topLevelPath = path.join(TEST_WORKSPACE, 'standalone.md')
  const folder1 = findTopLevelNoteFolder(topLevelPath, db, LIBRARY_ID, TEST_WORKSPACE)
  const expected1 = path.join(TEST_WORKSPACE, 'standalone')

  console.log(`  Test 1: Top-level file "standalone.md"`)
  console.log(`    ✓ Found folder: "${path.relative(TEST_WORKSPACE, folder1)}"`)
  if (folder1 !== expected1) {
    throw new Error(`Expected "${expected1}", got "${folder1}"`)
  }

  // Test 2: First-level child note (parent exists in DB)
  // Use existing data from test11
  const level1Path = path.join(TEST_WORKSPACE, 'research-paper', '10-15-research-paper.md')
  const folder2 = findTopLevelNoteFolder(level1Path, db, LIBRARY_ID, TEST_WORKSPACE)
  const expected2 = path.join(TEST_WORKSPACE, 'research-paper')

  console.log(`  Test 2: First-level child "research-paper/10-15-research-paper.md"`)
  console.log(`    ✓ Traced back to: "${path.relative(TEST_WORKSPACE, folder2)}"`)
  if (folder2 !== expected2) {
    throw new Error(`Expected "${expected2}", got "${folder2}"`)
  }

  // Test 3: Second-level child note (grandchild)
  // Use existing data from test12
  const level2Path = path.join(
    TEST_WORKSPACE,
    'research-paper',
    '10-15-research-paper.5-8-line-5-this.md'
  )
  const folder3 = findTopLevelNoteFolder(level2Path, db, LIBRARY_ID, TEST_WORKSPACE)

  console.log(
    `  Test 3: Second-level child "research-paper/10-15-research-paper.5-8-line-5-this.md"`
  )
  console.log(`    ✓ Traced back to: "${path.relative(TEST_WORKSPACE, folder3)}"`)
  if (folder3 !== expected2) {
    throw new Error(`Expected "${expected2}", got "${folder3}"`)
  }

  console.log('  ✓ Recursively traces back to top-level folder correctly')

  db.close()
}

// ========================================
// Test 16: getNoteExtractInfo - Query PDF extract info from database
// ========================================
async function test16_GetNoteExtractInfo() {
  printSeparator('Test 16: getNoteExtractInfo - Query PDF extract info')

  const db = new Database(TEST_DB_PATH)

  // Insert a PDF extract entry into database
  const pdfExtractPath = 'papers/machine-learning/1-5-pages.md'
  const sourcePdfPath = 'papers/machine-learning.pdf'

  // First insert the file entry
  db.prepare(
    `
    INSERT INTO file (library_id, relative_path, added_time, review_count, easiness, rank, due_time)
    VALUES (?, ?, datetime('now'), 0, 0.0, 70.0, datetime('now'))
  `
  ).run(LIBRARY_ID, pdfExtractPath)

  // Insert note_source entry with extract_type = 'pdf-page'
  db.prepare(
    `
    INSERT INTO note_source (library_id, relative_path, parent_path, extract_type, range_start, range_end, source_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `
  ).run(LIBRARY_ID, pdfExtractPath, sourcePdfPath, 'pdf-page', '1', '5', 'dummy-pdf-hash')

  db.close()

  // Test 1: Query PDF extract info (should find it)
  const absolutePath = path.join(TEST_WORKSPACE, pdfExtractPath)
  const result = await getNoteExtractInfo(absolutePath, LIBRARY_ID, getCentralDbPath)

  console.log(`  Test 1: Query PDF extract "${pdfExtractPath}"`)
  if (!result.success) {
    throw new Error('Query failed: ' + result.error)
  }
  console.log('  ✓ Query succeeded')

  if (!result.found) {
    throw new Error('Expected to find extract info')
  }
  console.log('  ✓ Extract info found')

  if (result.extractType !== 'pdf-page') {
    throw new Error(`Expected extract_type='pdf-page', got '${result.extractType}'`)
  }
  console.log(`  ✓ Extract type: ${result.extractType}`)

  const expectedAbsoluteParentPath = path.join(TEST_WORKSPACE, sourcePdfPath)
  if (result.parentPath !== expectedAbsoluteParentPath) {
    throw new Error(
      `Expected parent_path='${expectedAbsoluteParentPath}', got '${result.parentPath}'`
    )
  }
  console.log(`  ✓ Parent path: ${path.relative(TEST_WORKSPACE, result.parentPath)}`)

  if (result.rangeStart !== 1 || result.rangeEnd !== 5) {
    throw new Error(`Expected range 1-5, got ${result.rangeStart}-${result.rangeEnd}`)
  }
  console.log(`  ✓ Range: ${result.rangeStart}-${result.rangeEnd}`)

  // Test 2: Query non-existent file (should not find it)
  const nonExistentPath = path.join(TEST_WORKSPACE, 'non-existent.md')
  const result2 = await getNoteExtractInfo(nonExistentPath, LIBRARY_ID, getCentralDbPath)

  console.log(`  Test 2: Query non-existent file`)
  if (!result2.success) {
    throw new Error('Query should succeed even for non-existent files')
  }
  console.log('  ✓ Query succeeded')

  if (result2.found) {
    throw new Error('Should not find info for non-existent file')
  }
  console.log('  ✓ Correctly returns found=false')

  // Test 3: Query text extract (should find but not be pdf-page type)
  const db2 = new Database(TEST_DB_PATH)
  const textExtractPath = 'notes/text-extract.md'

  db2
    .prepare(
      `
    INSERT INTO file (library_id, relative_path, added_time, review_count, easiness, rank, due_time)
    VALUES (?, ?, datetime('now'), 0, 0.0, 70.0, datetime('now'))
  `
    )
    .run(LIBRARY_ID, textExtractPath)

  db2
    .prepare(
      `
    INSERT INTO note_source (library_id, relative_path, parent_path, extract_type, range_start, range_end, source_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `
    )
    .run(LIBRARY_ID, textExtractPath, 'notes/source.md', 'text-lines', '10', '20', 'dummy-hash')

  db2.close()

  const textExtractAbsPath = path.join(TEST_WORKSPACE, textExtractPath)
  const result3 = await getNoteExtractInfo(textExtractAbsPath, LIBRARY_ID, getCentralDbPath)

  console.log(`  Test 3: Query text extract (not PDF)`)
  if (!result3.success || !result3.found) {
    throw new Error('Should find text extract')
  }
  console.log('  ✓ Found text extract')

  if (result3.extractType !== 'text-lines') {
    throw new Error(`Expected extract_type='text-lines', got '${result3.extractType}'`)
  }
  console.log(`  ✓ Correctly identifies as text-lines extract`)
}

// ========================================
// Main test function
// ========================================
async function runAllTests() {
  console.log('\nIncremental Reading Tests')
  console.log('='.repeat(50))

  try {
    await test0_Setup()
    await test1_ParseNoteFileName_Valid()
    await test2_ParseNoteFileName_Invalid()
    await test3_ReadFile_Existing()
    await test4_ReadFile_NonExistent()
    await test5_WriteFile_New()
    await test6_WriteFile_Overwrite()
    await test7_GenerateChildNoteName_TopLevel()
    await test8_GenerateChildNoteName_OneLayer()
    await test9_GenerateChildNoteName_ThreeLayers()
    await test10_FindParentPath()
    await test11_ExtractNote_TopLevel()
    await test12_ExtractNote_Hierarchical()
    await test13_ExtractNote_Duplicate()
    await test14_ExtractNote_MultiLevel_Flat()
    await test15_FindTopLevelNoteFolder()
    await test16_GetNoteExtractInfo()

    console.log('\n✓ All tests completed successfully\n')
  } catch (error) {
    console.error('\n✗ Test failed:', error.message)
    console.error(error.stack)
  } finally {
    // Cleanup
    try {
      await fs.rm(TEST_WORKSPACE, { recursive: true, force: true })
      await fs.rm(CENTRAL_DB_PATH, { force: true })
    } catch {}
  }
}

// Execute tests
runAllTests()
