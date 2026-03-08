// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Mobile Workspace Sync Module
 * Handles workspace import/export with external folder mirroring
 */

import { CapgoFilePicker } from '@capgo/capacitor-file-picker'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import * as db from '../adapters/sqlite-adapter.js'
import { writeFile, readBinaryFile } from '../adapters/filesystem-adapter.js'

const CENTRAL_DB = 'central'

/**
 * Convert Base64 string to UTF-8 text
 * Uses Fetch API with data URI to avoid deprecated atob()
 * @param {string} base64 - Base64 encoded string
 * @returns {Promise<string>} - Decoded UTF-8 text
 */
async function base64ToText(base64) {
  // Use Fetch API with data URI (modern, standards-compliant approach)
  const dataUrl = `data:text/plain;base64,${base64}`
  const response = await fetch(dataUrl)
  return await response.text()
}

/**
 * Generate a unique workspace ID
 */
function generateWorkspaceId() {
  return `ws_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Select a workspace folder and import the database
 * @returns {Promise<{success: boolean, workspaceId?: string, workspaceName?: string, error?: string}>}
 */
export async function selectAndImportWorkspace() {
  try {
    console.log('[WorkspaceSync] Starting workspace selection...')

    // Step 1: Let user pick a directory
    const result = await CapgoFilePicker.pickDirectory({
      multiple: false,
    })

    if (!result || !result.path) {
      return { success: false, error: 'No directory selected' }
    }

    const folderUri = result.path
    console.log('[WorkspaceSync] Selected folder:', folderUri)

    // Check platform once at the beginning
    const platform = (await import('@capacitor/core')).Capacitor.getPlatform()

    // Step 1.5: Take persistable permission on Android to maintain access across restarts
    if (platform === 'android') {
      const { FileWriter } = await import('../adapters/file-writer-plugin.js')
      try {
        await FileWriter.takePersistablePermission({ uri: folderUri })
        console.log('[WorkspaceSync] Persistable permission taken for:', folderUri)
      } catch (error) {
        console.warn('[WorkspaceSync] Failed to take persistable permission:', error)
        // Continue anyway - permission might already be granted
      }
    }

    // Step 2: Try to read .increvise/db.sqlite from the selected folder
    const dbRelativePath = '.increvise/db.sqlite'
    console.log('[WorkspaceSync] Looking for database at:', `${folderUri}/${dbRelativePath}`)

    let dbData
    try {
      if (platform === 'android') {
        // Use native plugin for Android to read SAF tree URI
        const { FileWriter } = await import('../adapters/file-writer-plugin.js')
        const result = await FileWriter.readFromTreeUri({
          treeUri: folderUri,
          relativePath: dbRelativePath,
        })
        if (!result.success) {
          throw new Error('Failed to read database file')
        }
        dbData = result.data
      } else {
        // iOS can read directly
        const readResult = await Filesystem.readFile({
          path: `${folderUri}/${dbRelativePath}`,
        })
        dbData = readResult.data
      }

      console.log('[WorkspaceSync] Database read successfully, size:', dbData.length)
    } catch (error) {
      console.error('[WorkspaceSync] Failed to read database:', error)
      return {
        success: false,
        error:
          'Could not find .increvise/db.sqlite in selected folder. Please select a valid workspace folder.',
      }
    }

    // Step 3: Generate workspace ID and copy database to internal storage
    const workspaceId = generateWorkspaceId()
    const internalDbPath = `workspaces/${workspaceId}/db.sqlite`

    if (platform === 'android') {
      const { FileWriter } = await import('../adapters/file-writer-plugin.js')
      const result = await FileWriter.writeToAppDatabase({
        dbName: workspaceId,
        data: dbData,
      })
      console.log('[WorkspaceSync] Database copied to app database:', result?.path)
    } else {
      await writeFile(internalDbPath, dbData, Directory.Data)
      console.log('[WorkspaceSync] Database copied to internal storage:', internalDbPath)
    }

    // Step 4: Open the database and read library info
    const library = await db.getOne(workspaceId, 'SELECT * FROM library LIMIT 1')

    if (!library) {
      await db.closeDatabase(workspaceId)
      return { success: false, error: 'Invalid workspace database: no library record found' }
    }

    console.log('[WorkspaceSync] Library info:', library)

    // Step 5: Record in central database
    await db.run(
      CENTRAL_DB,
      `INSERT OR REPLACE INTO workspace_history (library_id, folder_path, folder_name, db_path)
       VALUES (?, ?, ?, ?)`,
      [library.library_id, workspaceId, library.library_name, workspaceId]
    )

    // Step 6: Record external URI in mobile_workspace_sync table
    await db.run(
      CENTRAL_DB,
      `INSERT OR REPLACE INTO mobile_workspace_sync (workspace_id, external_uri, last_synced, sync_enabled)
       VALUES (?, ?, ?, 1)`,
      [workspaceId, folderUri, Date.now()]
    )

    console.log('[WorkspaceSync] Workspace imported successfully')

    return {
      success: true,
      workspaceId,
      workspaceName: library.library_name,
    }
  } catch (error) {
    console.error('[WorkspaceSync] Import failed:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Get external URI for a workspace
 * @param {string} workspaceId - Workspace ID
 * @returns {Promise<string|null>}
 */
export async function getExternalUri(workspaceId) {
  try {
    const result = await db.getOne(
      CENTRAL_DB,
      'SELECT external_uri FROM mobile_workspace_sync WHERE workspace_id = ?',
      [workspaceId]
    )
    return result ? result.external_uri : null
  } catch (error) {
    console.error('[WorkspaceSync] Failed to get external URI:', error)
    return null
  }
}

/**
 * Sync database back to external location (copy-back)
 * @param {string} workspaceId - Workspace ID
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function syncDatabaseBack(workspaceId) {
  try {
    console.log('[WorkspaceSync] Starting sync back for workspace:', workspaceId)

    // Step 1: Get external URI
    const externalUri = await getExternalUri(workspaceId)
    if (!externalUri) {
      return { success: false, error: 'External URI not found for workspace' }
    }

    // Step 2: Read internal database
    const internalDbPath = `workspaces/${workspaceId}/db.sqlite`

    // Check platform and use appropriate read method
    const platform = (await import('@capacitor/core')).Capacitor.getPlatform()

    let dbData
    if (platform === 'android') {
      const { FileWriter } = await import('../adapters/file-writer-plugin.js')
      const result = await FileWriter.readFromAppDatabase({ dbName: workspaceId })
      if (!result.success) {
        return { success: false, error: 'Failed to read app database' }
      }
      dbData = result.data
      console.log('[WorkspaceSync] Read app database, size:', dbData.length)
    } else {
      dbData = await readBinaryFile(internalDbPath, Directory.Data)
      console.log('[WorkspaceSync] Read internal database, size:', dbData.length)
    }

    // Step 3: Write back to external location
    const externalDbRelativePath = '.increvise/db.sqlite'

    if (platform === 'android') {
      // Use native plugin for Android SAF tree URI
      const { FileWriter } = await import('../adapters/file-writer-plugin.js')
      await FileWriter.writeToTreeUri({
        treeUri: externalUri,
        relativePath: externalDbRelativePath,
        data: dbData,
      })
    } else {
      // iOS can write directly
      await Filesystem.writeFile({
        path: `${externalUri}/${externalDbRelativePath}`,
        data: dbData,
      })
    }

    console.log('[WorkspaceSync] Database synced back successfully')

    // Step 4: Update last_synced timestamp
    await db.run(
      CENTRAL_DB,
      'UPDATE mobile_workspace_sync SET last_synced = ? WHERE workspace_id = ?',
      [Date.now(), workspaceId]
    )

    return { success: true }
  } catch (error) {
    console.error('[WorkspaceSync] Sync back failed:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Read a file from external workspace folder
 * @param {string} workspaceId - Workspace ID
 * @param {string} relativePath - Relative path within workspace (e.g., 'notes/file1.md')
 * @returns {Promise<string>} File content
 */
export async function readExternalFile(workspaceId, relativePath) {
  const externalUri = await getExternalUri(workspaceId)
  if (!externalUri) {
    throw new Error('External URI not found for workspace')
  }

  console.log('[WorkspaceSync] Reading file:', `${externalUri}/${relativePath}`)

  // Check platform
  const platform = (await import('@capacitor/core')).Capacitor.getPlatform()

  if (platform === 'android') {
    // Use native plugin for Android SAF tree URI
    const { FileWriter } = await import('../adapters/file-writer-plugin.js')
    const result = await FileWriter.readFromTreeUri({
      treeUri: externalUri,
      relativePath,
    })
    if (!result.success) {
      throw new Error('Failed to read file')
    }
    // Decode base64 to UTF-8 text using modern Fetch API
    return await base64ToText(result.data)
  } else {
    // iOS can read directly
    const result = await Filesystem.readFile({
      path: `${externalUri}/${relativePath}`,
      encoding: Encoding.UTF8,
    })
    return result.data
  }
}

/**
 * Read a binary file from external workspace folder
 * @param {string} workspaceId - Workspace ID
 * @param {string} relativePath - Relative path within workspace
 * @returns {Promise<string>} Base64 encoded data
 */
export async function readExternalBinaryFile(workspaceId, relativePath) {
  const externalUri = await getExternalUri(workspaceId)
  if (!externalUri) {
    throw new Error('External URI not found for workspace')
  }

  console.log('[WorkspaceSync] Reading binary file:', `${externalUri}/${relativePath}`)

  // Check platform
  const platform = (await import('@capacitor/core')).Capacitor.getPlatform()

  if (platform === 'android') {
    // Use native plugin for Android SAF tree URI
    const { FileWriter } = await import('../adapters/file-writer-plugin.js')
    const result = await FileWriter.readFromTreeUri({
      treeUri: externalUri,
      relativePath,
    })
    if (!result.success) {
      throw new Error('Failed to read file')
    }
    return result.data // Already base64
  } else {
    // iOS can read directly
    const result = await Filesystem.readFile({
      path: `${externalUri}/${relativePath}`,
    })
    return result.data // Base64
  }
}
