// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared SQL queries for review system
 * Used by both desktop (Electron) and mobile (Capacitor) implementations
 */

export const REVIEW_QUERIES = {
  /**
   * Check if file exists in queue
   */
  CHECK_FILE_EXISTS: `
    SELECT EXISTS (
      SELECT 1 FROM file 
      WHERE library_id = ? AND relative_path = ?
    ) AS exists_flag
  `,

  /**
   * Get files due for revision (single workspace)
   */
  GET_FILES_DUE: `
    SELECT f.*, qm.queue_name
    FROM file f
    JOIN queue_membership qm ON f.library_id = qm.library_id AND f.relative_path = qm.relative_path
    WHERE f.library_id = ? 
      AND qm.queue_name != 'archived'
      AND date(f.due_time) <= date('now')
    ORDER BY f.due_time ASC, f.rank ASC
  `,

  /**
   * Get all files including future (single workspace)
   */
  GET_ALL_FILES: `
    SELECT f.*, qm.queue_name
    FROM file f
    JOIN queue_membership qm ON f.library_id = qm.library_id AND f.relative_path = qm.relative_path
    WHERE f.library_id = ? AND qm.queue_name != 'archived'
    ORDER BY f.due_time ASC, f.rank ASC
  `,

  /**
   * Get file's current queue
   */
  GET_FILE_QUEUE: `
    SELECT queue_name 
    FROM queue_membership 
    WHERE library_id = ? AND relative_path = ?
  `,

  /**
   * Update file rank
   */
  UPDATE_FILE_RANK: `
    UPDATE file
    SET rank = ?
    WHERE library_id = ? AND relative_path = ?
  `,

  /**
   * Update intermediate interval
   */
  UPDATE_INTERMEDIATE_INTERVAL: `
    UPDATE file 
    SET intermediate_interval = ? 
    WHERE library_id = ? AND relative_path = ?
  `,

  /**
   * Update rotation interval
   */
  UPDATE_ROTATION_INTERVAL: `
    UPDATE file 
    SET rotation_interval = ? 
    WHERE library_id = ? AND relative_path = ?
  `,

  /**
   * Move file to different queue
   */
  UPDATE_QUEUE_MEMBERSHIP: `
    UPDATE queue_membership 
    SET queue_name = ? 
    WHERE library_id = ? AND relative_path = ?
  `,

  /**
   * Update last queue change timestamp
   */
  UPDATE_QUEUE_CHANGE_TIME: `
    UPDATE file 
    SET last_queue_change = datetime('now') 
    WHERE library_id = ? AND relative_path = ?
  `,

  /**
   * Reset file for forget operation
   */
  FORGET_FILE: `
    UPDATE file
    SET last_revised_time = NULL,
        review_count = 0,
        easiness = 2.5,
        rank = 70.0,
        interval = 1,
        due_time = datetime('now')
    WHERE library_id = ? AND relative_path = ?
  `,

  /**
   * Delete note source for forget operation
   */
  DELETE_NOTE_SOURCE: `
    DELETE FROM note_source 
    WHERE library_id = ? AND relative_path = ?
  `,

  /**
   * Get file details (for queue operations)
   */
  GET_FILE_DETAILS: `
    SELECT rotation_interval, intermediate_interval, rank, easiness, review_count, interval
    FROM file 
    WHERE library_id = ? AND relative_path = ?
  `,

  /**
   * Get queue configuration
   */
  GET_QUEUE_CONFIG: `
    SELECT config_key, config_value 
    FROM queue_config 
    WHERE library_id = ? AND queue_name = ?
  `,

  /**
   * Get single queue config value
   */
  GET_QUEUE_CONFIG_VALUE: `
    SELECT config_value 
    FROM queue_config 
    WHERE library_id = ? AND queue_name = ? AND config_key = ?
  `,

  /**
   * Update file due time (for intermediate queue with interval)
   */
  UPDATE_DUE_TIME_WITH_INTERVAL: `
    UPDATE file 
    SET due_time = datetime('now', '+' || ? || ' days')
    WHERE library_id = ? AND relative_path = ?
  `,

  /**
   * Update file due time to specific date
   */
  UPDATE_DUE_TIME_IMMEDIATE: `
    UPDATE file 
    SET due_time = datetime('now')
    WHERE library_id = ? AND relative_path = ?
  `,

  /**
   * Archive file (set far future due date)
   */
  ARCHIVE_FILE: `
    UPDATE file 
    SET due_time = datetime('now', '+9999 days')
    WHERE library_id = ? AND relative_path = ?
  `,
}
