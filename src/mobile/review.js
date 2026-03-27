// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

import * as db from '../adapters/sqlite-adapter.js'
import { calculateSM2 } from '../shared/algorithms/sm2.js'
import { REVIEW_QUERIES } from '../shared/queries/review.js'
import { syncDatabaseBack } from './workspace-sync.js'

/**
 * Get the list of files due for review
 * @param {string} dbName - Workspace database name
 * @param {string} libraryId - Workspace ID
 */
export async function getFilesForRevision(dbName, libraryId) {
  try {
    const files = await db.getAll(dbName, REVIEW_QUERIES.GET_FILES_DUE, [libraryId])
    const mapped = (files || []).map((file) => ({
      ...file,
      file_path: `${dbName}/${file.relative_path}`,
      workspacePath: dbName,
      dbPath: dbName,
    }))
    return { success: true, files: mapped }
  } catch (error) {
    console.error('[Review] Failed to get files for revision:', error)
    return { success: false, error: error.message, files: [] }
  }
}

/**
 * Get all files (including those not yet due)
 * @param {string} dbName - Workspace database name
 * @param {string} libraryId - Workspace ID
 */
export async function getAllFiles(dbName, libraryId) {
  try {
    const files = await db.getAll(dbName, REVIEW_QUERIES.GET_ALL_FILES, [libraryId])
    const mapped = (files || []).map((file) => ({
      ...file,
      file_path: `${dbName}/${file.relative_path}`,
      workspacePath: dbName,
      dbPath: dbName,
    }))
    return { success: true, files: mapped }
  } catch (error) {
    console.error('[Review] Failed to get all files:', error)
    return { success: false, error: error.message, files: [] }
  }
}

/**
 * Get the current queue of a file
 */
async function getFileQueue(dbName, libraryId, relativePath) {
  const result = await db.getOne(dbName, REVIEW_QUERIES.GET_FILE_QUEUE, [libraryId, relativePath])
  return result ? result.queue_name : null
}

/**
 * Handle feedback for the "New" queue
 */
