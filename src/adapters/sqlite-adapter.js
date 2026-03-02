// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite'

/**
 * SQLite Adapter for Capacitor
 * Provides an interface similar to better-sqlite3
 */
class SQLiteAdapter {
  constructor() {
    this.sqlite = new SQLiteConnection(CapacitorSQLite)
    this.connections = new Map() // Stores opened database connections
  }

  /**
   * Open or create a database
   * @param {string} dbName - Database name
   * @param {string} location - Database location ('default' or others)
   * @returns {Promise<Object>} Database connection object
   */
  async openDatabase(dbName, location = 'default') {
    if (this.connections.has(dbName)) {
      return this.connections.get(dbName)
    }

    try {
      const db = await this.sqlite.createConnection(
        dbName,
        false, // encrypted
        'no-encryption', // mode
        1, // version
        false // readonly
      )

      await db.open()
      this.connections.set(dbName, db)
      console.log(`[SQLite] Opened database: ${dbName}`)
      return db
    } catch (error) {
      console.error(`[SQLite] Failed to open database ${dbName}:`, error)
      throw error
    }
  }

  /**
   * Close a database connection
   */
  async closeDatabase(dbName) {
    const db = this.connections.get(dbName)
    if (db) {
      try {
        await db.close()
        this.connections.delete(dbName)
        console.log(`[SQLite] Closed database: ${dbName}`)
      } catch (error) {
        console.error(`[SQLite] Failed to close database ${dbName}:`, error)
      }
    }
  }

  /**
   * Execute a query and return a single row result
   * Equivalent to better-sqlite3's prepare().get()
   */
  async getOne(dbName, sql, params = []) {
    const db = await this.openDatabase(dbName)
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
   */
  async getAll(dbName, sql, params = []) {
    const db = await this.openDatabase(dbName)
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
   */
  async run(dbName, sql, params = []) {
    const db = await this.openDatabase(dbName)
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
   */
  async execute(dbName, sql) {
    const db = await this.openDatabase(dbName)
    try {
      const result = await db.execute(sql)
      return result
    } catch (error) {
      console.error(`[SQLite] Execute error:`, error)
      throw error
    }
  }

  /**
   * Begin a transaction
   */
  async beginTransaction(dbName) {
    return await this.execute(dbName, 'BEGIN TRANSACTION')
  }

  /**
   * Commit a transaction
   */
  async commit(dbName) {
    return await this.execute(dbName, 'COMMIT')
  }

  /**
   * Rollback a transaction
   */
  async rollback(dbName) {
    return await this.execute(dbName, 'ROLLBACK')
  }

  /**
   * Execute a transaction (convenience method)
   * @param {string} dbName - Database name
   * @param {Function} callback - Operations within the transaction (async function)
   */
  async executeTransaction(dbName, callback) {
    try {
      await this.beginTransaction(dbName)
      await callback()
      await this.commit(dbName)
    } catch (error) {
      await this.rollback(dbName)
      throw error
    }
  }

  /**
   * Get PRAGMA value
   */
  async pragma(dbName, pragmaName) {
    const result = await this.getOne(dbName, `PRAGMA ${pragmaName}`)
    if (result) {
      const key = Object.keys(result)[0]
      return result[key]
    }
    return null
  }

  /**
   * Set PRAGMA value
   */
  async setPragma(dbName, pragmaName, value) {
    return await this.execute(dbName, `PRAGMA ${pragmaName} = ${value}`)
  }

  /**
   * Close all database connections
   */
  async closeAll() {
    for (const dbName of this.connections.keys()) {
      await this.closeDatabase(dbName)
    }
  }
}

// Export singleton
export const sqliteAdapter = new SQLiteAdapter()
