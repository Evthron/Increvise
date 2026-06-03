// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// One time-script to all database text hash calculations in the file table
// Use file stream buffer instead of file text

import path from 'node:path'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import os from 'node:os'
import Database from 'better-sqlite3'
import crypto from 'node:crypto'

async function run() {
  let appDataPath
  if (process.platform === 'win32') {
    appDataPath = process.env.APPDATA
  } else if (process.platform === 'darwin') {
    appDataPath = path.join(os.homedir(), 'Library', 'Application Support')
  } else {
    appDataPath = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')
  }

  const increviseDataDir = process.env.INCREVISE_DATA_DIR || path.join(appDataPath, 'Increvise')
  const centralPath = path.join(increviseDataDir, 'central.sqlite')

  console.log(`\nChecking Central Database at: ${centralPath}`)

  const centralDb = new Database(centralPath, { readonly: true })
  const workspaces = centralDb.prepare('SELECT db_path, folder_path FROM workspace_history').all()
  centralDb.close()

  console.log(`\nFound ${workspaces.length} workspace(s) registered in central database.`)

  for (const workspace of workspaces) {
    const { db_path, folder_path } = workspace
    const label = `WORKSPACE: ${path.basename(folder_path)}`

    console.log(`\nProcessing ${label}`)
    console.log(`Path: ${db_path}`)

    if (fs.existsSync(db_path)) {
      const db = new Database(db_path)
      const files = db.prepare('SELECT relative_path FROM file').all()
      const updateHash = db.prepare('UPDATE file SET content_hash = ? WHERE relative_path = ?')
      const updateAll = db.transaction((fileEntries) => {
        for (const entry of fileEntries) {
          updateHash.run(entry.hash, entry.relativePath)
        }
      })
      const updates = []
      for (const file of files) {
        const filePath = path.join(folder_path, file.relative_path)
        if (path.extname(filePath).toLowerCase() !== '.md') {
          continue
        }
        if (fs.existsSync(filePath)) {
          const buffer = await fsPromises.readFile(filePath)
          const hash = crypto.createHash('sha256').update(buffer).digest('hex')
          updates.push({ hash, relativePath: file.relative_path })
          console.log(`Updated hash for: ${file.relative_path}`)
        }
      }
      if (updates.length > 0) {
        updateAll(updates)
      }
      db.close()
    } else {
      console.log(`[${label}] Database not found at: ${db_path}`)
    }
  }

  console.log('\n--- Script Completed ---')
}

run()
