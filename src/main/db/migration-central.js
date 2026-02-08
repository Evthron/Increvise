// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// SQL files are in /out/main/main/db/migration-central/
// In production build, __dirname is /out/main/
// In dev build, __dirname is /out/main/main/db/
const MIGRATIONS_DIR = fs.existsSync(path.join(__dirname, 'migration-central'))
  ? path.join(__dirname, 'migration-central')
  : path.join(__dirname, 'main/db/migration-central')

/**
 * Migrate central database to latest or target version
 * @param {Database} db - better-sqlite3 database instance
 * @param {string} dbPath - Database file path (for backups)
 * @param {number} targetVersion - Optional target version (default: latest)
 */
export async function migrate(db, dbPath, targetVersion = null) {
  // Scan migration directory and return sorted list of migrations
  const files = fs.readdirSync(MIGRATIONS_DIR)

  const migrations = files
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => {
      const match = f.match(/^(\d+)/)
      if (!match) return null
      const version = parseInt(match[1])
      return {
        filename: f,
        path: path.join(MIGRATIONS_DIR, f),
        version,
      }
    })
    .filter(Boolean)

  // Get current database version from PRAGMA user_version
  const currentVersion = db.prepare('PRAGMA user_version').get().user_version
  const maxVersion = Math.max(...migrations.map((m) => m.version))
  const target = targetVersion ?? maxVersion

  console.log(`[central] Current version: ${currentVersion}, Target: ${target}`)

  if (currentVersion === target) {
    console.log('[central] Database is up to date')
    return
  }

  if (currentVersion > target) {
    throw new Error(
      `[central] Cannot downgrade database from version ${currentVersion} to ${target}. ` +
        `Rollback is not supported.`
    )
  }

  // Get pending migrations
  const pendingMigrations = migrations.filter(
    (m) => m.version > currentVersion && m.version <= target
  )

  if (pendingMigrations.length === 0) {
    console.log('[central] No pending migrations')
    return
  }

  console.log(`[central] Applying ${pendingMigrations.length} migration(s)...`)

  // Create backup before applying migrations
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
    const backupPath = `${dbPath}.backup-v${currentVersion}-${timestamp}`
    fs.copyFileSync(dbPath, backupPath)
    console.log(`[central] Backup created: ${backupPath}`)
  } catch (err) {
    console.error('[central] Failed to create backup:', err.message)
    throw new Error('Backup failed - aborting migration for safety')
  }

  try {
    for (const migration of pendingMigrations) {
      console.log(`[central] Running migration ${migration.version}`)

      db.transaction(() => {
        const sql = fs.readFileSync(migration.path, 'utf-8')
        db.exec(sql)
        db.pragma(`user_version = ${migration.version}`)
      })()

      console.log(`[central] ✓ Migrated to version ${migration.version}`)
    }

    console.log(`[central] Migration complete: v${currentVersion} → v${target}`)
  } catch (err) {
    console.error('[central] Migration failed:', err)
    throw err
  }
}
