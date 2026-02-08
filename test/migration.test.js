// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Test migration system

import Database from 'better-sqlite3'
import { migrate as migrateCentral } from '../src/main/db/migration-central.js'
import { migrate as migrateWorkspace } from '../src/main/db/migration-workspace.js'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// Helper to get version
function getVersion(db) {
  return db.prepare('PRAGMA user_version').get().user_version
}

// Create temporary test directory
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'increvise-migration-test-'))
const centralDbPath = path.join(testDir, 'central.sqlite')
const workspaceDbPath = path.join(testDir, 'workspace.sqlite')

console.log('=== Testing Migration System ===')
console.log(`Test directory: ${testDir}\n`)

try {
  // Test Central DB
  console.log('1. Testing Central DB Migration...')
  const centralDb = new Database(centralDbPath)
  console.log(`   Current version: ${getVersion(centralDb)}`)

  await migrateCentral(centralDb, centralDbPath)
  console.log(`   After migration: ${getVersion(centralDb)}`)

  const tables = centralDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
  console.log(`   Tables created: ${tables.map((t) => t.name).join(', ')}`)

  centralDb.close()
  console.log('   ✓ Central DB migration successful\n')

  // Test Workspace DB
  console.log('2. Testing Workspace DB Migration...')
  const workspaceDb = new Database(workspaceDbPath)
  console.log(`   Current version: ${getVersion(workspaceDb)}`)

  await migrateWorkspace(workspaceDb, workspaceDbPath)
  console.log(`   After migration: ${getVersion(workspaceDb)}`)

  const workspaceTables = workspaceDb
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
  console.log(`   Tables created: ${workspaceTables.map((t) => t.name).join(', ')}`)

  workspaceDb.close()
  console.log('   ✓ Workspace DB migration successful\n')

  // Test idempotency
  console.log('3. Testing Migration Idempotency...')
  const idempotentDb = new Database(centralDbPath)
  console.log(`   Current version: ${getVersion(idempotentDb)}`)

  await migrateCentral(idempotentDb, centralDbPath)
  console.log(`   After re-migration: ${getVersion(idempotentDb)}`)

  idempotentDb.close()
  console.log('   ✓ Idempotency test successful (no errors)\n')

  console.log('=== All Tests Passed! ===')
} catch (err) {
  console.error('\n=== Test Failed ===')
  console.error(err)
  process.exit(1)
} finally {
  // Cleanup
  console.log(`\nCleaning up test directory: ${testDir}`)
  fs.rmSync(testDir, { recursive: true, force: true })
}
