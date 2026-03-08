// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite'
import { Capacitor } from '@capacitor/core'

/**
 * SQLite Adapter for Capacitor
 * Provides an interface similar to better-sqlite3 using pure functions
 *
 * This module delegates connection pooling to the Capacitor SQLite plugin's
 * internal _connectionDict Map, avoiding redundant connection management.
 */

const sqlite = new SQLiteConnection(CapacitorSQLite)
let initialized = false

/**
 * Initialize the SQLite plugin (call once at startup)
 */
async function ensureInitialized() {
  if (initialized) return

  try {
    const platform = Capacitor.getPlatform()
    console.log('[SQLite] Initializing on platform:', platform)

    if (platform === 'android') {
      // Android-specific initialization
      await sqlite.checkConnectionsConsistency()
      console.log('[SQLite] Android plugin initialized')
    }

    initialized = true
  } catch (error) {
    console.error('[SQLite] Initialization failed:', error)
    throw error
  }
}

/**
 * Get or create a database connection
 * Uses the plugin's internal connection pool (_connectionDict)
 *
 * @param {string} dbName - Database name
 * @returns {Promise<Object>} Database connection object
 */
async function getConnection(dbName) {
  await ensureInitialized()

  // Check if connection already exists in plugin's internal Map
  const isConnResult = await sqlite.isConnection(dbName, false)

  if (isConnResult.result) {
    // Reuse existing connection from plugin's pool
    return await sqlite.retrieveConnection(dbName, false)
  }

  // Create new connection (plugin will store it in _connectionDict)
  const db = await sqlite.createConnection(
    dbName,
    false, // encrypted
    'no-encryption', // mode
    1, // version
    false // readonly
  )

  await db.open()
  console.log(`[SQLite] Opened database: ${dbName}`)
  return db
}

/**
 * Close a database connection
 * @param {string} dbName - Database name
 */
export async function closeDatabase(dbName) {
  try {
    await sqlite.closeConnection(dbName, false)
    console.log(`[SQLite] Closed database: ${dbName}`)
  } catch (error) {
    console.error(`[SQLite] Failed to close database ${dbName}:`, error)
  }
}

/**
 * Execute a query and return a single row result
 * Equivalent to better-sqlite3's prepare().get()
 *
 * @param {string} dbName - Database name
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Object|null>} First row or null
 */
export async function getOne(dbName, sql, params = []) {
  const db = await getConnection(dbName)
  try {
    const result = await db.query(sql, params)
    return result.values && result.values.length > 0 ? result.values[0] : null
  } catch (error) {
    console.error(`[SQLite] Query error:`, error, sql, params)
    throw error
  }
}

/**
 * Execute a query and return all rows
 * Equivalent to better-sqlite3's prepare().all()
 *
 * @param {string} dbName - Database name
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Array>} Array of rows
 */
export async function getAll(dbName, sql, params = []) {
  const db = await getConnection(dbName)
  try {
    const result = await db.query(sql, params)
    return result.values || []
  } catch (error) {
    console.error(`[SQLite] Query error:`, error, sql, params)
    throw error
  }
}

/**
 * Execute an INSERT/UPDATE/DELETE statement
 * Equivalent to better-sqlite3's prepare().run()
 *
 * @param {string} dbName - Database name
 * @param {string} sql - SQL statement
 * @param {Array} params - Statement parameters
 * @returns {Promise<Object>} Result with changes and lastInsertRowid
 */
export async function run(dbName, sql, params = []) {
  const db = await getConnection(dbName)
  try {
    const result = await db.run(sql, params)
    return {
      changes: result.changes?.changes || 0,
      lastInsertRowid: result.changes?.lastId || 0,
    }
  } catch (error) {
    console.error(`[SQLite] Run error:`, error, sql, params)
    throw error
  }
}

/**
 * Execute multiple SQL statements (used for migrations)
 *
 * @param {string} dbName - Database name
 * @param {string} sql - SQL statements as string
 * @param {boolean} transaction - Enable transaction (default: true)
 * @returns {Promise<Object>} Result object
 */
export async function execute(dbName, sql, transaction = true) {
  const db = await getConnection(dbName)
  try {
    const result = await db.execute(sql, transaction)
    return result
  } catch (error) {
    console.error(`[SQLite] Execute error:`, error)
    console.error(`[SQLite] SQL type:`, typeof sql)
    console.error(`[SQLite] SQL content (first 200 chars):`, String(sql).substring(0, 200))
    throw error
  }
}

/**
 * Begin a transaction
 * @param {string} dbName - Database name
 */
export async function beginTransaction(dbName) {
  return await execute(dbName, 'BEGIN TRANSACTION')
}

/**
 * Commit a transaction
 * @param {string} dbName - Database name
 */
export async function commit(dbName) {
  return await execute(dbName, 'COMMIT')
}

/**
 * Rollback a transaction
 * @param {string} dbName - Database name
 */
export async function rollback(dbName) {
  return await execute(dbName, 'ROLLBACK')
}

/**
 * Execute a transaction (convenience function)
 *
 * @param {string} dbName - Database name
 * @param {Function} callback - Operations within the transaction (async function)
 */
export async function executeTransaction(dbName, callback) {
  try {
    await beginTransaction(dbName)
    await callback()
    await commit(dbName)
  } catch (error) {
    await rollback(dbName)
    throw error
  }
}

/**
 * Get PRAGMA value
 * @param {string} dbName - Database name
 * @param {string} pragmaName - PRAGMA name
 * @returns {Promise<*>} PRAGMA value
 */
export async function pragma(dbName, pragmaName) {
  const result = await getOne(dbName, `PRAGMA ${pragmaName}`)
  if (result) {
    const key = Object.keys(result)[0]
    return result[key]
  }
  return null
}

/**
 * Set PRAGMA value
 * @param {string} dbName - Database name
 * @param {string} pragmaName - PRAGMA name
 * @param {*} value - PRAGMA value
 */
export async function setPragma(dbName, pragmaName, value) {
  return await execute(dbName, `PRAGMA ${pragmaName} = ${value}`)
}

/**
 * Close all database connections
 */
export async function closeAll() {
  try {
    // Get all connection names from plugin's internal dictionary
    const allConnections = await sqlite.getConnectionOptions()

    for (const connName of allConnections) {
      // Connection names are in format "RW_dbname" or "RO_dbname"
      const dbName = connName.replace(/^(RW_|RO_)/, '')
      await closeDatabase(dbName)
    }
  } catch (error) {
    console.error('[SQLite] Failed to close all connections:', error)
  }
}
