// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared SQL queries for workspace management
 * Used by both desktop (Electron) and mobile (Capacitor) implementations
 */

export const WORKSPACE_QUERIES = {
  /**
   * Record or update a workspace in workspace_history
   */
  RECORD: `
    INSERT INTO workspace_history 
    (library_id, folder_path, folder_name, db_path, last_opened, open_count)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 1)
    ON CONFLICT(library_id) DO UPDATE SET
      folder_path = excluded.folder_path,
      folder_name = excluded.folder_name,
      db_path = excluded.db_path,
      last_opened = CURRENT_TIMESTAMP,
      open_count = open_count + 1
  `,

  /**
   * Get recent workspaces sorted by last opened
   */
  GET_RECENT: `
    SELECT * FROM workspace_history 
    ORDER BY last_opened DESC 
    LIMIT ?
  `,

  /**
   * Update workspace statistics (file counts)
   */
  UPDATE_STATS: `
    UPDATE workspace_history 
    SET total_files = ?, files_due_today = ?
    WHERE folder_path = ?
  `,

  /**
   * Remove a workspace from history (does not delete files)
   */
  REMOVE: `
    DELETE FROM workspace_history 
    WHERE folder_path = ?
  `,

  /**
   * Get library information from workspace database
   */
  GET_LIBRARY_INFO: `
    SELECT library_id, library_name FROM library LIMIT 1
  `,

  /**
   * Get library_id only (used by desktop)
   */
  GET_LIBRARY_ID: `
    SELECT library_id FROM library LIMIT 1
  `,
}
