// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Mobile Platform API
 *
 * Provides the window.fileManager API implementation for Capacitor/mobile.
 * This module contains all the mobile-specific implementations that will be
 * exposed as window.fileManager for compatibility with the renderer UI.
 */

import { sqliteAdapter } from '../adapters/sqlite-adapter.js'
import { filesystemAdapter } from '../adapters/filesystem-adapter.js'
import { REVIEW_QUERIES } from '../shared/queries/review.js'

/**
 * Mobile Platform API object
 * This will be assigned to window.fileManager in mobile/init.js
 */
export const mobilePlatform = {
  // ===== Workspace Management =====

  /**
   * Select a folder (not supported on mobile)
   */
  async selectFolder() {
    console.warn('[Mobile] selectFolder not supported on mobile')
    return null
  },

  /**
   * Get recent workspaces list
   * @param {number} limit - Maximum number of workspaces to return
   */
  async getRecentWorkspaces(limit = 10) {
    const { getRecentWorkspaces } = await import('./workspace.js')
    return getRecentWorkspaces(limit)
  },

  /**
   * Record workspace access (handled during importWorkspace)
   * @param {string} _folderPath - Workspace DB name
   */
  async recordWorkspace(_folderPath) {
    console.warn('[Mobile] recordWorkspace handled by importWorkspace on mobile')
    return { success: true }
  },

  /**
   * Update workspace statistics
   * @param {string} folderPath - Workspace DB name
   * @param {number} totalFiles - Total file count
   * @param {number} filesDueToday - Files due today
   */
  async updateWorkspaceStats(folderPath, totalFiles, filesDueToday) {
    const { updateWorkspaceStats } = await import('./workspace.js')
    return updateWorkspaceStats(folderPath, totalFiles, filesDueToday)
  },

  /**
   * Remove workspace from history
   * @param {string} folderPath - Workspace DB name
   */
  async removeWorkspace(folderPath) {
    const { removeWorkspace } = await import('./workspace.js')
    return removeWorkspace(folderPath)
  },

  /**
   * Import workspace (mobile-specific)
   * @param {string} workspaceDbName - Database name to import
   */
  async importWorkspace(workspaceDbName) {
    const { importWorkspace } = await import('./workspace.js')
    return importWorkspace(workspaceDbName)
  },

  // ===== Review System =====

  /**
   * Get files due for revision in a specific workspace
   * @param {string} rootPath - Workspace DB name
   */
  async getFilesForRevision(rootPath) {
    const { getFilesForRevision } = await import('./review.js')

    const library = await sqliteAdapter.getOne(rootPath, 'SELECT library_id FROM library LIMIT 1')

    if (!library) {
      return { success: false, error: 'No library found', files: [] }
    }

    return getFilesForRevision(rootPath, library.library_id)
  },

  /**
   * Get all files including future ones
   * @param {string} rootPath - Workspace DB name
   */
  async getFilesIncludingFuture(rootPath) {
    const { getAllFiles } = await import('./review.js')

    const library = await sqliteAdapter.getOne(rootPath, 'SELECT library_id FROM library LIMIT 1')

    if (!library) {
      return { success: false, error: 'No library found', files: [] }
    }

    return getAllFiles(rootPath, library.library_id)
  },

  /**
   * Get all files due today across all workspaces
   */
  async getAllFilesForRevision() {
    try {
      const { getRecentWorkspaces } = await import('./workspace.js')
      const workspaces = await getRecentWorkspaces(100)

      const allFiles = []

      for (const workspace of workspaces) {
        const library = await sqliteAdapter.getOne(
          workspace.db_path,
          'SELECT library_id FROM library LIMIT 1'
        )

        if (library) {
          // Get max_per_day config for new queue
          const maxNewConfig = await sqliteAdapter.getOne(
            workspace.db_path,
            REVIEW_QUERIES.GET_QUEUE_CONFIG_VALUE,
            [library.library_id, 'new', 'max_per_day']
          )
          const maxNewPerDay = maxNewConfig ? parseInt(maxNewConfig.config_value) : 10

          // Get new queue items (FIFO)
          const newItems = await sqliteAdapter.getAll(
            workspace.db_path,
            `SELECT f.*, qm.queue_name
             FROM file f
             JOIN queue_membership qm ON f.library_id = qm.library_id AND f.relative_path = qm.relative_path
             WHERE qm.queue_name = 'new' AND f.library_id = ?
             ORDER BY f.added_time ASC
             LIMIT ?`,
            [library.library_id, maxNewPerDay]
          )

          // Get processing queue items (due today)
          const processingItems = await sqliteAdapter.getAll(
            workspace.db_path,
            `SELECT f.*, qm.queue_name
             FROM file f
             JOIN queue_membership qm ON f.library_id = qm.library_id AND f.relative_path = qm.relative_path
             WHERE qm.queue_name = 'processing' 
               AND f.library_id = ?
               AND date(f.due_time) <= date('now')
             ORDER BY f.due_time ASC, f.rank ASC`,
            [library.library_id]
          )

          // Get intermediate queue items (due today)
          const intermediateItems = await sqliteAdapter.getAll(
            workspace.db_path,
            `SELECT f.*, qm.queue_name
             FROM file f
             JOIN queue_membership qm ON f.library_id = qm.library_id AND f.relative_path = qm.relative_path
             WHERE qm.queue_name = 'intermediate'
               AND f.library_id = ?
               AND date(f.due_time) <= date('now')
             ORDER BY f.due_time ASC, f.rank ASC`,
            [library.library_id]
          )

          // Get spaced queue items (due today) - all three sub-queues
          const spacedItems = await sqliteAdapter.getAll(
            workspace.db_path,
            `SELECT f.*, qm.queue_name
             FROM file f
             JOIN queue_membership qm ON f.library_id = qm.library_id AND f.relative_path = qm.relative_path
             WHERE qm.queue_name IN ('spaced-casual', 'spaced-standard', 'spaced-strict')
               AND f.library_id = ?
               AND date(f.due_time) <= date('now')
             ORDER BY f.due_time ASC, f.rank ASC`,
            [library.library_id]
          )

          // Combine all items and add workspace metadata
          const workspaceFiles = [
            ...newItems,
            ...processingItems,
            ...intermediateItems,
            ...spacedItems,
          ]

          allFiles.push(
            ...workspaceFiles.map((row) => ({
              ...row,
              workspace_name: workspace.folder_name,
              db_path: workspace.db_path,
            }))
          )
        }
      }

      // Sort by due_time and rank
      allFiles.sort((a, b) => {
        const dateA = new Date(a.due_time)
        const dateB = new Date(b.due_time)
        if (dateA.toDateString() === dateB.toDateString()) {
          return (a.rank || 70) - (b.rank || 70)
        }
        return dateA - dateB
      })

      return allFiles
    } catch (error) {
      console.error('[Mobile] getAllFilesForRevision error:', error)
      return []
    }
  },

  /**
   * Get all files including future across all workspaces
   */
  async getAllFilesIncludingFuture() {
    try {
      const { getRecentWorkspaces } = await import('./workspace.js')
      const workspaces = await getRecentWorkspaces(100)

      const allFiles = []

      for (const workspace of workspaces) {
        const library = await sqliteAdapter.getOne(
          workspace.db_path,
          'SELECT library_id FROM library LIMIT 1'
        )

        if (library) {
          const files = await sqliteAdapter.getAll(
            workspace.db_path,
            REVIEW_QUERIES.GET_ALL_FILES,
            [library.library_id]
          )

          allFiles.push(
            ...files.map((row) => ({
              ...row,
              workspace_name: workspace.folder_name,
              db_path: workspace.db_path,
            }))
          )
        }
      }

      // Sort by due_time and rank
      allFiles.sort((a, b) => {
        const dateA = new Date(a.due_time)
        const dateB = new Date(b.due_time)
        if (dateA.toDateString() === dateB.toDateString()) {
          return (a.rank || 70) - (b.rank || 70)
        }
        return dateA - dateB
      })

      return allFiles
    } catch (error) {
      console.error('[Mobile] getAllFilesIncludingFuture error:', error)
      return []
    }
  },

  /**
   * Update revision feedback
   * @param {string} dbPath - Database name
   * @param {string} libraryId - Library ID
   * @param {string} relativePath - File relative path
   * @param {string} feedback - Feedback type
   */
  async updateRevisionFeedback(dbPath, libraryId, relativePath, feedback) {
    const { updateRevisionFeedback } = await import('./review.js')
    return updateRevisionFeedback(dbPath, libraryId, relativePath, feedback)
  },

  /**
   * Get file's current queue
   * @param {string} filePath - File path
   * @param {string} libraryId - Library ID
   */
  async getFileQueue(filePath, libraryId) {
    const { getFileQueue_export } = await import('./review.js')
    return getFileQueue_export(filePath, libraryId, filePath)
  },

  /**
   * Move file to different queue
   * @param {string} filePath - File relative path (on mobile, this is already relative)
   * @param {string} libraryId - Library ID
   * @param {string} targetQueue - Target queue name
   */
  async moveFileToQueue(filePath, libraryId, targetQueue) {
    try {
      const { getRecentWorkspaces } = await import('./workspace.js')
      const workspaces = await getRecentWorkspaces(100)

      // Find workspace containing this library
      const workspace = workspaces.find(async (ws) => {
        const lib = await sqliteAdapter.getOne(ws.db_path, 'SELECT library_id FROM library LIMIT 1')
        return lib && lib.library_id === libraryId
      })

      if (!workspace) {
        return { success: false, error: 'Workspace not found' }
      }

      const dbName = workspace.db_path

      // Update queue membership
      await sqliteAdapter.run(dbName, REVIEW_QUERIES.UPDATE_QUEUE_MEMBERSHIP, [
        targetQueue,
        libraryId,
        filePath,
      ])

      // Update last_queue_change timestamp
      await sqliteAdapter.run(dbName, REVIEW_QUERIES.UPDATE_QUEUE_CHANGE_TIME, [
        libraryId,
        filePath,
      ])

      // Set appropriate parameters based on target queue
      if (targetQueue === 'intermediate') {
        // Get default interval from config
        const defaultIntervalConfig = await sqliteAdapter.getOne(
          dbName,
          REVIEW_QUERIES.GET_QUEUE_CONFIG_VALUE,
          [libraryId, 'intermediate', 'default_base']
        )
        const defaultInterval = defaultIntervalConfig
          ? parseInt(defaultIntervalConfig.config_value)
          : 7

        await sqliteAdapter.run(dbName, REVIEW_QUERIES.UPDATE_INTERMEDIATE_INTERVAL, [
          defaultInterval,
          libraryId,
          filePath,
        ])
        await sqliteAdapter.run(dbName, REVIEW_QUERIES.UPDATE_DUE_TIME_IMMEDIATE, [
          libraryId,
          filePath,
        ])
      } else if (targetQueue.startsWith('spaced-')) {
        // Get initial EF from queue config
        const queueConfig = await sqliteAdapter.getOne(
          dbName,
          REVIEW_QUERIES.GET_QUEUE_CONFIG_VALUE,
          [libraryId, targetQueue, 'initial_ef']
        )

        const initialEF = queueConfig ? parseFloat(queueConfig.config_value) : 2.5

        await sqliteAdapter.run(
          dbName,
          `UPDATE file SET easiness = ?, review_count = 0, interval = 1, due_time = datetime('now')
           WHERE library_id = ? AND relative_path = ?`,
          [initialEF, libraryId, filePath]
        )
      } else if (targetQueue === 'archived') {
        await sqliteAdapter.run(dbName, REVIEW_QUERIES.ARCHIVE_FILE, [libraryId, filePath])
      } else if (targetQueue === 'processing') {
        const file = await sqliteAdapter.getOne(dbName, REVIEW_QUERIES.GET_FILE_DETAILS, [
          libraryId,
          filePath,
        ])
        const rotationInterval = file?.rotation_interval || 3
        await sqliteAdapter.run(dbName, REVIEW_QUERIES.UPDATE_DUE_TIME_WITH_INTERVAL, [
          rotationInterval,
          libraryId,
          filePath,
        ])
      }

      return { success: true, message: `File moved to ${targetQueue} queue` }
    } catch (error) {
      console.error('[Mobile] moveFileToQueue error:', error)
      return { success: false, error: error.message }
    }
  },

  /**
   * Forget file (reset revision data)
   * @param {string} filePath - File relative path
   * @param {string} libraryId - Library ID
   */
  async forgetFile(filePath, libraryId) {
    try {
      const { getRecentWorkspaces } = await import('./workspace.js')
      const workspaces = await getRecentWorkspaces(100)

      // Find workspace containing this library
      let dbName = null
      for (const ws of workspaces) {
        const lib = await sqliteAdapter.getOne(ws.db_path, 'SELECT library_id FROM library LIMIT 1')
        if (lib && lib.library_id === libraryId) {
          dbName = ws.db_path
          break
        }
      }

      if (!dbName) {
        return { success: false, error: 'Workspace not found' }
      }

      // Check if file exists
      const fileCheck = await sqliteAdapter.getOne(dbName, REVIEW_QUERIES.CHECK_FILE_EXISTS, [
        libraryId,
        filePath,
      ])

      if (!fileCheck || fileCheck.exists_flag !== 1) {
        return { success: false, error: 'File not found in database' }
      }

      // Delete note source data
      const noteSourceResult = await sqliteAdapter.run(dbName, REVIEW_QUERIES.DELETE_NOTE_SOURCE, [
        libraryId,
        filePath,
      ])

      // Reset file data
      const fileResult = await sqliteAdapter.run(dbName, REVIEW_QUERIES.FORGET_FILE, [
        libraryId,
        filePath,
      ])

      return {
        success: true,
        message: 'File revision data erased, but entry kept in database',
        deletedRevisions: noteSourceResult.changes,
        updatedFile: fileResult.changes > 0,
      }
    } catch (error) {
      console.error('[Mobile] forgetFile error:', error)
      return { success: false, error: error.message }
    }
  },

  /**
   * Update file rank manually
   * @param {string} filePath - File relative path
   * @param {string} libraryId - Library ID
   * @param {number} newRank - New rank value
   */
  async updateFileRank(filePath, libraryId, newRank) {
    try {
      const { getRecentWorkspaces } = await import('./workspace.js')
      const workspaces = await getRecentWorkspaces(100)

      // Find workspace containing this library
      let dbName = null
      for (const ws of workspaces) {
        const lib = await sqliteAdapter.getOne(ws.db_path, 'SELECT library_id FROM library LIMIT 1')
        if (lib && lib.library_id === libraryId) {
          dbName = ws.db_path
          break
        }
      }

      if (!dbName) {
        return { success: false, error: 'Workspace not found' }
      }

      // Check if file exists
      const fileCheck = await sqliteAdapter.getOne(dbName, REVIEW_QUERIES.CHECK_FILE_EXISTS, [
        libraryId,
        filePath,
      ])

      if (!fileCheck || fileCheck.exists_flag !== 1) {
        return { success: false, error: 'File not found in database' }
      }

      const result = await sqliteAdapter.run(dbName, REVIEW_QUERIES.UPDATE_FILE_RANK, [
        newRank,
        libraryId,
        filePath,
      ])

      return {
        success: true,
        message: 'Rank updated successfully',
        changes: result.changes,
      }
    } catch (error) {
      console.error('[Mobile] updateFileRank error:', error)
      return { success: false, error: error.message }
    }
  },

  /**
   * Update intermediate queue interval
   * @param {string} filePath - File relative path
   * @param {string} libraryId - Library ID
   * @param {number} newInterval - New interval in days
   */
  async updateIntermediateInterval(filePath, libraryId, newInterval) {
    try {
      const { getRecentWorkspaces } = await import('./workspace.js')
      const workspaces = await getRecentWorkspaces(100)

      // Find workspace containing this library
      let dbName = null
      for (const ws of workspaces) {
        const lib = await sqliteAdapter.getOne(ws.db_path, 'SELECT library_id FROM library LIMIT 1')
        if (lib && lib.library_id === libraryId) {
          dbName = ws.db_path
          break
        }
      }

      if (!dbName) {
        return { success: false, error: 'Workspace not found' }
      }

      // Validate interval (1-365 days)
      const clampedInterval = Math.max(1, Math.min(365, Math.round(newInterval)))

      const result = await sqliteAdapter.run(dbName, REVIEW_QUERIES.UPDATE_INTERMEDIATE_INTERVAL, [
        clampedInterval,
        libraryId,
        filePath,
      ])

      return { success: true, newInterval: clampedInterval, changes: result.changes }
    } catch (error) {
      console.error('[Mobile] updateIntermediateInterval error:', error)
      return { success: false, error: error.message }
    }
  },

  /**
   * Update rotation interval
   * @param {string} filePath - File relative path
   * @param {string} libraryId - Library ID
   * @param {number} newInterval - New interval in days
   */
  async updateRotationInterval(filePath, libraryId, newInterval) {
    try {
      const { getRecentWorkspaces } = await import('./workspace.js')
      const workspaces = await getRecentWorkspaces(100)

      // Find workspace containing this library
      let dbName = null
      for (const ws of workspaces) {
        const lib = await sqliteAdapter.getOne(ws.db_path, 'SELECT library_id FROM library LIMIT 1')
        if (lib && lib.library_id === libraryId) {
          dbName = ws.db_path
          break
        }
      }

      if (!dbName) {
        return { success: false, error: 'Workspace not found' }
      }

      // Validate interval (1-365 days)
      const clampedInterval = Math.max(1, Math.min(365, Math.round(newInterval)))

      const result = await sqliteAdapter.run(dbName, REVIEW_QUERIES.UPDATE_ROTATION_INTERVAL, [
        clampedInterval,
        libraryId,
        filePath,
      ])

      return { success: true, newInterval: clampedInterval, changes: result.changes }
    } catch (error) {
      console.error('[Mobile] updateRotationInterval error:', error)
      return { success: false, error: error.message }
    }
  },

  // ===== File System =====

  /**
   * Get directory tree structure
   * @param {string} path - Directory path
   * @param {string} libraryId - Library ID
   */
  async getDirectoryTree(path, libraryId) {
    try {
      const { getRecentWorkspaces } = await import('./workspace.js')
      const workspaces = await getRecentWorkspaces(100)

      // Find workspace containing this library
      let workspace = null
      for (const ws of workspaces) {
        const lib = await sqliteAdapter.getOne(ws.db_path, 'SELECT library_id FROM library LIMIT 1')
        if (lib && lib.library_id === libraryId) {
          workspace = ws
          break
        }
      }

      if (!workspace) {
        return null
      }

      // Get all files in this workspace from the database
      const files = await sqliteAdapter.getAll(
        workspace.db_path,
        `SELECT relative_path FROM file WHERE library_id = ?`,
        [libraryId]
      )

      // Build a tree structure from the file paths
      const tree = { name: path, type: 'directory', children: [] }

      for (const file of files) {
        const parts = file.relative_path.split('/')
        let currentNode = tree

        for (let i = 0; i < parts.length; i++) {
          const part = parts[i]
          const isLastPart = i === parts.length - 1

          // Find existing child node
          let childNode = currentNode.children?.find((child) => child.name === part)

          if (!childNode) {
            // Create new node
            childNode = {
              name: part,
              type: isLastPart ? 'file' : 'directory',
              path: parts.slice(0, i + 1).join('/'),
            }

            if (!isLastPart) {
              childNode.children = []
            }

            if (!currentNode.children) {
              currentNode.children = []
            }
            currentNode.children.push(childNode)
          }

          currentNode = childNode
        }
      }

      return tree
    } catch (error) {
      console.error('[Mobile] getDirectoryTree error:', error)
      return null
    }
  },

  /**
   * Read text file
   * @param {string} filePath - File path
   */
  async readFile(filePath) {
    return filesystemAdapter.readFile(filePath)
  },

  /**
   * Read PDF file (returns Uint8Array for PDF.js)
   * @param {string} filePath - PDF file path
   */
  async readPdfFile(filePath) {
    // Get base64 string from Capacitor Filesystem
    const base64 = await filesystemAdapter.readBinaryFile(filePath)

    // Convert base64 to Uint8Array for PDF.js
    // In Capacitor/mobile environment, use atob (global in browser context)
    /* global atob */
    const binaryString = atob(base64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    return { success: true, data: bytes }
  },

  /**
   * Write file (not supported - mobile is read-only)
   */
  async writeFile(_filePath, _content) {
    console.warn('[Mobile] writeFile not supported on mobile (read-only mode)')
    return { success: false, error: 'Mobile is read-only' }
  },

  // ===== Database Operations =====

  /**
   * Create new database (not supported on mobile)
   */
  async createDatabase(_dbPath) {
    console.warn('[Mobile] createDatabase not supported on mobile')
    return { success: false, error: 'Not supported on mobile' }
  },

  /**
   * Check if file is in queue
   * @param {string} filePath - File relative path
   * @param {string} libraryId - Library ID
   */
  async checkFileInQueue(filePath, libraryId) {
    try {
      const { getRecentWorkspaces } = await import('./workspace.js')
      const workspaces = await getRecentWorkspaces(100)

      // Find workspace containing this library
      let dbName = null
      for (const ws of workspaces) {
        const lib = await sqliteAdapter.getOne(ws.db_path, 'SELECT library_id FROM library LIMIT 1')
        if (lib && lib.library_id === libraryId) {
          dbName = ws.db_path
          break
        }
      }

      if (!dbName) {
        return false
      }

      const result = await sqliteAdapter.getOne(dbName, REVIEW_QUERIES.CHECK_FILE_EXISTS, [
        libraryId,
        filePath,
      ])

      return result && result.exists_flag === 1
    } catch (error) {
      console.error('[Mobile] checkFileInQueue error:', error)
      return false
    }
  },

  /**
   * Add file to queue (not supported - mobile is read-only)
   */
  async addFileToQueue(_filePath, _libraryId) {
    console.warn('[Mobile] addFileToQueue not supported on mobile (read-only)')
    return { success: false, error: 'Mobile is read-only' }
  },

  // ===== Extraction Features (Not Supported on Mobile) =====

  async extractNote(_filePath, _selectedText, _childFileName, _rangeStart, _rangeEnd, _libraryId) {
    console.warn('[Mobile] extractNote not supported on mobile')
    return { success: false, error: 'Extraction not available on mobile' }
  },

  async validateAndRecoverNoteRange(_notePath, _libraryId) {
    console.warn('[Mobile] validateAndRecoverNoteRange not supported on mobile')
    return { success: false, error: 'Not available on mobile' }
  },

  async compareFilenameWithDbRange(_notePath, _libraryId) {
    console.warn('[Mobile] compareFilenameWithDbRange not supported on mobile')
    return null
  },

  async getChildRanges(_parentPath, _libraryId) {
    console.warn('[Mobile] getChildRanges not supported on mobile')
    return []
  },

  async updateLockedRanges(_parentPath, _rangeUpdates, _libraryId) {
    console.warn('[Mobile] updateLockedRanges not supported on mobile')
    return { success: false, error: 'Not available on mobile' }
  },

  async getNoteExtractInfo(_notePath, _libraryId) {
    console.warn('[Mobile] getNoteExtractInfo not supported on mobile')
    return null
  },

  async extractPdfPages(_pdfPath, _startPage, _endPage, _libraryId) {
    console.warn('[Mobile] extractPdfPages not supported on mobile')
    return { success: false, error: 'Not available on mobile' }
  },

  async extractPdfText(_pdfPath, _text, _pageNum, _lineStart, _lineEnd, _libraryId) {
    console.warn('[Mobile] extractPdfText not supported on mobile')
    return { success: false, error: 'Not available on mobile' }
  },

  async extractPdfAnnotation(_pdfPath, _annotation, _libraryId) {
    console.warn('[Mobile] extractPdfAnnotation not supported on mobile')
    return { success: false, error: 'Not available on mobile' }
  },

  async extractVideoClip(_videoPath, _startTime, _endTime, _libraryId) {
    console.warn('[Mobile] extractVideoClip not supported on mobile')
    return { success: false, error: 'Not available on mobile' }
  },

  async extractFlashcard(_filePath, _selectedText, _charStart, _charEnd, _libraryId) {
    console.warn('[Mobile] extractFlashcard not supported on mobile')
    return { success: false, error: 'Not available on mobile' }
  },
}
