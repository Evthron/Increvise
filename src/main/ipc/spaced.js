// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Spaced Repetition IPC Handlers
import path from 'node:path'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import Database from 'better-sqlite3'
import { getWorkspaceDbPath } from '../db/index.js'
import { insertInitialData } from '../db/insert-initial-data.js'
import { migrate } from '../db/migration-workspace.js'

async function createDatabase(folderPath, getCentralDbPath) {
  try {
    const increviseFolder = path.join(folderPath, '.increvise')
    const dbFilePath = path.join(increviseFolder, 'db.sqlite')
    await fs.mkdir(increviseFolder, { recursive: true })

    // Check if database already exists
    try {
      await fs.access(dbFilePath)
      // Database exists, get its library_id
      const db = new Database(dbFilePath, { readonly: true })
      const library = db.prepare('SELECT library_id FROM library LIMIT 1').get()
      db.close()

      if (library) {
        return { success: true, path: dbFilePath, libraryId: library.library_id }
      }
    } catch {
      // Database file exists but couldn't read library_id, will create new
    }

    try {
      // Create and initialize the database
      const db = new Database(dbFilePath)

      // Step 1: Run migrations to create latest schema
      await migrate(db, dbFilePath)

      // Step 2: Insert initial business data
      const libraryId = crypto.randomUUID()
      const libraryName = path.basename(folderPath)
      insertInitialData(db, libraryId, libraryName)

      db.close()

      // Register in central database
      try {
        const centralDbPath = getCentralDbPath()
        const centralDb = new Database(centralDbPath)
        centralDb
          .prepare(
            `INSERT OR REPLACE INTO workspace_history 
             (library_id, folder_path, folder_name, db_path, last_opened, open_count)
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 1)`
          )
          .run(libraryId, folderPath, libraryName, dbFilePath)
        centralDb.close()
      } catch (err) {
        console.error('Failed to register workspace in central database:', err)
        // Continue anyway - database is created successfully
      }

      return { success: true, path: dbFilePath, libraryId }
    } catch (err) {
      return { success: false, error: err.message }
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

async function checkFileInQueue(filePath, libraryId, getCentralDbPath) {
  try {
    const dbInfo = await getWorkspaceDbPath(libraryId, getCentralDbPath)
    if (!dbInfo.found) {
      return { inQueue: false, error: dbInfo.error || 'Database not found' }
    }
    try {
      const db = new Database(dbInfo.dbPath)
      const relativePath = path.relative(dbInfo.folderPath, filePath)
      const { exists_flag } = db
        .prepare(
          'SELECT EXISTS ( SELECT 1 FROM file WHERE library_id = ? AND relative_path = ? ) AS exists_flag'
        )
        .get(libraryId, relativePath)
      const exists = exists_flag === 1
      db.close()
      return { inQueue: exists }
    } catch (err) {
      return { inQueue: false, error: err.message }
    }
  } catch (error) {
    return { inQueue: false, error: error.message }
  }
}

async function addFileToQueue(filePath, libraryId, getCentralDbPath) {
  try {
    const dbInfo = await getWorkspaceDbPath(libraryId, getCentralDbPath)
    if (!dbInfo.found) {
      return { success: false, error: dbInfo.error || 'Database not found' }
    }
    try {
      const db = new Database(dbInfo.dbPath)
      const relativePath = path.relative(dbInfo.folderPath, filePath)

      const { exists_flag } = db
        .prepare(
          'SELECT EXISTS ( SELECT 1 FROM file WHERE library_id = ? AND relative_path = ? ) AS exists_flag'
        )
        .get(libraryId, relativePath)
      const exists = exists_flag === 1
      if (exists) {
        db.close()
        return { success: false, error: 'File already in queue', alreadyExists: true }
      }

      db.prepare(
        `INSERT INTO file (library_id, relative_path, added_time, review_count, easiness, rank, due_time)
          VALUES (?, ?, datetime('now'), 0, 2.5, 70.0, datetime('now'))`
      ).run(libraryId, relativePath)

      // Add to new queue by default
      db.prepare(
        `INSERT INTO queue_membership (library_id, queue_name, relative_path)
          VALUES (?, 'new', ?)`
      ).run(libraryId, relativePath)

      db.close()
      return { success: true, message: 'File added to new queue' }
    } catch (err) {
      return { success: false, error: err.message }
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

async function getFilesForRevision(rootPath) {
  // Get all the increvise database under the specfied rootPath
  try {
    const findDatabases = async (dir) => {
      const databases = []
      try {
        const items = await fs.readdir(dir, { withFileTypes: true })
        for (const item of items) {
          const fullPath = path.join(dir, item.name)
          if (item.isDirectory()) {
            if (item.name === '.increvise') {
              const dbFile = path.join(fullPath, 'db.sqlite')
              try {
                await fs.access(dbFile)
                databases.push(dbFile)
              } catch {
                console.warn("db.sqlite file doesn't exist in this .increvise folder")
              }
            } else {
              databases.push(...(await findDatabases(fullPath)))
            }
          }
        }
      } catch (err) {
        // Skip directories with permission errors or other access issues
        if (err.code === 'EACCES' || err.code === 'EPERM') {
          console.warn(`Skipping directory due to permission denied: ${dir}`)
        } else {
          console.warn(`Error reading directory ${dir}:`, err.message)
        }
      }
      return databases
    }
    console.log('Finding databases under:', rootPath)
    const dbPaths = await findDatabases(rootPath)
    const allFiles = []
    for (const dbPath of dbPaths) {
      try {
        const db = new Database(dbPath, { readonly: true })
        const dbRootPath = path.dirname(path.dirname(dbPath)) // Remove .increvise/db.sqlite
        console.log('Reading database at:', dbPath)
        const rows = db
          .prepare(
            `
            SELECT f.*, qm.queue_name
            FROM file f
            JOIN queue_membership qm ON f.library_id = qm.library_id AND f.relative_path = qm.relative_path
            WHERE date(f.due_time) <= date('now')
            ORDER BY date(f.due_time) ASC, f.rank ASC
          `
          )
          .all()
        allFiles.push(
          ...rows.map((row) => ({
            ...row,
            file_path: path.join(dbRootPath, row.relative_path),
            dbPath,
            workspacePath: dbRootPath,
          }))
        )
        db.close()
      } catch (err) {
        console.warn('Failed to read from this database, skip it')
      }
    }
    return { success: true, files: allFiles }
  } catch (error) {
    console.warn('Failed to read from this database, skip it')
    return { success: false, error: error.message, files: [] }
  }
}

async function getFilesIncludingFuture(rootPath) {
  // Get all files from databases under the specified rootPath (including future due dates)
  try {
    const findDatabases = async (dir) => {
      const databases = []
      try {
        const items = await fs.readdir(dir, { withFileTypes: true })
        for (const item of items) {
          const fullPath = path.join(dir, item.name)
          if (item.isDirectory()) {
            if (item.name === '.increvise') {
              const dbFile = path.join(fullPath, 'db.sqlite')
              try {
                await fs.access(dbFile)
                databases.push(dbFile)
              } catch {
                // db.sqlite file doesn't exist in this .increvise folder
              }
            } else {
              databases.push(...(await findDatabases(fullPath)))
            }
          }
        }
      } catch (err) {
        // Skip directories with permission errors or other access issues
        if (err.code === 'EACCES' || err.code === 'EPERM') {
          console.warn(`Skipping directory due to permission denied: ${dir}`)
        } else {
          console.warn(`Error reading directory ${dir}:`, err.message)
        }
      }
      return databases
    }
    const dbPaths = await findDatabases(rootPath)
    const allFiles = []
    for (const dbPath of dbPaths) {
      try {
        const db = new Database(dbPath, { readonly: true })
        const dbRootPath = path.dirname(path.dirname(dbPath)) // Remove .increvise/db.sqlite
        const rows = db
          .prepare(
            `
            SELECT f.*, qm.queue_name
            FROM file f
            JOIN queue_membership qm ON f.library_id = qm.library_id AND f.relative_path = qm.relative_path
            WHERE qm.queue_name != 'archived'
            ORDER BY f.due_time ASC, f.rank ASC
          `
          )
          .all()
        allFiles.push(
          ...rows.map((row) => ({
            ...row,
            file_path: path.join(dbRootPath, row.relative_path),
            dbPath,
            workspacePath: dbRootPath,
          }))
        )
        db.close()
      } catch {
        // Failed to read from this database, skip it
      }
    }
    return { success: true, files: allFiles }
  } catch (error) {
    return { success: false, error: error.message, files: [] }
  }
}

async function getAllFilesForRevision(getCentralDbPath) {
  try {
    const centralDbPath = getCentralDbPath()
    let workspaces = []
    try {
      const db = new Database(centralDbPath, { readonly: true })
      workspaces = db
        .prepare('SELECT folder_path, db_path FROM workspace_history ORDER BY last_opened DESC')
        .all()
      db.close()
    } catch (err) {
      return { success: false, error: err.message, files: [] }
    }
    const allFiles = []
    for (const workspace of workspaces) {
      try {
        await fs.access(workspace.db_path)
      } catch {
        continue
      }
      try {
        const db = new Database(workspace.db_path, { readonly: true })
        const libraryId = db.prepare('SELECT library_id FROM library LIMIT 1').get().library_id

        // Get max_per_day config
        const maxNewConfig = db
          .prepare(
            "SELECT config_value FROM queue_config WHERE library_id = ? AND queue_name = 'new' AND config_key = 'max_per_day'"
          )
          .get(libraryId)
        const maxNewPerDay = maxNewConfig ? parseInt(maxNewConfig.config_value) : 10

        // Get new queue items (FIFO)
        const newItems = db
          .prepare(
            `
            SELECT f.*, qm.queue_name
            FROM file f
            JOIN queue_membership qm ON f.library_id = qm.library_id AND f.relative_path = qm.relative_path
            WHERE qm.queue_name = 'new' AND f.library_id = ?
            ORDER BY f.added_time ASC
            LIMIT ?
          `
          )
          .all(libraryId, maxNewPerDay)

        // Get processing queue items (due today)
        const processingItems = db
          .prepare(
            `
            SELECT f.*, qm.queue_name
            FROM file f
            JOIN queue_membership qm ON f.library_id = qm.library_id AND f.relative_path = qm.relative_path
            WHERE qm.queue_name = 'processing' 
              AND f.library_id = ?
              AND date(f.due_time) <= date('now')
            ORDER BY f.due_time ASC, f.rank ASC
          `
          )
          .all(libraryId)

        // Get intermediate queue items (due today)
        const intermediateItems = db
          .prepare(
            `
            SELECT f.*, qm.queue_name
            FROM file f
            JOIN queue_membership qm ON f.library_id = qm.library_id AND f.relative_path = qm.relative_path
            WHERE qm.queue_name = 'intermediate'
              AND f.library_id = ?
              AND date(f.due_time) <= date('now')
            ORDER BY f.due_time ASC, f.rank ASC
          `
          )
          .all(libraryId)

        // Get spaced queue items (due today) - all three sub-queues
        const spacedItems = db
          .prepare(
            `
            SELECT f.*, qm.queue_name
            FROM file f
            JOIN queue_membership qm ON f.library_id = qm.library_id AND f.relative_path = qm.relative_path
            WHERE qm.queue_name IN ('spaced-casual', 'spaced-standard', 'spaced-strict')
              AND f.library_id = ?
              AND date(f.due_time) <= date('now')
            ORDER BY f.due_time ASC, f.rank ASC
          `
          )
          .all(libraryId)

        // Combine all items
        const workspaceFiles = [
          ...newItems,
          ...processingItems,
          ...intermediateItems,
          ...spacedItems,
        ]

        allFiles.push(
          ...workspaceFiles.map((row) => ({
            ...row,
            file_path: path.join(workspace.folder_path, row.relative_path),
            dbPath: workspace.db_path,
            workspacePath: workspace.folder_path,
          }))
        )
        db.close()
      } catch (err) {
        console.error('Error processing workspace:', err)
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

    return { success: true, files: allFiles }
  } catch (error) {
    return { success: false, error: error.message, files: [] }
  }
}

async function getAllFilesIncludingFuture(getCentralDbPath) {
  try {
    const centralDbPath = getCentralDbPath()
    let workspaces = []
    try {
      const db = new Database(centralDbPath, { readonly: true })
      workspaces = db
        .prepare('SELECT folder_path, db_path FROM workspace_history ORDER BY last_opened DESC')
        .all()
      db.close()
    } catch (err) {
      return { success: false, error: err.message, files: [] }
    }
    const allFiles = []
    for (const workspace of workspaces) {
      try {
        await fs.access(workspace.db_path)
      } catch {
        console.error(workspace.db_path, 'is not accessible, skip it')
        continue
      }
      try {
        const db = new Database(workspace.db_path, { readonly: true })
        const libraryId = db.prepare('SELECT library_id FROM library LIMIT 1').get().library_id

        // Get ALL files from all queues (no date filtering except archived)
        const allItems = db
          .prepare(
            `
            SELECT f.*, qm.queue_name
            FROM file f
            JOIN queue_membership qm ON f.library_id = qm.library_id AND f.relative_path = qm.relative_path
            WHERE f.library_id = ? AND qm.queue_name != 'archived'
            ORDER BY f.due_time ASC, f.rank ASC
          `
          )
          .all(libraryId)

        allFiles.push(
          ...allItems.map((row) => ({
            ...row,
            file_path: path.join(workspace.folder_path, row.relative_path),
            dbPath: workspace.db_path,
            workspacePath: workspace.folder_path,
          }))
        )
        db.close()
      } catch (err) {
        console.error('Error processing workspace:', err)
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

    return { success: true, files: allFiles }
  } catch (error) {
    return { success: false, error: error.message, files: [] }
  }
}

async function updateRevisionFeedback(dbPath, libraryId, relativePath, feedback) {
  try {
    const db = new Database(dbPath)

    // 1. Get file's current queue
    const queueInfo = db
      .prepare('SELECT queue_name FROM queue_membership WHERE library_id = ? AND relative_path = ?')
      .get(libraryId, relativePath)

    db.close()

    if (!queueInfo) {
      return { success: false, error: 'File not in any queue' }
    }

    // 2. Route to appropriate queue handler
    const queueName = queueInfo.queue_name

    if (queueName === 'new') {
      return await handleNewQueueFeedback(dbPath, libraryId, relativePath, feedback)
    } else if (queueName === 'processing') {
      return await handleProcessingFeedback(dbPath, libraryId, relativePath, feedback)
    } else if (queueName === 'intermediate') {
      return await handleIntermediateFeedback(dbPath, libraryId, relativePath, feedback)
    } else if (queueName.startsWith('spaced-')) {
      return await handleSpacedFeedback(dbPath, libraryId, relativePath, feedback, queueName)
    } else if (queueName === 'archived') {
      return { success: false, error: 'Cannot review archived files' }
    } else {
      return { success: false, error: `Unknown queue: ${queueName}` }
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

// ========================================
// Spaced Queue Feedback Handler (SM-2)
// ========================================
async function handleSpacedFeedback(dbPath, libraryId, relativePath, feedback, queueName) {
  try {
    const db = new Database(dbPath)

    // 1. Load queue configuration
    const configs = db
      .prepare(
        'SELECT config_key, config_value FROM queue_config WHERE library_id = ? AND queue_name = ?'
      )
      .all(libraryId, queueName)

    const params = {}
    configs.forEach((c) => (params[c.config_key] = parseFloat(c.config_value)))

    // 2. Get file's current state
    const file = db
      .prepare(
        'SELECT review_count, interval, easiness, rank FROM file WHERE library_id = ? AND relative_path = ?'
      )
      .get(libraryId, relativePath)

    if (!file) {
      db.close()
      return { success: false, error: 'File not found' }
    }

    // 3. Apply SM-2 algorithm with queue-specific parameters
    const response_quality = { again: 0, hard: 1, good: 4, easy: 5 }
    const q = response_quality[feedback]

    if (q === undefined) {
      db.close()
      return { success: false, error: 'Invalid feedback value' }
    }

    const easiness_update = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)

    let newEasiness, newRank, newInterval

    // Check if failed (below threshold)
    if (q < params.fail_threshold) {
      // Failed: reset interval but keep EF
      newInterval = 1
      newEasiness = file.easiness
      newRank = file.rank
    } else {
      // Passed: update EF and calculate new interval
      newEasiness = Math.max(
        params.min_ef,
        Math.min(params.max_ef, file.easiness + easiness_update)
      )
      // Naively adjust rank based on feedback. This can be further refined
      newRank = file.rank + q

      if (file.review_count === 0) {
        newInterval = params.first_interval
      } else if (file.review_count === 1) {
        newInterval = params.second_interval
      } else {
        newInterval = Math.floor(file.interval * newEasiness)
      }
    }

    // 4. Update database
    const stmt = db.prepare(`
      UPDATE file
      SET last_revised_time = datetime('now'),
          review_count = review_count + 1,
          easiness = ?,
          interval = ?,
          due_time = datetime('now', '+' || ? || ' days'),
          rank = ?
      WHERE library_id = ? AND relative_path = ?
    `)
    const info = stmt.run(newEasiness, newInterval, newInterval, newRank, libraryId, relativePath)
    db.close()

    return {
      success: true,
      message: `Next review in ${newInterval} day(s)`,
      changes: info.changes,
      queueName: queueName,
      appliedParams: {
        initial_ef: params.initial_ef,
        min_ef: params.min_ef,
        max_ef: params.max_ef,
        fail_threshold: params.fail_threshold,
      },
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

async function forgetFile(filePath, libraryId, getCentralDbPath) {
  try {
    const dbInfo = await getWorkspaceDbPath(libraryId, getCentralDbPath)
    if (!dbInfo.found) {
      return { success: false, error: dbInfo.error || 'Database not found' }
    }
    try {
      const db = new Database(dbInfo.dbPath)
      const relativePath = path.relative(dbInfo.folderPath, filePath)

      // Check if file exists in database
      const { exists_flag } = db
        .prepare(
          'SELECT EXISTS ( SELECT 1 FROM file WHERE library_id = ? AND relative_path = ? ) AS exists_flag'
        )
        .get(libraryId, relativePath)
      const exists = exists_flag === 1
      if (!exists) {
        db.close()
        return { success: false, error: 'File not found in database' }
      }

      // Delete all revision data from note_source table
      const deleteNoteSource = db.prepare(
        'DELETE FROM note_source WHERE library_id = ? AND relative_path = ?'
      )
      const noteSourceResult = deleteNoteSource.run(libraryId, relativePath)

      // Reset spaced repetition data in file table
      const resetFile = db.prepare(`
        UPDATE file
        SET last_revised_time = NULL,
            review_count = 0,
            easiness = 2.5,
            rank = 70.0,
            interval = 1,
            due_time = datetime('now')
        WHERE library_id = ? AND relative_path = ?
      `)
      const fileResult = resetFile.run(libraryId, relativePath)

      db.close()
      return {
        success: true,
        message: 'File revision data erased, but entry kept in database',
        deletedRevisions: noteSourceResult.changes,
        updatedFile: fileResult.changes > 0,
        resetValues: {
          last_revised_time: null,
          review_count: 0,
          easiness: 2.5,
          rank: 70.0,
          interval: 1,
          due_time: new Date().toISOString(),
        },
      }
    } catch (err) {
      return { success: false, error: err.message }
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

async function updateFileRank(filePath, libraryId, newRank, getCentralDbPath) {
  try {
    const dbInfo = await getWorkspaceDbPath(libraryId, getCentralDbPath)
    if (!dbInfo.found) {
      return { success: false, error: dbInfo.error || 'Database not found' }
    }
    try {
      const db = new Database(dbInfo.dbPath)
      const relativePath = path.relative(dbInfo.folderPath, filePath)

      const { exists_flag } = db
        .prepare(
          'SELECT EXISTS ( SELECT 1 FROM file WHERE library_id = ? AND relative_path = ? ) AS exists_flag'
        )
        .get(libraryId, relativePath)
      const exists = exists_flag === 1
      if (!exists) {
        db.close()
        return { success: false, error: 'File not found in database' }
      }

      const stmt = db.prepare(`
        UPDATE file
        SET rank = ?
        WHERE library_id = ? AND relative_path = ?
      `)
      const info = stmt.run(newRank, libraryId, relativePath)
      db.close()

      return {
        success: true,
        message: 'Rank updated successfully',
        changes: info.changes,
      }
    } catch (err) {
      return { success: false, error: err.message }
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// ========================================
// Migration Functions
// ========================================

async function migrateSpacedQueue(libraryId, getCentralDbPath) {
  try {
    const dbInfo = await getWorkspaceDbPath(libraryId, getCentralDbPath)
    if (!dbInfo.found) {
      return { success: false, error: dbInfo.error || 'Database not found' }
    }
    try {
      const db = new Database(dbInfo.dbPath)

      // Check if old 'spaced' queue exists
      const oldQueue = db
        .prepare(
          "SELECT COUNT(*) as count FROM review_queue WHERE library_id = ? AND queue_name = 'spaced'"
        )
        .get(libraryId)

      if (oldQueue && oldQueue.count > 0) {
        // 1. Create new sub-queues (if not exist)
        const insertQueue = db.prepare(
          'INSERT OR IGNORE INTO review_queue (library_id, queue_name, description) VALUES (?, ?, ?)'
        )
        insertQueue.run(libraryId, 'spaced-casual', 'Spaced Repetition (Casual): ~80% retention')
        insertQueue.run(
          libraryId,
          'spaced-standard',
          'Spaced Repetition (Standard): ~90% retention'
        )
        insertQueue.run(libraryId, 'spaced-strict', 'Spaced Repetition (Strict): ~95% retention')

        // 2. Add configurations for new queues
        const insertConfig = db.prepare(
          'INSERT OR IGNORE INTO queue_config (library_id, queue_name, config_key, config_value) VALUES (?, ?, ?, ?)'
        )

        // Spaced-Casual configs
        insertConfig.run(libraryId, 'spaced-casual', 'initial_ef', '2.0')
        insertConfig.run(libraryId, 'spaced-casual', 'min_ef', '1.2')
        insertConfig.run(libraryId, 'spaced-casual', 'max_ef', '2.5')
        insertConfig.run(libraryId, 'spaced-casual', 'first_interval', '1')
        insertConfig.run(libraryId, 'spaced-casual', 'second_interval', '4')
        insertConfig.run(libraryId, 'spaced-casual', 'fail_threshold', '2')

        // Spaced-Standard configs
        insertConfig.run(libraryId, 'spaced-standard', 'initial_ef', '2.5')
        insertConfig.run(libraryId, 'spaced-standard', 'min_ef', '1.3')
        insertConfig.run(libraryId, 'spaced-standard', 'max_ef', '2.5')
        insertConfig.run(libraryId, 'spaced-standard', 'first_interval', '1')
        insertConfig.run(libraryId, 'spaced-standard', 'second_interval', '6')
        insertConfig.run(libraryId, 'spaced-standard', 'fail_threshold', '2')

        // Spaced-Strict configs
        insertConfig.run(libraryId, 'spaced-strict', 'initial_ef', '2.8')
        insertConfig.run(libraryId, 'spaced-strict', 'min_ef', '1.5')
        insertConfig.run(libraryId, 'spaced-strict', 'max_ef', '3.0')
        insertConfig.run(libraryId, 'spaced-strict', 'first_interval', '1')
        insertConfig.run(libraryId, 'spaced-strict', 'second_interval', '8')
        insertConfig.run(libraryId, 'spaced-strict', 'fail_threshold', '3')

        // 3. Migrate files from old 'spaced' queue to 'spaced-standard' (default)
        const migrateResult = db
          .prepare(
            `UPDATE queue_membership 
           SET queue_name = 'spaced-standard' 
           WHERE library_id = ? AND queue_name = 'spaced'`
          )
          .run(libraryId)

        // 4. Delete old 'spaced' queue
        db.prepare("DELETE FROM review_queue WHERE library_id = ? AND queue_name = 'spaced'").run(
          libraryId
        )

        // 5. Delete old 'spaced' queue configs (if any)
        db.prepare("DELETE FROM queue_config WHERE library_id = ? AND queue_name = 'spaced'").run(
          libraryId
        )

        db.close()
        return {
          success: true,
          message: 'Migration completed successfully',
          filesMigrated: migrateResult.changes,
        }
      }

      db.close()
      return { success: true, message: 'No migration needed - already using new queue structure' }
    } catch (err) {
      return { success: false, error: err.message }
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// ========================================
// Queue Management Functions
// ========================================

async function getQueueConfig(libraryId, queueName, configKey, getCentralDbPath) {
  try {
    const dbInfo = await getWorkspaceDbPath(libraryId, getCentralDbPath)
    if (!dbInfo.found) {
      return { success: false, error: dbInfo.error || 'Database not found' }
    }
    try {
      const db = new Database(dbInfo.dbPath)
      const config = db
        .prepare(
          'SELECT config_value FROM queue_config WHERE library_id = ? AND queue_name = ? AND config_key = ?'
        )
        .get(libraryId, queueName, configKey)
      db.close()

      if (config) {
        return { success: true, value: config.config_value }
      } else {
        return { success: false, error: 'Config not found' }
      }
    } catch (err) {
      return { success: false, error: err.message }
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

async function setQueueConfig(libraryId, queueName, configKey, configValue, getCentralDbPath) {
  try {
    const dbInfo = await getWorkspaceDbPath(libraryId, getCentralDbPath)
    if (!dbInfo.found) {
      return { success: false, error: dbInfo.error || 'Database not found' }
    }
    try {
      const db = new Database(dbInfo.dbPath)
      db.prepare(
        `INSERT OR REPLACE INTO queue_config (library_id, queue_name, config_key, config_value)
         VALUES (?, ?, ?, ?)`
      ).run(libraryId, queueName, configKey, configValue)
      db.close()
      return { success: true, message: 'Config updated' }
    } catch (err) {
      return { success: false, error: err.message }
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

async function getFileQueue(filePath, libraryId, getCentralDbPath) {
  try {
    const dbInfo = await getWorkspaceDbPath(libraryId, getCentralDbPath)
    if (!dbInfo.found) {
      return { success: false, error: dbInfo.error || 'Database not found' }
    }
    try {
      const db = new Database(dbInfo.dbPath)
      const relativePath = path.relative(dbInfo.folderPath, filePath)
      const membership = db
        .prepare(
          'SELECT queue_name FROM queue_membership WHERE library_id = ? AND relative_path = ?'
        )
        .get(libraryId, relativePath)
      db.close()

      if (membership) {
        return { success: true, queueName: membership.queue_name }
      } else {
        return { success: false, error: 'File not in any queue' }
      }
    } catch (err) {
      return { success: false, error: err.message }
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

async function moveFileToQueue(filePath, libraryId, targetQueue, getCentralDbPath) {
  try {
    const dbInfo = await getWorkspaceDbPath(libraryId, getCentralDbPath)
    if (!dbInfo.found) {
      return { success: false, error: dbInfo.error || 'Database not found' }
    }
    try {
      const db = new Database(dbInfo.dbPath)
      const relativePath = path.relative(dbInfo.folderPath, filePath)

      // Update queue membership
      db.prepare(
        `INSERT OR REPLACE INTO queue_membership (library_id, queue_name, relative_path)
         VALUES (?, ?, ?)`
      ).run(libraryId, targetQueue, relativePath)

      // Update last_queue_change timestamp
      db.prepare(
        "UPDATE file SET last_queue_change = datetime('now') WHERE library_id = ? AND relative_path = ?"
      ).run(libraryId, relativePath)

      // Set appropriate parameters based on target queue
      if (targetQueue === 'intermediate') {
        // Get default interval from config
        const defaultIntervalConfig = db
          .prepare(
            "SELECT config_value FROM queue_config WHERE library_id = ? AND queue_name = 'intermediate' AND config_key = 'default_base'"
          )
          .get(libraryId)
        const defaultInterval = defaultIntervalConfig
          ? parseInt(defaultIntervalConfig.config_value)
          : 7

        db.prepare(
          `UPDATE file SET intermediate_interval = ?, due_time = datetime('now')
           WHERE library_id = ? AND relative_path = ?`
        ).run(defaultInterval, libraryId, relativePath)
      } else if (targetQueue.startsWith('spaced-')) {
        // Get initial EF from queue config
        const queueConfig = db
          .prepare(
            "SELECT config_value FROM queue_config WHERE library_id = ? AND queue_name = ? AND config_key = 'initial_ef'"
          )
          .get(libraryId, targetQueue)

        const initialEF = queueConfig ? parseFloat(queueConfig.config_value) : 2.5

        db.prepare(
          `UPDATE file SET easiness = ?, review_count = 0, interval = 1, due_time = datetime('now')
           WHERE library_id = ? AND relative_path = ?`
        ).run(initialEF, libraryId, relativePath)
      } else if (targetQueue === 'archived') {
        db.prepare(
          `UPDATE file SET due_time = datetime('now', '+9999 days')
           WHERE library_id = ? AND relative_path = ?`
        ).run(libraryId, relativePath)
      } else if (targetQueue === 'processing') {
        const rotationInterval = db
          .prepare('SELECT rotation_interval FROM file WHERE library_id = ? AND relative_path = ?')
          .get(libraryId, relativePath).rotation_interval
        db.prepare(
          `UPDATE file SET due_time = datetime('now', '+' || ? || ' days')
           WHERE library_id = ? AND relative_path = ?`
        ).run(rotationInterval, libraryId, relativePath)
      }

      db.close()
      return { success: true, message: `File moved to ${targetQueue} queue` }
    } catch (err) {
      return { success: false, error: err.message }
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

async function handleExtraction(parentPath, childPath, libraryId, getCentralDbPath) {
  try {
    const dbInfo = await getWorkspaceDbPath(libraryId, getCentralDbPath)
    if (!dbInfo.found) {
      return { success: false, error: dbInfo.error || 'Database not found' }
    }
    try {
      const db = new Database(dbInfo.dbPath)
      const parentRelPath = path.relative(dbInfo.folderPath, parentPath)
      const childRelPath = path.relative(dbInfo.folderPath, childPath)

      // Get parent file info
      const parent = db
        .prepare('SELECT rank FROM file WHERE library_id = ? AND relative_path = ?')
        .get(libraryId, parentRelPath)

      if (!parent) {
        db.close()
        return { success: false, error: 'Parent file not found' }
      }

      // Get rank penalty from config
      const config = db
        .prepare(
          "SELECT config_value FROM queue_config WHERE library_id = ? AND queue_name = 'global' AND config_key = 'rank_penalty'"
        )
        .get(libraryId)
      const rankPenalty = config ? parseInt(config.config_value) : 5

      // Update parent: increase rank (lower priority) and increment extraction count
      db.prepare(
        `UPDATE file 
         SET rank = rank + ?, extraction_count = extraction_count + 1
         WHERE library_id = ? AND relative_path = ?`
      ).run(rankPenalty, libraryId, parentRelPath)

      // Get default interval for intermediate queue
      const defaultIntervalConfig = db
        .prepare(
          "SELECT config_value FROM queue_config WHERE library_id = ? AND queue_name = 'intermediate' AND config_key = 'default_base'"
        )
        .get(libraryId)
      const defaultInterval = defaultIntervalConfig
        ? parseInt(defaultIntervalConfig.config_value)
        : 7

      // Create child file entry (inherit parent rank, set default intermediate interval)
      db.prepare(
        `INSERT INTO file (library_id, relative_path, added_time, rank, due_time, intermediate_interval)
         VALUES (?, ?, datetime('now'), ?, datetime('now'), ?)`
      ).run(libraryId, childRelPath, parent.rank, defaultInterval)

      // Add child to intermediate queue
      db.prepare(
        `INSERT INTO queue_membership (library_id, queue_name, relative_path)
         VALUES (?, 'intermediate', ?)`
      ).run(libraryId, childRelPath)

      db.close()
      return {
        success: true,
        message: 'Extraction recorded',
        childQueue: 'intermediate',
        parentRankPenalty: rankPenalty,
      }
    } catch (err) {
      return { success: false, error: err.message }
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// ========================================
// Queue-Specific Feedback Handlers
// ========================================

async function handleNewQueueFeedback(dbPath, libraryId, relativePath, feedback) {
  // New queue: 'skip' stays in new queue (tomorrow), 'viewed' moves to processing queue
  try {
    const db = new Database(dbPath)

    if (feedback === 'skip') {
      // Skip: stay in new queue, appear tomorrow
      db.prepare(
        `UPDATE file 
         SET due_time = datetime('now', '+1 day'),
             last_revised_time = datetime('now')
         WHERE library_id = ? AND relative_path = ?`
      ).run(libraryId, relativePath)

      db.close()
      return {
        success: true,
        message: 'File skipped, will appear tomorrow in new queue',
        queueName: 'new',
      }
    } else {
      // Viewed (or any other feedback): move to processing queue
      db.prepare(
        `UPDATE queue_membership SET queue_name = 'processing'
         WHERE library_id = ? AND relative_path = ?`
      ).run(libraryId, relativePath)

      // Set due time based on rotation interval
      const file = db
        .prepare('SELECT rotation_interval FROM file WHERE library_id = ? AND relative_path = ?')
        .get(libraryId, relativePath)

      db.prepare(
        `UPDATE file 
         SET due_time = datetime('now', '+' || ? || ' days'),
             last_queue_change = datetime('now')
         WHERE library_id = ? AND relative_path = ?`
      ).run(file.rotation_interval, libraryId, relativePath)

      db.close()
      return { success: true, message: 'Moved to processing queue', queueName: 'processing' }
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

async function handleProcessingFeedback(dbPath, libraryId, relativePath, feedback) {
  // feedback: 'skip' (tomorrow), 'viewed' (rotate), 'again' (immediate - legacy)
  try {
    const db = new Database(dbPath)
    const file = db
      .prepare('SELECT rotation_interval FROM file WHERE library_id = ? AND relative_path = ?')
      .get(libraryId, relativePath)

    let updateQuery, updateParams, message
    if (feedback === 'skip') {
      // Skip: appear tomorrow (exactly 1 day later)
      updateQuery = `UPDATE file 
                     SET due_time = datetime('now', '+1 day'), 
                         last_revised_time = datetime('now')
                     WHERE library_id = ? AND relative_path = ?`
      updateParams = [libraryId, relativePath]
      message = 'File skipped, will appear tomorrow'
    } else if (feedback === 'viewed') {
      // Viewed: follow normal rotation cycle
      updateQuery = `UPDATE file 
                     SET due_time = datetime('now', '+' || ? || ' days'), 
                         last_revised_time = datetime('now')
                     WHERE library_id = ? AND relative_path = ?`
      updateParams = [file.rotation_interval, libraryId, relativePath]
      message = `File marked as viewed, next review in ${file.rotation_interval} day(s)`
    } else if (feedback === 'again') {
      // Legacy: immediate re-review
      updateQuery = `UPDATE file 
                     SET due_time = datetime('now'), 
                         last_revised_time = datetime('now')
                     WHERE library_id = ? AND relative_path = ?`
      updateParams = [libraryId, relativePath]
      message = 'File scheduled for immediate review'
    } else {
      // Default to rotation (for backwards compatibility)
      updateQuery = `UPDATE file 
                     SET due_time = datetime('now', '+' || ? || ' days'), 
                         last_revised_time = datetime('now')
                     WHERE library_id = ? AND relative_path = ?`
      updateParams = [file.rotation_interval, libraryId, relativePath]
      message = 'Processing feedback recorded'
    }

    db.prepare(updateQuery).run(...updateParams)

    db.close()
    return { success: true, message, queueName: 'processing' }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

async function handleIntermediateFeedback(dbPath, libraryId, relativePath, feedback) {
  // feedback: 'decrease' (more often, ÷1.5), 'maintain' (same), 'increase' (less often, ×1.5)
  try {
    const db = new Database(dbPath)

    // Get current interval
    const file = db
      .prepare('SELECT intermediate_interval FROM file WHERE library_id = ? AND relative_path = ?')
      .get(libraryId, relativePath)

    if (!file) {
      db.close()
      return { success: false, error: 'File not found' }
    }

    // Get min_interval from config (default to 1)
    const minIntervalConfig = db
      .prepare(
        "SELECT config_value FROM queue_config WHERE library_id = ? AND queue_name = 'intermediate' AND config_key = 'min_interval'"
      )
      .get(libraryId)
    const minInterval = minIntervalConfig ? parseInt(minIntervalConfig.config_value) : 1

    // Calculate new interval based on feedback
    const intervalChanges = {
      decrease: 1 / 1.5, // More often: reduce interval by 33%
      maintain: 1.0, // Same: keep interval unchanged
      increase: 1.5, // Less often: increase interval by 50%
    }

    const changeRatio = intervalChanges[feedback]
    if (changeRatio === undefined) {
      db.close()
      return { success: false, error: `Invalid feedback value: ${feedback}` }
    }

    // Calculate and enforce minimum
    let newInterval = Math.floor(file.intermediate_interval * changeRatio)
    // Add a random jitter of ±10% to prevent review clustering
    const jitter = Math.round(newInterval * (Math.random() * 0.2 - 0.1))
    newInterval += jitter
    newInterval = Math.max(newInterval, minInterval)

    // Update database
    db.prepare(
      `UPDATE file 
       SET intermediate_interval = ?,
           due_time = datetime('now', '+' || ? || ' days'),
           last_revised_time = datetime('now')
       WHERE library_id = ? AND relative_path = ?`
    ).run(newInterval, newInterval, libraryId, relativePath)

    db.close()
    return {
      success: true,
      message: `Next review in ${newInterval} day(s)`,
      queueName: 'intermediate',
      newInterval: newInterval,
      previousInterval: file.intermediate_interval,
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

async function updateIntermediateInterval(filePath, libraryId, newInterval, getCentralDbPath) {
  try {
    const dbInfo = await getWorkspaceDbPath(libraryId, getCentralDbPath)
    if (!dbInfo.found) {
      return { success: false, error: dbInfo.error || 'Database not found' }
    }

    const db = new Database(dbInfo.dbPath)
    const relativePath = path.relative(dbInfo.folderPath, filePath)

    // Validate interval
    const clampedInterval = Math.max(1, Math.min(365, Math.round(newInterval)))

    db.prepare(
      'UPDATE file SET intermediate_interval = ? WHERE library_id = ? AND relative_path = ?'
    ).run(clampedInterval, libraryId, relativePath)

    db.close()
    return { success: true, newInterval: clampedInterval }
  } catch (error) {
    console.error('Error updating intermediate interval:', error)
    return { success: false, error: error.message }
  }
}

async function updateRotationInterval(filePath, libraryId, newInterval, getCentralDbPath) {
  try {
    const dbInfo = await getWorkspaceDbPath(libraryId, getCentralDbPath)
    if (!dbInfo.found) {
      return { success: false, error: dbInfo.error || 'Database not found' }
    }

    const db = new Database(dbInfo.dbPath)
    const relativePath = path.relative(dbInfo.folderPath, filePath)

    // Validate interval
    const clampedInterval = Math.max(1, Math.min(365, Math.round(newInterval)))

    db.prepare(
      'UPDATE file SET rotation_interval = ? WHERE library_id = ? AND relative_path = ?'
    ).run(clampedInterval, libraryId, relativePath)

    db.close()
    return { success: true, newInterval: clampedInterval }
  } catch (error) {
    console.error('Error updating rotation interval:', error)
    return { success: false, error: error.message }
  }
}

export function registerSpacedIpc(ipcMain, getCentralDbPath) {
  ipcMain.handle('create-database', (_event, folderPath) =>
    createDatabase(folderPath, getCentralDbPath)
  )
  ipcMain.handle('check-file-in-queue', (_event, filePath, libraryId) =>
    checkFileInQueue(filePath, libraryId, getCentralDbPath)
  )
  ipcMain.handle('add-file-to-queue', (_event, filePath, libraryId) =>
    addFileToQueue(filePath, libraryId, getCentralDbPath)
  )
  ipcMain.handle('get-files-for-revision', (_event, rootPath) => getFilesForRevision(rootPath))
  ipcMain.handle('get-files-including-future', (_event, rootPath) =>
    getFilesIncludingFuture(rootPath)
  )
  ipcMain.handle('get-all-files-for-revision', (_event) => getAllFilesForRevision(getCentralDbPath))
  ipcMain.handle('get-all-files-including-future', (_event) =>
    getAllFilesIncludingFuture(getCentralDbPath)
  )
  ipcMain.handle('update-revision-feedback', (_event, dbPath, libraryId, relativePath, feedback) =>
    updateRevisionFeedback(dbPath, libraryId, relativePath, feedback)
  )
  ipcMain.handle('forget-file', (_event, filePath, libraryId) =>
    forgetFile(filePath, libraryId, getCentralDbPath)
  )
  ipcMain.handle('update-file-rank', (_event, filePath, libraryId, newRank) =>
    updateFileRank(filePath, libraryId, newRank, getCentralDbPath)
  )
  ipcMain.handle('update-intermediate-interval', (_event, filePath, libraryId, newInterval) =>
    updateIntermediateInterval(filePath, libraryId, newInterval, getCentralDbPath)
  )
  ipcMain.handle('update-rotation-interval', (_event, filePath, libraryId, newInterval) =>
    updateRotationInterval(filePath, libraryId, newInterval, getCentralDbPath)
  )

  // Migration
  ipcMain.handle('migrate-spaced-queue', (_event, libraryId) =>
    migrateSpacedQueue(libraryId, getCentralDbPath)
  )

  // Queue management
  ipcMain.handle('get-queue-config', (_event, libraryId, queueName, configKey) =>
    getQueueConfig(libraryId, queueName, configKey, getCentralDbPath)
  )
  ipcMain.handle('set-queue-config', (_event, libraryId, queueName, configKey, configValue) =>
    setQueueConfig(libraryId, queueName, configKey, configValue, getCentralDbPath)
  )
  ipcMain.handle('get-file-queue', (_event, filePath, libraryId) =>
    getFileQueue(filePath, libraryId, getCentralDbPath)
  )
  ipcMain.handle('move-file-to-queue', (_event, filePath, libraryId, targetQueue) =>
    moveFileToQueue(filePath, libraryId, targetQueue, getCentralDbPath)
  )
  ipcMain.handle('handle-extraction', (_event, parentPath, childPath, libraryId) =>
    handleExtraction(parentPath, childPath, libraryId, getCentralDbPath)
  )

  // Queue-specific feedback
  ipcMain.handle('handle-new-queue-feedback', (_event, dbPath, libraryId, relativePath, feedback) =>
    handleNewQueueFeedback(dbPath, libraryId, relativePath, feedback)
  )
  ipcMain.handle(
    'handle-processing-feedback',
    (_event, dbPath, libraryId, relativePath, feedback) =>
      handleProcessingFeedback(dbPath, libraryId, relativePath, feedback)
  )
  ipcMain.handle(
    'handle-intermediate-feedback',
    (_event, dbPath, libraryId, relativePath, feedback) =>
      handleIntermediateFeedback(dbPath, libraryId, relativePath, feedback)
  )
}

// Export functions for testing
export {
  createDatabase,
  checkFileInQueue,
  addFileToQueue,
  getFilesForRevision,
  getFilesIncludingFuture,
  getAllFilesForRevision,
  getAllFilesIncludingFuture,
  updateRevisionFeedback,
  handleSpacedFeedback,
  forgetFile,
  updateFileRank,
  migrateSpacedQueue,
  getQueueConfig,
  setQueueConfig,
  getFileQueue,
  moveFileToQueue,
  handleExtraction,
  handleNewQueueFeedback,
  handleProcessingFeedback,
  handleIntermediateFeedback,
}
