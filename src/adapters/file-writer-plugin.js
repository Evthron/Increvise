// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * FileWriter Plugin Wrapper
 * Provides a consistent interface for reading/writing files via content URIs on Android
 */

import { registerPlugin } from '@capacitor/core'

const FileWriterPlugin = registerPlugin('FileWriter')

export const FileWriter = {
  /**
   * Write data to a content URI (Android only)
   * @param {Object} options
   * @param {string} options.uri - Content URI to write to
   * @param {string} options.data - Base64 encoded data
   */
  async writeToContentUri(options) {
    return await FileWriterPlugin.writeToContentUri(options)
  },

  /**
   * Read data from a content URI (Android only)
   * @param {Object} options
   * @param {string} options.uri - Content URI to read from
   * @returns {Promise<{success: boolean, data: string}>} Base64 encoded data
   */
  async readFromContentUri(options) {
    return await FileWriterPlugin.readFromContentUri(options)
  },

  /**
   * Read data from a tree URI with relative path (Android only)
   * @param {Object} options
   * @param {string} options.treeUri - Tree URI from SAF
   * @param {string} options.relativePath - Relative path under tree
   * @returns {Promise<{success: boolean, data: string}>} Base64 encoded data
   */
  async readFromTreeUri(options) {
    return await FileWriterPlugin.readFromTreeUri(options)
  },

  /**
   * Write data to a tree URI with relative path (Android only)
   * @param {Object} options
   * @param {string} options.treeUri - Tree URI from SAF
   * @param {string} options.relativePath - Relative path under tree
   * @param {string} options.data - Base64 encoded data
   */
  async writeToTreeUri(options) {
    return await FileWriterPlugin.writeToTreeUri(options)
  },

  /**
   * Write data to app database path (Android only)
   * @param {Object} options
   * @param {string} options.dbName - Database name
   * @param {string} options.data - Base64 encoded data
   */
  async writeToAppDatabase(options) {
    return await FileWriterPlugin.writeToAppDatabase(options)
  },

  /**
   * Read data from app database path (Android only)
   * @param {Object} options
   * @param {string} options.dbName - Database name
   * @returns {Promise<{success: boolean, data: string}>} Base64 encoded data
   */
  async readFromAppDatabase(options) {
    return await FileWriterPlugin.readFromAppDatabase(options)
  },

  /**
   * Take persistable URI permission (Android only)
   * Required to maintain access to external storage directories across app restarts
   * @param {Object} options
   * @param {string} options.uri - Tree URI to persist permission for
   */
  async takePersistablePermission(options) {
    return await FileWriterPlugin.takePersistablePermission(options)
  },

  /**
   * Release persistable URI permission (Android only)
   * Call when workspace is removed or access is no longer needed
   * @param {Object} options
   * @param {string} options.uri - Tree URI to release permission for
   */
  async releasePersistablePermission(options) {
    return await FileWriterPlugin.releasePersistablePermission(options)
  },
}
