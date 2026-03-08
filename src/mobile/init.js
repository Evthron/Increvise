// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Mobile Platform Initialization
 *
 * Initializes the mobile platform:
 * 1. Opens/creates Central database
 * 2. Creates schema if needed (first-time setup)
 * 3. Sets up window.fileManager polyfill for backward compatibility
 */

import * as db from '../adapters/sqlite-adapter.js'
import { mobilePlatform } from './platform.js'
import centralSchema from '../main/db/migration-central/0001-initial.sql?raw'
import mobileSyncSchema from '../main/db/migration-central/0002-mobile-workspace-sync.sql?raw'

const CENTRAL_DB = 'central'
const CENTRAL_DB_VERSION = 2

/**
 * Initialize mobile platform (called once at app startup)
 */
export async function initMobilePlatform() {
  try {
    console.log('[Mobile] Starting platform initialization...')

    // 1. Open Central database
    console.log('[Mobile] Opening Central database...')
    console.log('[Mobile] Central database opened successfully')

    // 2. Create schema if first time (mobile doesn't run migrations)
    console.log('[Mobile] Checking database version...')
    const version = await db.pragma(CENTRAL_DB, 'user_version')
    console.log('[Mobile] Current database version:', version)

    if (version === 0) {
      // Debug: Check if centralSchema is a string
      console.log('[Mobile] Schema type:', typeof centralSchema)
      console.log('[Mobile] Schema length:', centralSchema?.length)
      console.log('[Mobile] Schema preview:', centralSchema?.substring?.(0, 100))

      // Execute base schema
      console.log('[Mobile] Executing schema creation...')
      await db.execute(CENTRAL_DB, centralSchema)
      await db.execute(CENTRAL_DB, mobileSyncSchema)
      console.log('[Mobile] Schema created successfully')

      console.log('[Mobile] Setting database version...')
      await db.setPragma(CENTRAL_DB, 'user_version', CENTRAL_DB_VERSION)
      console.log('[Mobile] Database version set to', CENTRAL_DB_VERSION)
    }

    if (version > 0) {
      await db.execute(CENTRAL_DB, mobileSyncSchema)
    }

    // 3. Setup window.fileManager polyfill for backward compatibility
    console.log('[Mobile] Setting up window.fileManager...')
    if (typeof window !== 'undefined') {
      window.fileManager = mobilePlatform
    }

    console.log('[Mobile] Platform initialization completed successfully')
    return { success: true }
  } catch (error) {
    console.error('[Mobile] Failed to initialize mobile platform:', error)
    console.error('[Mobile] Error stack:', error.stack)
    return { success: false, error: error.message }
  }
}

/**
 * Get available workspaces for mobile UI
 */
export async function getMobileWorkspaces() {
  try {
    const workspaces = await mobilePlatform.getRecentWorkspaces(50)
    return { success: true, workspaces }
  } catch (error) {
    console.error('[Mobile] Failed to get workspaces:', error)
    return { success: false, error: error.message, workspaces: [] }
  }
}

/**
 * Import a workspace from external storage (mobile-specific)
 */
export async function importMobileWorkspace(workspaceDbName) {
  try {
    return await mobilePlatform.importWorkspace(workspaceDbName)
  } catch (error) {
    console.error('[Mobile] Failed to import workspace:', error)
    return { success: false, error: error.message }
  }
}
