// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

import * as db from '../adapters/sqlite-adapter.js'
import { WORKSPACE_QUERIES } from '../shared/queries/workspace.js'

const CENTRAL_DB = 'central'
const REQUIRED_WORKSPACE_VERSION = 2 // Minimum workspace DB version required

/**
 * Record a workspace in the Central DB
 * @param {string} libraryId - Workspace ID
 * @param {string} folderPath - Workspace path (internal to the app)
 * @param {string} folderName - Workspace name
 * @param {string} dbName - Workspace database name
 */
export async function recordWorkspace(libraryId, folderPath, folderName, dbName) {
  try {
    const result = await db.run(CENTRAL_DB, WORKSPACE_QUERIES.RECORD, [
      libraryId,
      folderPath,
      folderName,
      dbName, // On mobile, this stores the database name instead of the path
    ])

    return {
      success: true,
      id: result.lastInsertRowid,
      libraryId,
    }
  } catch (error) {
    console.error('[Workspace] Failed to record workspace:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Get the list of recent workspaces
 * @param {number} limit - Limit on the number of results
 */
export async function getRecentWorkspaces(limit = 10) {
  try {
    const rows = await db.getAll(CENTRAL_DB, WORKSPACE_QUERIES.GET_RECENT, [limit])
    return rows || []
  } catch (error) {
    console.error('[Workspace] Failed to get recent workspaces:', error)
    return []
  }
}

/**
 * Update workspace statistics
 * @param {string} folderPath - Workspace path
 * @param {number} totalFiles - Total number of files
 * @param {number} filesDueToday - Number of files due today
 */
export async function updateWorkspaceStats(folderPath, totalFiles, filesDueToday) {
  try {
    const result = await db.run(CENTRAL_DB, WORKSPACE_QUERIES.UPDATE_STATS, [
      totalFiles,
      filesDueToday,
      folderPath,
    ])

    return { success: true, changes: result.changes }
  } catch (error) {
    console.error('[Workspace] Failed to update workspace stats:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Remove a workspace record (does not delete actual files)
 * @param {string} folderPath - Workspace path
 */
export async function removeWorkspace(folderPath) {
  try {
    const result = await db.run(CENTRAL_DB, WORKSPACE_QUERIES.REMOVE, [folderPath])

    return { success: true, changes: result.changes }
  } catch (error) {
    console.error('[Workspace] Failed to remove workspace:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Import a workspace (copy from an external folder to the app's internal storage)
 * This is a mobile-specific feature
 * @param {string} workspaceDbName - Name of the workspace database to import
 */
export async function importWorkspace(workspaceDbName) {
  try {
    // 1. Open the workspace database (connection will be managed by plugin)

    // 2. Check database version (mobile doesn't run migrations, only validates)
    const version = await db.pragma(workspaceDbName, 'user_version')

    if (version < REQUIRED_WORKSPACE_VERSION) {
      return {
        success: false,
        error: `Database version too old (v${version}, required v${REQUIRED_WORKSPACE_VERSION}). Please update on desktop and re-import.`,
      }
    }

    console.log(`[Workspace] Database version validated (v${version})`)

    // 3. Read library information
    const library = await db.getOne(workspaceDbName, WORKSPACE_QUERIES.GET_LIBRARY_INFO)

    if (!library) {
      return {
        success: false,
        error: 'Workspace database has no library record',
      }
    }

    // 4. Register this workspace in the Central DB
    const result = await recordWorkspace(
      library.library_id,
      workspaceDbName, // On mobile, we use the database name as the path
      library.library_name,
      workspaceDbName
    )

    if (result.success) {
      console.log('[Workspace] Imported workspace:', library.library_name)
      return {
        success: true,
        libraryId: library.library_id,
        libraryName: library.library_name,
        dbName: workspaceDbName,
      }
    } else {
      return result
    }
  } catch (error) {
    console.error('[Workspace] Failed to import workspace:', error)
    return { success: false, error: error.message }
  }
}
