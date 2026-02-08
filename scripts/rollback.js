#!/usr/bin/env node
// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import readline from 'node:readline'
import Database from 'better-sqlite3'

// Get app data directory based on platform
function getAppDataHome() {
  if (process.platform === 'win32') {
    // Windows: %APPDATA% (e.g., C:\Users\Username\AppData\Roaming)
    return process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
  } else if (process.platform === 'darwin') {
    // macOS: ~/Library/Application Support
    return path.join(os.homedir(), 'Library', 'Application Support')
  } else {
    // Linux: XDG_DATA_HOME or ~/.local/share
    return process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')
  }
}

// Get central database path (matches src/main/db/index.js logic)
function getCentralDbPath() {
  const increviseDataDir =
    process.env.INCREVISE_DATA_DIR || path.join(getAppDataHome(), 'Increvise')
  return path.join(increviseDataDir, 'central.sqlite')
}

// Find all backups for a given database
function findBackups(dbPath) {
  if (!fs.existsSync(dbPath)) {
    return []
  }

  const dir = path.dirname(dbPath)
  const base = path.basename(dbPath)

  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.startsWith(base + '.backup-'))
      .map((f) => {
        const fullPath = path.join(dir, f)
        const stat = fs.statSync(fullPath)
        const match = f.match(/backup-v(\d+)-(.+)$/)
        return {
          filename: f,
          fullPath,
          version: match ? parseInt(match[1]) : 0,
          timestamp: match ? match[2] : '',
          size: stat.size,
          mtime: stat.mtime,
        }
      })
      .sort((a, b) => b.mtime - a.mtime) // newest first
  } catch (err) {
    console.error(`Error reading backups for ${dbPath}:`, err.message)
    return []
  }
}

// Collect all databases with backups
function collectDatabases() {
  const databases = []

  // 1. Central database
  const centralPath = getCentralDbPath()
  if (fs.existsSync(centralPath)) {
    const centralBackups = findBackups(centralPath)
    if (centralBackups.length > 0) {
      databases.push({
        type: 'central',
        name: 'central',
        path: centralPath,
        backups: centralBackups,
      })
    }

    // 2. Workspace databases
    try {
      const db = new Database(centralPath, { readonly: true })
      try {
        const workspaces = db
          .prepare('SELECT library_id, db_path, folder_path FROM workspace_history')
          .all()

        for (const ws of workspaces) {
          const backups = findBackups(ws.db_path)
          if (backups.length > 0) {
            const folderName = path.basename(ws.folder_path)
            databases.push({
              type: 'workspace',
              name: folderName,
              path: ws.db_path,
              backups: backups,
            })
          }
        }
      } finally {
        db.close()
      }
    } catch (err) {
      console.error('Error reading workspace list:', err.message)
    }
  }

  return databases
}

// Display databases with backups
function displayDatabases(databases) {
  console.log('\nDatabases with backups:\n')

  databases.forEach((db, index) => {
    const latest = db.backups[0]
    const timeAgo = getTimeAgo(latest.mtime)

    console.log(`${index + 1}. ${db.type}: ${db.name}`)
    console.log(`   Path: ${db.path}`)
    console.log(`   Latest backup: v${latest.version} (${timeAgo})`)
    console.log(`   Total backups: ${db.backups.length}`)
    console.log()
  })
}

// Calculate time difference
function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000)
  if (seconds < 60) return `${seconds} seconds ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minutes ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hours ago`
  const days = Math.floor(hours / 24)
  return `${days} days ago`
}

// Perform rollback
function performRollback(database) {
  const latest = database.backups[0]
  console.log(`\nRolling back ${database.name}...`)
  console.log(`  From: ${database.path}`)
  console.log(`  To version: ${latest.version}`)

  try {
    fs.copyFileSync(latest.fullPath, database.path)
    console.log(`✓ Rollback successful`)
    return true
  } catch (err) {
    console.error(`✗ Rollback failed: ${err.message}`)
    return false
  }
}

// Main program
async function main() {
  const databases = collectDatabases()

  if (databases.length === 0) {
    console.log('No databases with backups found.')
    console.log('\nNote: Backups are created automatically when migrations run.')
    return
  }

  displayDatabases(databases)

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  rl.question(
    `Select database to rollback (1-${databases.length}, 0 to cancel, 'all' for all): `,
    (answer) => {
      answer = answer.trim().toLowerCase()

      if (answer === '0') {
        console.log('Cancelled')
        rl.close()
        return
      }

      if (answer === 'all') {
        console.log(`\nRolling back all ${databases.length} databases...`)
        let successCount = 0
        databases.forEach((db) => {
          if (performRollback(db)) successCount++
        })
        console.log(`\n${successCount}/${databases.length} databases rolled back successfully`)
        console.log(
          '\nNote: Restart the app to re-apply migrations if you modified the migration files.'
        )
        rl.close()
        return
      }

      const choice = parseInt(answer)
      if (isNaN(choice) || choice < 1 || choice > databases.length) {
        console.log('Invalid choice')
        rl.close()
        return
      }

      performRollback(databases[choice - 1])
      console.log(
        '\nNote: Restart the app to re-apply migrations if you modified the migration files.'
      )
      rl.close()
    }
  )
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
