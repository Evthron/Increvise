// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import crypto from 'node:crypto'
import {
  extractLines,
  findContentByHashAndLineCount,
  validateAndRecoverNoteRange,
} from '../src/main/ipc/incremental.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const TEST_WORKSPACE = path.join(__dirname, 'test-validation-workspace')
const DB_PATH = path.join(TEST_WORKSPACE, '.increvise', 'db.sqlite')

// Mock getCentralDbPath for testing
function createMockGetCentralDbPath() {
  // Return a function that getWorkspaceDbPath expects
  return () => {
    // Create a mock central database that returns our test workspace info
    const mockCentralDbPath = path.join(TEST_WORKSPACE, '.increvise', 'central-mock.sqlite')
    const mockDb = new Database(mockCentralDbPath)

    mockDb.exec(`
      CREATE TABLE IF NOT EXISTS workspace_history (
        library_id TEXT PRIMARY KEY,
        folder_path TEXT NOT NULL,
        db_path TEXT NOT NULL
      );
      
      INSERT OR REPLACE INTO workspace_history (library_id, folder_path, db_path)
      VALUES ('test-lib', '${TEST_WORKSPACE}', '${DB_PATH}');
    `)
    mockDb.close()

    return mockCentralDbPath
  }
}

describe('Validation and Recovery Functions', () => {
  before(async () => {
    // Create test workspace
    await fs.mkdir(TEST_WORKSPACE, { recursive: true })
    await fs.mkdir(path.join(TEST_WORKSPACE, '.increvise'), { recursive: true })

    // Create test database
    const db = new Database(DB_PATH)
    db.exec(`
      CREATE TABLE IF NOT EXISTS library (
        library_id TEXT PRIMARY KEY,
        library_name TEXT NOT NULL,
        created_time DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS file (
        library_id TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        added_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_revised_time DATETIME,
        review_count INTEGER DEFAULT 0,
        easiness REAL DEFAULT 0.0,
        rank REAL DEFAULT 70.0,
        due_time DATETIME,
        PRIMARY KEY (library_id, relative_path),
        FOREIGN KEY (library_id) REFERENCES library(library_id)
      );

      CREATE TABLE IF NOT EXISTS note_source (
        library_id TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        parent_path TEXT,
        extract_type TEXT NOT NULL,
        range_start TEXT,
        range_end TEXT,
        source_hash TEXT,
        PRIMARY KEY (library_id, relative_path),
        FOREIGN KEY (library_id, relative_path) REFERENCES file(library_id, relative_path)
      );

      INSERT INTO library (library_id, library_name) 
      VALUES ('test-lib', 'Test Library');
    `)
    db.close()

    // Create test parent note
    const parentContent = `Line 1
Line 2
Line 3
Line 4
Line 5
Line 6
Line 7
Line 8
Line 9
Line 10`

    await fs.writeFile(path.join(TEST_WORKSPACE, 'parent.md'), parentContent)
  })

  after(async () => {
    // Clean up
    await fs.rm(TEST_WORKSPACE, { recursive: true, force: true })
  })

  describe('extractLines', () => {
    it('should extract lines correctly', () => {
      const content = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5'
      const result = extractLines(content, 2, 4)
      assert.strictEqual(result, 'Line 2\nLine 3\nLine 4')
    })

    it('should handle single line', () => {
      const content = 'Line 1\nLine 2\nLine 3'
      const result = extractLines(content, 2, 2)
      assert.strictEqual(result, 'Line 2')
    })
  })

  describe('findContentByHashAndLineCount', () => {
    it('should find content by hash', () => {
      const content = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5'
      const target = 'Line 2\nLine 3'
      const lineCount = 2
      const hash = crypto.createHash('sha256').update(target).digest('hex')

      const result = findContentByHashAndLineCount(content, hash, lineCount)
      assert.ok(result)
      assert.strictEqual(result.start, 2)
      assert.strictEqual(result.end, 3)
    })

    it('should return null if not found', () => {
      const content = 'Line 1\nLine 2\nLine 3'
      const hash = crypto.createHash('sha256').update('Not exist').digest('hex')
      const lineCount = 1
      const result = findContentByHashAndLineCount(content, hash, lineCount)
      assert.strictEqual(result, null)
    })

    it('should find single line', () => {
      const content = 'Line 1\nLine 2\nLine 3'
      const target = 'Line 2'
      const lineCount = 1
      const hash = crypto.createHash('sha256').update(target).digest('hex')

      const result = findContentByHashAndLineCount(content, hash, lineCount)
      assert.ok(result)
      assert.strictEqual(result.start, 2)
      assert.strictEqual(result.end, 2)
    })
  })

  describe('validateAndRecoverNoteRange', () => {
    it('should validate children with valid positions (no recovery needed)', async () => {
      // Setup parent content
      const parentContent = `Line 1
Line 2
Line 3
Line 4
Line 5
Line 6
Line 7
Line 8
Line 9
Line 10`
      const parentPath = path.join(TEST_WORKSPACE, 'parent.md')
      await fs.writeFile(parentPath, parentContent)

      // Setup child note with valid position
      const childContent = 'Line 3\nLine 4\nLine 5'
      const childPath = path.join(TEST_WORKSPACE, 'tutorial', '3-5-child.md')
      await fs.mkdir(path.join(TEST_WORKSPACE, 'tutorial'), { recursive: true })
      await fs.writeFile(childPath, childContent)

      const db = new Database(DB_PATH)
      db.prepare('INSERT INTO file (library_id, relative_path) VALUES (?, ?)').run(
        'test-lib',
        'tutorial/3-5-child.md'
      )

      const hash = crypto.createHash('sha256').update(childContent).digest('hex')
      db.prepare(
        `
        INSERT INTO note_source (library_id, relative_path, parent_path, extract_type, range_start, range_end, source_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
      ).run('test-lib', 'tutorial/3-5-child.md', 'parent.md', 'text-lines', '3', '5', hash)
      db.close()

      // Test - pass parent path, not child path
      await validateAndRecoverNoteRange(parentPath, 'test-lib', createMockGetCentralDbPath())

      // Verify database was NOT updated (hash matches, no recovery needed)
      const db2 = new Database(DB_PATH)
      const unchanged = db2
        .prepare('SELECT range_start, range_end FROM note_source WHERE relative_path = ?')
        .get('tutorial/3-5-child.md')
      db2.close()

      assert.strictEqual(unchanged.range_start, '3')
      assert.strictEqual(unchanged.range_end, '5')
    })

    it('should recover moved content for children', async () => {
      // Setup - parent content changed with new lines inserted at top
      const newParentContent = `New Line 1
New Line 2
New Line 3
Line 3
Line 4
Line 5
Line 6
Line 7
Line 8
Line 9`
      const parentPath = path.join(TEST_WORKSPACE, 'parent.md')
      await fs.writeFile(parentPath, newParentContent)

      const childContent = 'Line 3\nLine 4\nLine 5'
      const childPath = path.join(TEST_WORKSPACE, 'tutorial', '3-5-moved.md')
      await fs.writeFile(childPath, childContent)

      const db = new Database(DB_PATH)
      db.prepare('INSERT INTO file (library_id, relative_path) VALUES (?, ?)').run(
        'test-lib',
        'tutorial/3-5-moved.md'
      )

      const hash = crypto.createHash('sha256').update(childContent).digest('hex')
      db.prepare(
        `
        INSERT INTO note_source (library_id, relative_path, parent_path, extract_type, range_start, range_end, source_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
      ).run('test-lib', 'tutorial/3-5-moved.md', 'parent.md', 'text-lines', '3', '5', hash)
      db.close()

      // Test - validate parent's children
      await validateAndRecoverNoteRange(parentPath, 'test-lib', createMockGetCentralDbPath())

      // Verify database was updated with new position
      const db2 = new Database(DB_PATH)
      const updated = db2
        .prepare('SELECT range_start, range_end FROM note_source WHERE relative_path = ?')
        .get('tutorial/3-5-moved.md')
      db2.close()

      // Content moved from lines 3-5 to lines 4-6 (after 3 new lines were inserted)
      assert.strictEqual(updated.range_start, '4')
      assert.strictEqual(updated.range_end, '6')
    })

    it('should not update database when content cannot be recovered', async () => {
      // Setup - parent content completely changed
      const changedParentContent = `Completely different content
This is new
Nothing matches
The old content is gone`
      const parentPath = path.join(TEST_WORKSPACE, 'parent.md')
      await fs.writeFile(parentPath, changedParentContent)

      const childContent = 'Line 3\nLine 4\nLine 5'
      const childPath = path.join(TEST_WORKSPACE, 'tutorial', '3-5-lost.md')
      await fs.writeFile(childPath, childContent)

      const db = new Database(DB_PATH)
      db.prepare('INSERT INTO file (library_id, relative_path) VALUES (?, ?)').run(
        'test-lib',
        'tutorial/3-5-lost.md'
      )

      const hash = crypto.createHash('sha256').update(childContent).digest('hex')
      db.prepare(
        `
        INSERT INTO note_source (library_id, relative_path, parent_path, extract_type, range_start, range_end, source_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
      ).run('test-lib', 'tutorial/3-5-lost.md', 'parent.md', 'text-lines', '3', '5', hash)
      db.close()

      // Test - validate parent's children (content cannot be found)
      await validateAndRecoverNoteRange(parentPath, 'test-lib', createMockGetCentralDbPath())

      // Verify database was NOT updated (keeps old values since recovery failed)
      const db2 = new Database(DB_PATH)
      const unchanged = db2
        .prepare('SELECT range_start, range_end FROM note_source WHERE relative_path = ?')
        .get('tutorial/3-5-lost.md')
      db2.close()

      assert.strictEqual(unchanged.range_start, '3')
      assert.strictEqual(unchanged.range_end, '5')
    })

    it('should validate multiple children of the same parent', async () => {
      // Setup parent content
      const parentContent = `Line 1
Line 2
Line 3
Line 4
Line 5
Line 6
Line 7
Line 8
Line 9
Line 10`
      const parentPath = path.join(TEST_WORKSPACE, 'parent-multi.md')
      await fs.writeFile(parentPath, parentContent)

      // Setup first child
      const child1Content = 'Line 2\nLine 3'
      const child1Path = path.join(TEST_WORKSPACE, 'tutorial', '2-3-child1.md')
      await fs.writeFile(child1Path, child1Content)

      // Setup second child
      const child2Content = 'Line 7\nLine 8\nLine 9'
      const child2Path = path.join(TEST_WORKSPACE, 'tutorial', '7-9-child2.md')
      await fs.writeFile(child2Path, child2Content)

      const db = new Database(DB_PATH)
      db.prepare('INSERT INTO file (library_id, relative_path) VALUES (?, ?)').run(
        'test-lib',
        'tutorial/2-3-child1.md'
      )
      db.prepare('INSERT INTO file (library_id, relative_path) VALUES (?, ?)').run(
        'test-lib',
        'tutorial/7-9-child2.md'
      )

      const hash1 = crypto.createHash('sha256').update(child1Content).digest('hex')
      const hash2 = crypto.createHash('sha256').update(child2Content).digest('hex')

      db.prepare(
        `
        INSERT INTO note_source (library_id, relative_path, parent_path, extract_type, range_start, range_end, source_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
      ).run('test-lib', 'tutorial/2-3-child1.md', 'parent-multi.md', 'text-lines', '2', '3', hash1)

      db.prepare(
        `
        INSERT INTO note_source (library_id, relative_path, parent_path, extract_type, range_start, range_end, source_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
      ).run('test-lib', 'tutorial/7-9-child2.md', 'parent-multi.md', 'text-lines', '7', '9', hash2)
      db.close()

      // Test - validate all children of parent
      await validateAndRecoverNoteRange(parentPath, 'test-lib', createMockGetCentralDbPath())

      // Verify both children remain unchanged (valid positions)
      const db2 = new Database(DB_PATH)
      const child1 = db2
        .prepare('SELECT range_start, range_end FROM note_source WHERE relative_path = ?')
        .get('tutorial/2-3-child1.md')
      const child2 = db2
        .prepare('SELECT range_start, range_end FROM note_source WHERE relative_path = ?')
        .get('tutorial/7-9-child2.md')
      db2.close()

      assert.strictEqual(child1.range_start, '2')
      assert.strictEqual(child1.range_end, '3')
      assert.strictEqual(child2.range_start, '7')
      assert.strictEqual(child2.range_end, '9')
    })
  })
})
