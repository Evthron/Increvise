// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// One time-script to update the old database's PRAGMA user-version number to 1

import path from 'node:path'
import fs from 'node:fs'
import os from 'os'
import Database from 'better-sqlite3'

async function run() {
  console.log('--- Starting Database Version Update Script ---')

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

  if (fs.existsSync(centralPath)) {
    const db = new Database(centralPath)
    console.log(`[CENTRAL] Current user_version: ${db.pragma('user_version', { simple: true })}`)
    db.pragma('user_version = 1')
    console.log(`[CENTRAL] New user_version: ${db.pragma('user_version', { simple: true })}`)
    console.log(`[CENTRAL] ✅ Successfully updated user_version to 1`)
    db.close()
  } else {
    console.log('Central database not found. Skipping workspace lookup.')
    return
  }

  const centralDb = new Database(centralPath, { readonly: true })
  const workspaces = centralDb.prepare('SELECT library_id, db_path, folder_path FROM workspace_history').all()
  centralDb.close()

  console.log(`\nFound ${workspaces.length} workspace(s) registered in central database.`)

  for (const workspace of workspaces) {
    const { db_path, folder_path } = workspace
    const label = `WORKSPACE: ${path.basename(folder_path)}`
    
    console.log(`\nProcessing ${label}`)
    console.log(`Path: ${db_path}`)
    
    if (fs.existsSync(db_path)) {
      const db = new Database(db_path)
      console.log(`[${label}] Current user_version: ${db.pragma('user_version', { simple: true })}`)
      db.pragma('user_version = 2')
      console.log(`[${label}] New user_version: ${db.pragma('user_version', { simple: true })}`)
      console.log(`[${label}] ✅ Successfully updated user_version to 1`)
      db.close()
    } else {
      console.log(`[${label}] Database not found at: ${db_path}`)
    }
  }

  console.log('\n--- Script Completed ---')
}

run()
