// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Initialize a new workspace with default queues and configurations
 * @param {Database} db - better-sqlite3 database instance
 * @param {string} libraryId - UUID for the library
 * @param {string} libraryName - Name of the library (usually folder name)
 */
export function insertInitialData(db, libraryId, libraryName) {
  // Wrap all inserts in a transaction for atomicity
  db.transaction(() => {
    // Insert library record
    db.prepare('INSERT INTO library (library_id, library_name) VALUES (?, ?)').run(
      libraryId,
      libraryName
    )

    // Initialize default queues
    const insertQueue = db.prepare(
      'INSERT INTO review_queue (library_id, queue_name, description) VALUES (?, ?, ?)'
    )
    insertQueue.run(libraryId, 'new', 'New queue, FIFO, waiting to be processed')
    insertQueue.run(libraryId, 'processing', 'processing queue: rotation-based review')
    insertQueue.run(libraryId, 'intermediate', 'intermediate queue: variable interval review')
    insertQueue.run(libraryId, 'spaced-casual', 'Spaced Repetition (Casual): ~80% retention')
    insertQueue.run(libraryId, 'spaced-standard', 'Spaced Repetition (Standard): ~90% retention')
    insertQueue.run(libraryId, 'spaced-strict', 'Spaced Repetition (Strict): ~95% retention')
    insertQueue.run(libraryId, 'archived', 'Archived items, low chance of review')

    // Initialize default queue configs
    const insertConfig = db.prepare(
      'INSERT INTO queue_config (library_id, queue_name, config_key, config_value) VALUES (?, ?, ?, ?)'
    )

    // New queue configs
    insertConfig.run(libraryId, 'new', 'max_per_day', '10')

    // Processing queue configs
    insertConfig.run(libraryId, 'processing', 'default_rotation', '3')

    // Intermediate queue configs
    insertConfig.run(libraryId, 'intermediate', 'default_base', '7')
    insertConfig.run(libraryId, 'intermediate', 'min_interval', '3')

    // Spaced-Casual queue configs (~80% retention)
    insertConfig.run(libraryId, 'spaced-casual', 'initial_ef', '2.0')
    insertConfig.run(libraryId, 'spaced-casual', 'min_ef', '1.2')
    insertConfig.run(libraryId, 'spaced-casual', 'max_ef', '2.5')
    insertConfig.run(libraryId, 'spaced-casual', 'first_interval', '1')
    insertConfig.run(libraryId, 'spaced-casual', 'second_interval', '4')
    insertConfig.run(libraryId, 'spaced-casual', 'fail_threshold', '2')

    // Spaced-Standard queue configs (~90% retention)
    insertConfig.run(libraryId, 'spaced-standard', 'initial_ef', '2.5')
    insertConfig.run(libraryId, 'spaced-standard', 'min_ef', '1.3')
    insertConfig.run(libraryId, 'spaced-standard', 'max_ef', '2.5')
    insertConfig.run(libraryId, 'spaced-standard', 'first_interval', '1')
    insertConfig.run(libraryId, 'spaced-standard', 'second_interval', '6')
    insertConfig.run(libraryId, 'spaced-standard', 'fail_threshold', '2')

    // Spaced-Strict queue configs (~95% retention)
    insertConfig.run(libraryId, 'spaced-strict', 'initial_ef', '2.8')
    insertConfig.run(libraryId, 'spaced-strict', 'min_ef', '1.5')
    insertConfig.run(libraryId, 'spaced-strict', 'max_ef', '3.0')
    insertConfig.run(libraryId, 'spaced-strict', 'first_interval', '1')
    insertConfig.run(libraryId, 'spaced-strict', 'second_interval', '8')
    insertConfig.run(libraryId, 'spaced-strict', 'fail_threshold', '3')

    // Global configs (not a real queue, just a config namespace)
    insertConfig.run(libraryId, 'global', 'rank_penalty', '5')
  })

  console.log(`Initialized workspace with library_id: ${libraryId}`)
}
