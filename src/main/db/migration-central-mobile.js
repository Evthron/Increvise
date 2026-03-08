// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Mobile Central Database Migration System
 * Loads SQL files dynamically using Vite's import.meta.glob
 */

// Load all SQL migration files as raw strings
const migrationModules = import.meta.glob('./migration-central-mobile/*.sql', {
  query: '?raw',
  eager: true,
  import: 'default',
})

/**
 * Get sorted list of migrations
 * @returns {Array<{version: number, filename: string, sql: string}>}
 */
function getMigrations() {
  const migrations = []

  for (const [path, sql] of Object.entries(migrationModules)) {
    const filename = path.split('/').pop()
    const match = filename.match(/^(\d+)/)
    if (!match) continue

    const version = parseInt(match[1])
    migrations.push({ version, filename, sql })
  }

  return migrations.sort((a, b) => a.version - b.version)
}

/**
 * Migrate mobile central database to latest or target version
 * @param {Object} db - SQLite adapter (from src/adapters/sqlite-adapter.js)
 * @param {string} dbName - Database name (e.g., 'central')
 * @param {number} targetVersion - Optional target version (default: latest)
 */
export async function migrateMobileCentral(db, dbName, targetVersion = null) {
  const migrations = getMigrations()

  if (migrations.length === 0) {
    throw new Error('[central-mobile] No migration files found')
  }

  // Get current database version
  const currentVersion = await db.pragma(dbName, 'user_version')
  const maxVersion = Math.max(...migrations.map((m) => m.version))
  const target = targetVersion ?? maxVersion

  console.log(`[central-mobile] v${currentVersion} → v${target}`)

  if (currentVersion === target) {
    return
  }

  if (currentVersion > target) {
    throw new Error(`[central-mobile] Cannot downgrade from v${currentVersion} to v${target}`)
  }

  // Get pending migrations
  const pendingMigrations = migrations.filter(
    (m) => m.version > currentVersion && m.version <= target
  )

  if (pendingMigrations.length === 0) {
    return
  }

  console.log(`[central-mobile] Applying ${pendingMigrations.length} migration(s)...`)

  try {
    for (const migration of pendingMigrations) {
      console.log(`[central-mobile] v${migration.version}: ${migration.filename}`)

      // Execute migration SQL
      await db.execute(dbName, migration.sql)

      // Update version
      await db.setPragma(dbName, 'user_version', migration.version)
    }

    console.log(`[central-mobile] Migration complete`)
  } catch (err) {
    console.error('[central-mobile] Migration failed:', err)
    throw err
  }
}
