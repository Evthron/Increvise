// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Mobile Platform Initialization
 *
 * Initializes the mobile platform:
 * 1. Opens/creates Central database
 * 2. Runs migrations to ensure schema is up to date
 * 3. Sets up window.fileManager polyfill for backward compatibility
 */

import * as db from '../adapters/sqlite-adapter.js'
import { mobilePlatform } from './platform.js'
import { migrateMobileCentral } from '../main/db/migration-central-mobile.js'

const CENTRAL_DB = 'central'

/**
 * Initialize mobile platform (called once at app startup)
 */
export async function initMobilePlatform() {
  try {
    console.log('[Mobile] Initializing...')

    // 1. Run migrations to ensure Central DB is up to date
    await migrateMobileCentral(db, CENTRAL_DB)

    // 2. Setup window.fileManager polyfill for backward compatibility
    if (typeof window !== 'undefined') {
      window.fileManager = mobilePlatform
    }

    console.log('[Mobile] Ready')
    return { success: true }
  } catch (error) {
    console.error('[Mobile] Initialization failed:', error)
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