async function handleNewQueueFeedback(dbName, libraryId, relativePath, feedback) {
  try {
    if (feedback === 'skip') {
      // Skip: Postpone to tomorrow
      const sql = `
        UPDATE file
        SET due_time = datetime('now', '+1 day')
        WHERE library_id = ? AND relative_path = ?
      `
      await db.run(dbName, sql, [libraryId, relativePath])

      // Sync database back immediately
      await syncDatabaseBack(dbName)

      return { success: true, message: 'File postponed to tomorrow' }
    } else if (feedback === 'viewed') {
      // Viewed: Move to the "processing" queue
      await db.executeTransaction(dbName, async () => {
        // Get rotation_interval
        const file = await db.getOne(
          dbName,
          'SELECT rotation_interval FROM file WHERE library_id = ? AND relative_path = ?',
          [libraryId, relativePath]
        )
        const rotationInterval = file?.rotation_interval || 3

        // Update queue
        await db.run(
          dbName,
          'UPDATE queue_membership SET queue_name = ? WHERE library_id = ? AND relative_path = ?',
          ['processing', libraryId, relativePath]
        )

        // Update due_time
        await db.run(
          dbName,
          `UPDATE file SET due_time = datetime('now', '+' || ? || ' days'), last_queue_change = datetime('now') WHERE library_id = ? AND relative_path = ?`,
          [rotationInterval, libraryId, relativePath]
        )
      })

      // Sync database back immediately
      await syncDatabaseBack(dbName)

      return { success: true, message: 'File moved to processing queue' }
    }

    return { success: false, error: 'Invalid feedback for new queue' }
  } catch (error) {
    console.error('[Review] New queue feedback error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Handle feedback for the "Processing" queue
 */
async function handleProcessingFeedback(dbName, libraryId, relativePath, feedback) {
  try {
    if (feedback === 'skip') {
      // Skip: Postpone to tomorrow
      const sql = `
        UPDATE file
        SET due_time = datetime('now', '+1 day')
        WHERE library_id = ? AND relative_path = ?
      `
      await db.run(dbName, sql, [libraryId, relativePath])

      // Sync database back immediately
      await syncDatabaseBack(dbName)

      return { success: true, message: 'File postponed to tomorrow' }
    } else if (feedback === 'viewed') {
      // Viewed: Postpone based on rotation_interval
      const file = await db.getOne(
        dbName,
        'SELECT rotation_interval FROM file WHERE library_id = ? AND relative_path = ?',
        [libraryId, relativePath]
      )
      const rotationInterval = file?.rotation_interval || 3

      await db.run(
        dbName,
        `UPDATE file SET due_time = datetime('now', '+' || ? || ' days') WHERE library_id = ? AND relative_path = ?`,
        [rotationInterval, libraryId, relativePath]
      )

      // Sync database back immediately
      await syncDatabaseBack(dbName)

      return { success: true, message: `Next review in ${rotationInterval} days` }
    }

    return { success: false, error: 'Invalid feedback for processing queue' }
  } catch (error) {
    console.error('[Review] Processing queue feedback error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Handle feedback for the "Intermediate" queue
 */
async function handleIntermediateFeedback(dbName, libraryId, relativePath, feedback) {
  try {
    const file = await db.getOne(
      dbName,
      'SELECT intermediate_interval FROM file WHERE library_id = ? AND relative_path = ?',
      [libraryId, relativePath]
    )

    if (!file) {
      return { success: false, error: 'File not found' }
    }

    let newInterval = file.intermediate_interval || 7

    if (feedback === 'decrease') {
      newInterval = Math.max(1, Math.floor(newInterval / 1.5))
    } else if (feedback === 'maintain') {
      // Keep the same interval
    } else if (feedback === 'increase') {
      newInterval = Math.floor(newInterval * 1.5)
    } else {
      return { success: false, error: 'Invalid feedback for intermediate queue' }
    }

    await db.run(
      dbName,
      `UPDATE file 
       SET intermediate_interval = ?,
           due_time = datetime('now', '+' || ? || ' days')
       WHERE library_id = ? AND relative_path = ?`,
      [newInterval, newInterval, libraryId, relativePath]
    )

    // Sync database back immediately
    await syncDatabaseBack(dbName)

    return { success: true, message: `Next review in ${newInterval} days` }
  } catch (error) {
    console.error('[Review] Intermediate queue feedback error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Handle feedback for the "Spaced" queue (using the SM-2 algorithm)
 */
async function handleSpacedFeedback(dbName, libraryId, relativePath, feedback, queueName) {
  try {
    // 1. Load queue configuration
    const configs = await db.getAll(dbName, REVIEW_QUERIES.GET_QUEUE_CONFIG, [libraryId, queueName])

    const params = {}
    configs.forEach((c) => {
      params[c.config_key] = parseFloat(c.config_value)
    })

    // 2. Get the current state of the file
    const file = await db.getOne(dbName, REVIEW_QUERIES.GET_FILE_DETAILS, [libraryId, relativePath])

    if (!file) {
      return { success: false, error: 'File not found' }
    }

    // 3. Apply the SM-2 algorithm
    const { newEasiness, newInterval, newRank } = calculateSM2(file, feedback, params)

    // 4. Update the database
    const updateSql = `
      UPDATE file
      SET last_revised_time = datetime('now'),
          review_count = review_count + 1,
          easiness = ?,
          interval = ?,
          due_time = datetime('now', '+' || ? || ' days'),
          rank = ?
      WHERE library_id = ? AND relative_path = ?
    `
    const result = await db.run(dbName, updateSql, [
      newEasiness,
      newInterval,
      newInterval,
      newRank,
      libraryId,
      relativePath,
    ])

    // Sync database back immediately
    await syncDatabaseBack(dbName)

    return {
      success: true,
      message: `Next review in ${newInterval} day(s)`,
      changes: result.changes,
      queueName: queueName,
    }
  } catch (error) {
    console.error('[Review] Spaced queue feedback error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Update review feedback (main entry point)
 * @param {string} dbName - Workspace database name
 * @param {string} libraryId - Workspace ID
 * @param {string} relativePath - File relative path
 * @param {string} feedback - Feedback type
 */
export async function updateRevisionFeedback(dbName, libraryId, relativePath, feedback) {
  try {
    // 1. Get the current queue of the file
    const queueName = await getFileQueue(dbName, libraryId, relativePath)

    if (!queueName) {
      return { success: false, error: 'File not in any queue' }
    }

    // 2. Route to the appropriate handler based on the queue type
    if (queueName === 'new') {
      return await handleNewQueueFeedback(dbName, libraryId, relativePath, feedback)
    } else if (queueName === 'processing') {
      return await handleProcessingFeedback(dbName, libraryId, relativePath, feedback)
    } else if (queueName === 'intermediate') {
      return await handleIntermediateFeedback(dbName, libraryId, relativePath, feedback)
    } else if (queueName.startsWith('spaced-')) {
      return await handleSpacedFeedback(dbName, libraryId, relativePath, feedback, queueName)
    } else if (queueName === 'archived') {
      return { success: false, error: 'Cannot review archived files' }
    } else {
      return { success: false, error: `Unknown queue: ${queueName}` }
    }
  } catch (error) {
    console.error('[Review] Update revision feedback error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Get the queue a file belongs to
 */
export async function getFileQueue_export(dbName, libraryId, relativePath) {
  try {
    const queueName = await getFileQueue(dbName, libraryId, relativePath)
    return { success: true, queueName }
  } catch (error) {
    return { success: false, error: error.message }
  }
}
