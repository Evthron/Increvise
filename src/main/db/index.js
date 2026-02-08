// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'os'
import Database from 'better-sqlite3'
import electron from 'electron'
import { migrate as migrateCentral } from './migration-central.js'
import { migrate as migrateWorkspace } from './migration-workspace.js'
const { app } = electron

// Return XDG_DATA_HOME or default ~/.local/share
export function getXdgDataHome() {
  return process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')
}

// Choose appropriate app data directory based on platform, e.g. database should be stored under %APPDATA%\Increvise
export function getAppDataHome() {
  // try catch used just in case app.getPath fails for some reason
  try {
    if (process.platform === 'linux') {
      return getXdgDataHome()
    } else {
      // if not linux then use app.getPath('appData') to return correct path
      // Windows: %APPDATA%, macOS: ~/Library/Application Support
      return app.getPath('appData')
    }
  } catch {
    return getXdgDataHome()
  }
}

// Return the Increvise data directory path
export function getIncreviseDataDir() {
  if (process.env.INCREVISE_DATA_DIR) return process.env.INCREVISE_DATA_DIR
  const base = getAppDataHome()
  return path.join(base, 'Increvise')
}

// based on the getIncreviseDataDir(), return the central db path
export function getCentralDbPath() {
  return path.join(getIncreviseDataDir(), 'central.sqlite')
}

export async function initializeCentralDatabase() {
  const increviseDataDir = getIncreviseDataDir()
  const centralDbPath = getCentralDbPath()

  await fs.mkdir(increviseDataDir, { recursive: true })

  console.log('Central database path:', centralDbPath)
  try {
    const db = new Database(centralDbPath)

    // Use migration system to create/update schema
    await migrateCentral(db, centralDbPath)

    db.close()
    console.log('Central database initialized successfully')

    // Migrate all known workspaces
    await migrateAllWorkspaces()

    return true
  } catch (err) {
    console.error('Error creating central database:', err)
    throw err
  }
}

/**
 * Migrate all workspace databases registered in central DB
 */
export async function migrateAllWorkspaces() {
  const centralDbPath = getCentralDbPath()

  try {
    const db = new Database(centralDbPath, { readonly: true })
    const workspaces = db
      .prepare('SELECT library_id, db_path, folder_path FROM workspace_history')
      .all()
    db.close()

    if (workspaces.length === 0) {
      console.log('No workspaces to migrate')
      return
    }

    console.log(`Found ${workspaces.length} workspace(s) to check for migrations`)

    for (const workspace of workspaces) {
      const { library_id, db_path, folder_path } = workspace
      const workspaceName = path.basename(folder_path)

      // Check if database file exists
      try {
        await fs.access(db_path)
      } catch {
        console.log(`[${workspaceName}] Database file not found at ${db_path}, skipping migration`)
        continue
      }

      // Open and migrate workspace database
      try {
        console.log(`[${workspaceName}] Checking migrations...`)
        const workspaceDb = new Database(db_path)
        await migrateWorkspace(workspaceDb, db_path)
        workspaceDb.close()
      } catch (err) {
        console.error(`[${workspaceName}] Failed to migrate workspace ${library_id}:`, err.message)
        // Continue with other workspaces even if one fails
      }
    }

    console.log('Workspace migration check complete')
  } catch (err) {
    console.error('Error during workspace migration:', err)
    // Don't throw - this shouldn't prevent app from starting
  }
}

// Get workspace database path by library UUID
export async function getWorkspaceDbPath(libraryId, getCentralDbPath) {
  try {
    const centralDbPath = getCentralDbPath()
    const db = new Database(centralDbPath, { readonly: true })

    const result = db
      .prepare('SELECT db_path, folder_path FROM workspace_history WHERE library_id = ?')
      .get(libraryId)

    db.close()

    if (result) {
      // Verify database file still exists
      try {
        await fs.access(result.db_path)
        return {
          found: true,
          dbPath: result.db_path,
          folderPath: result.folder_path,
        }
      } catch {
        return { found: false, error: 'Database file not found at registered path' }
      }
    }

    return { found: false, error: 'Library ID not found in central database' }
  } catch (err) {
    return { found: false, error: err.message }
  }
}
