// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Tests for dynamic content display in locked lines

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'node:os'
import Database from 'better-sqlite3'
import crypto from 'node:crypto'
import { extractNote, getChildRanges } from '../src/main/ipc/incremental.js'

// Mock getCentralDbPath function
function createMockCentralDbPath(tempDir) {
  const centralDbPath = path.join(tempDir, 'central.sqlite')
  return () => centralDbPath
}

// Initialize central database
async function initializeCentralDb(centralDbPath) {
  await fs.mkdir(path.dirname(centralDbPath), { recursive: true })
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
    )
  `)
  db.close()
}

// Create workspace database
async function createWorkspaceDb(workspaceDir, libraryId, centralDbPath) {
  const increviseDir = path.join(workspaceDir, '.increvise')
  const dbPath = path.join(increviseDir, 'db.sqlite')
  await fs.mkdir(increviseDir, { recursive: true })

  const db = new Database(dbPath)
  db.exec(`
    CREATE TABLE library (
      library_id TEXT PRIMARY KEY,
      library_name TEXT NOT NULL,
      created_time DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE file (
      library_id TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      added_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_revised_time DATETIME,
      review_count INTEGER DEFAULT 0,
      easiness REAL DEFAULT 0.0,
      rank REAL DEFAULT 70.0,
      interval INTEGER DEFAULT 1,
      due_time DATETIME,
      queue TEXT DEFAULT 'new',
      rotation_interval INTEGER DEFAULT 3,
      intermediate_multiplier REAL DEFAULT 1.0,
      intermediate_base INTEGER DEFAULT 7,
      extraction_count INTEGER DEFAULT 0,
      PRIMARY KEY (library_id, relative_path),
      FOREIGN KEY (library_id) REFERENCES library(library_id)
    );

    CREATE TABLE note_source (
      library_id TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      parent_path TEXT,
      extract_type TEXT NOT NULL,
      range_start TEXT,
      range_end TEXT,
      source_hash TEXT,
      PRIMARY KEY (library_id, relative_path),
      FOREIGN KEY (library_id, relative_path) 
        REFERENCES file(library_id, relative_path)
    );

    CREATE INDEX idx_note_source_parent ON note_source(library_id, parent_path);
    CREATE INDEX idx_note_source_hash ON note_source(library_id, source_hash);
  `)

  db.prepare('INSERT INTO library (library_id, library_name) VALUES (?, ?)').run(
    libraryId,
    'test-workspace'
  )
  db.close()

  // Register in central database
  const centralDb = new Database(centralDbPath)
  centralDb
    .prepare(
      `INSERT INTO workspace_history 
       (library_id, folder_path, folder_name, db_path)
       VALUES (?, ?, ?, ?)`
    )
    .run(libraryId, workspaceDir, 'test-workspace', dbPath)
  centralDb.close()

  return dbPath
}

describe('Dynamic Content - getChildRanges with content', () => {
  let tempDir
  let workspaceDir
  let libraryId
  let centralDbPath
  let getCentralDbPath

  before(async () => {
    // Create temporary directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'increvise-test-'))
    workspaceDir = path.join(tempDir, 'workspace')
    await fs.mkdir(workspaceDir, { recursive: true })

    // Setup database
    libraryId = crypto.randomUUID()
    centralDbPath = path.join(tempDir, 'central.sqlite')
    getCentralDbPath = createMockCentralDbPath(tempDir)
    await initializeCentralDb(centralDbPath)
    await createWorkspaceDb(workspaceDir, libraryId, centralDbPath)

    // Create parent file
    const parentPath = path.join(workspaceDir, 'parent.md')
    await fs.writeFile(
      parentPath,
      'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7\nLine 8\nLine 9\nLine 10'
    )

    // Create child note folder and files
    const childFolder = path.join(workspaceDir, 'parent')
    await fs.mkdir(childFolder, { recursive: true })

    await fs.writeFile(path.join(childFolder, 'child1.md'), 'Child 1 line 1\nChild 1 line 2')
    await fs.writeFile(
      path.join(childFolder, 'child2.md'),
      'Child 2 line 1\nChild 2 line 2\nChild 2 line 3'
    )

    await fs.writeFile(
      path.join(childFolder, 'child2-grandchild1.md'),
      'GrandChild 2 line A\nGrandChild 2 line B\nGrandChild 2 line C'
    )

    // Insert extracts into database
    const dbPath = path.join(workspaceDir, '.increvise', 'db.sqlite')
    const db = new Database(dbPath)

    db.prepare(`INSERT INTO file (library_id, relative_path) VALUES (?, ?)`).run(
      libraryId,
      'parent.md'
    )

    db.prepare(`INSERT INTO file (library_id, relative_path) VALUES (?, ?)`).run(
      libraryId,
      'parent/child1.md'
    )

    db.prepare(
      `INSERT INTO note_source (library_id, relative_path, parent_path, extract_type, range_start, range_end, source_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      libraryId,
      'parent/child1.md',
      'parent.md',
      'text-lines',
      '3',
      '4',
      crypto.createHash('sha256').update('Line 3\nLine 4').digest('hex')
    )

    db.prepare(`INSERT INTO file (library_id, relative_path) VALUES (?, ?)`).run(
      libraryId,
      'parent/child2.md'
    )

    db.prepare(
      `INSERT INTO note_source (library_id, relative_path, parent_path, extract_type, range_start, range_end, source_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      libraryId,
      'parent/child2.md',
      'parent.md',
      'text-lines',
      '7',
      '9',
      crypto.createHash('sha256').update('Line 7\nLine 8\nLine 9').digest('hex')
    )

    db.prepare(`INSERT INTO file (library_id, relative_path) VALUES (?, ?)`).run(
      libraryId,
      'parent/child2-grandchild1.md'
    )

    db.prepare(
      `INSERT INTO note_source (library_id, relative_path, parent_path, extract_type, range_start, range_end, source_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      libraryId,
      'parent/child2-grandchild1.md',
      'parent/child2.md',
      'text-lines',
      '2',
      '2',
      crypto
        .createHash('sha256')
        .update('GrandChild 2 line A\nGrandChild 2 line B\nGrandChild 2 line C')
        .digest('hex')
    )

    db.close()
  })

  after(async () => {
    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it('should return only direct children (depth=1) with expanded content', async () => {
    const parentPath = path.join(workspaceDir, 'parent.md')
    const result = await getChildRanges(parentPath, libraryId, getCentralDbPath)

    console.log('Result:', JSON.stringify(result, null, 2))

    // Should only return depth=1 children (not grandchildren)
    assert.strictEqual(result.length, 2)

    // Find child1 and child2
    const child1 = result.find((r) => r.path === 'parent/child1.md')
    const child2 = result.find((r) => r.path === 'parent/child2.md')

    // Check child1 (no nested children)
    assert.ok(child1, 'child1 should exist')
    assert.strictEqual(child1.start, 3)
    assert.strictEqual(child1.end, 4)
    assert.strictEqual(child1.content, 'Child 1 line 1\nChild 1 line 2')
    assert.strictEqual(child1.lineCount, 2)

    // Check child2 (has nested grandchild1 that should be expanded)
    assert.ok(child2, 'child2 should exist')
    assert.strictEqual(child2.start, 7)
    assert.strictEqual(child2.end, 9)

    // child2 content should have grandchild1 expanded at line 2
    // Original child2: "Child 2 line 1\nChild 2 line 2\nChild 2 line 3"
    // After expanding line 2 with grandchild1 content:
    // "Child 2 line 1\nGrandChild 2 line A\nGrandChild 2 line B\nGrandChild 2 line C\nChild 2 line 3"
    const expectedChild2Content =
      'Child 2 line 1\nGrandChild 2 line A\nGrandChild 2 line B\nGrandChild 2 line C\nChild 2 line 3'
    assert.strictEqual(child2.content, expectedChild2Content)
    assert.strictEqual(child2.lineCount, 5) // 1 + 3 (grandchild) + 1
  })

  it('should handle missing child file gracefully', async () => {
    // Insert an extract with non-existent file
    const dbPath = path.join(workspaceDir, '.increvise', 'db.sqlite')
    const db = new Database(dbPath)

    db.prepare(`INSERT INTO file (library_id, relative_path) VALUES (?, ?)`).run(
      libraryId,
      'parent/missing.md'
    )

    db.prepare(
      `INSERT INTO note_source (library_id, relative_path, parent_path, extract_type, range_start, range_end)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(libraryId, 'parent/missing.md', 'parent.md', 'text-lines', '1', '2')

    db.close()

    const parentPath = path.join(workspaceDir, 'parent.md')
    const result = await getChildRanges(parentPath, libraryId, getCentralDbPath)

    const missingChild = result.find((r) => r.path === 'parent/missing.md')
    assert.ok(missingChild)
    assert.strictEqual(missingChild.content, '[Content unavailable]')
  })

  it('should handle multiple children at same depth with reverse range order', async () => {
    // This tests the "from back to front" replacement strategy
    // Both child1 (line 3-4) and child2 (line 7-9) should be processed correctly
    // Processing order should be: child2 first (higher range_start), then child1

    const parentPath = path.join(workspaceDir, 'parent.md')
    const result = await getChildRanges(parentPath, libraryId, getCentralDbPath)

    // Should only have direct children (not including missing.md from previous test)
    const directChildren = result.filter(
      (r) => r.path === 'parent/child1.md' || r.path === 'parent/child2.md'
    )
    assert.strictEqual(directChildren.length, 2)

    // Both children should exist
    const child1 = result.find((r) => r.path === 'parent/child1.md')
    const child2 = result.find((r) => r.path === 'parent/child2.md')

    assert.ok(child1)
    assert.ok(child2)
  })

  it('should expand nested child from child1', async () => {
    // Create a nested extract (child of child1)
    const nestedPath = path.join(workspaceDir, 'parent', 'child1-nested.md')
    await fs.writeFile(nestedPath, 'Nested content line 1\nNested content line 2')

    const dbPath = path.join(workspaceDir, '.increvise', 'db.sqlite')
    const db = new Database(dbPath)

    db.prepare(`INSERT INTO file (library_id, relative_path) VALUES (?, ?)`).run(
      libraryId,
      'parent/child1-nested.md'
    )

    db.prepare(
      `INSERT INTO note_source (library_id, relative_path, parent_path, extract_type, range_start, range_end, source_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      libraryId,
      'parent/child1-nested.md',
      'parent/child1.md',
      'text-lines',
      '1',
      '1',
      crypto
        .createHash('sha256')
        .update('Nested content line 1\nNested content line 2')
        .digest('hex')
    )

    db.close()

    // Get child ranges of parent - should show child1 with nested content expanded
    const parentPath = path.join(workspaceDir, 'parent.md')
    const result = await getChildRanges(parentPath, libraryId, getCentralDbPath)

    const child1 = result.find((r) => r.path === 'parent/child1.md')
    assert.ok(child1)

    // child1 original: "Child 1 line 1\nChild 1 line 2"
    // After expanding line 1 with nested content:
    // "Nested content line 1\nNested content line 2\nChild 1 line 2"
    const expectedContent = 'Nested content line 1\nNested content line 2\nChild 1 line 2'
    assert.strictEqual(child1.content, expectedContent)
    assert.strictEqual(child1.lineCount, 3)
  })

  it('should handle three levels of nesting', async () => {
    // Create great-grandchild (child of grandchild1)
    const greatGrandchildPath = path.join(
      workspaceDir,
      'parent',
      'child2-grandchild1-greatgrandchild.md'
    )
    await fs.writeFile(greatGrandchildPath, 'Great-grandchild line X\nGreat-grandchild line Y')

    const dbPath = path.join(workspaceDir, '.increvise', 'db.sqlite')
    const db = new Database(dbPath)

    db.prepare(`INSERT INTO file (library_id, relative_path) VALUES (?, ?)`).run(
      libraryId,
      'parent/child2-grandchild1-greatgrandchild.md'
    )

    db.prepare(
      `INSERT INTO note_source (library_id, relative_path, parent_path, extract_type, range_start, range_end, source_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      libraryId,
      'parent/child2-grandchild1-greatgrandchild.md',
      'parent/child2-grandchild1.md',
      'text-lines',
      '2',
      '2',
      crypto
        .createHash('sha256')
        .update('Great-grandchild line X\nGreat-grandchild line Y')
        .digest('hex')
    )

    db.close()

    // Get child ranges of parent
    const parentPath = path.join(workspaceDir, 'parent.md')
    const result = await getChildRanges(parentPath, libraryId, getCentralDbPath)

    const child2 = result.find((r) => r.path === 'parent/child2.md')
    assert.ok(child2)

    // Expected expansion:
    // 1. great-grandchild expands into grandchild1 line 2
    //    grandchild1: "GrandChild 2 line A\nGreat-grandchild line X\nGreat-grandchild line Y\nGrandChild 2 line C"
    // 2. grandchild1 (now 4 lines) expands into child2 line 2
    //    child2: "Child 2 line 1\nGrandChild 2 line A\nGreat-grandchild line X\nGreat-grandchild line Y\nGrandChild 2 line C\nChild 2 line 3"
    const expectedContent =
      'Child 2 line 1\nGrandChild 2 line A\nGreat-grandchild line X\nGreat-grandchild line Y\nGrandChild 2 line C\nChild 2 line 3'
    assert.strictEqual(child2.content, expectedContent)
    assert.strictEqual(child2.lineCount, 6)
  })
})
