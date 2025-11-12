// SPDX-FileCopyrightText: 2025 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { app, BrowserWindow, ipcMain } from 'electron/main'
import { dialog } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import Database from 'better-sqlite3'
import os from 'os'

function getXdgDataHome() {
  return process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')
}

function getCentralDbPath() {
  const dataHome = getXdgDataHome()
  return path.join(dataHome, 'increvise', 'central.sqlite')
}

function getIncreviseDataDir() {
  const dataHome = getXdgDataHome()
  return path.join(dataHome, 'increvise')
}

async function findIncreviseDatabase(filePath) {
  let currentDir = path.dirname(filePath)
  const rootDir = path.parse(currentDir).root
  
  while (currentDir !== rootDir) {
    const increviseDir = path.join(currentDir, '.increvise')
    const dbPath = path.join(increviseDir, 'db.sqlite')
    
    try {
      await fs.access(dbPath)
      return {
        found: true,
        dbPath: dbPath,
        rootPath: currentDir
      }
    } catch {
    }
    
    currentDir = path.dirname(currentDir)
  }
  
  return { found: false, dbPath: null, rootPath: null }
}

async function initializeCentralDatabase() {
  const increviseDataDir = getIncreviseDataDir()
  const centralDbPath = getCentralDbPath()
  
  await fs.mkdir(increviseDataDir, { recursive: true })
  
  console.log('Central database path:', centralDbPath)
  try {
    const db = new Database(centralDbPath)
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS workspace_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        folder_path TEXT NOT NULL UNIQUE,
        folder_name TEXT NOT NULL,
        db_path TEXT NOT NULL,
        first_opened DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_opened DATETIME DEFAULT CURRENT_TIMESTAMP,
        open_count INTEGER DEFAULT 1,
        total_files INTEGER DEFAULT 0,
        files_due_today INTEGER DEFAULT 0
      );
      
      CREATE INDEX IF NOT EXISTS idx_last_opened 
      ON workspace_history(last_opened DESC);
      
      CREATE INDEX IF NOT EXISTS idx_folder_path 
      ON workspace_history(folder_path);
    `)
    
    db.close()
    console.log('Central database initialized successfully')
    return true
    
  } catch (err) {
    console.error('Error creating central database:', err)
    throw err
  }
}

const createWindow = () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(path.dirname(new URL(import.meta.url).pathname), 'preload.js')
    }
  })

  win.loadFile('index.html')
}

app.whenReady().then(async () => {
  try {
    await initializeCentralDatabase()
    console.log('Central database ready')
  } catch (error) {
    console.error('Failed to initialize central database:', error)
  }
  
  ipcMain.handle('select-folder', async () => {
    console.log('select-folder IPC handler invoked')
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory']
      })
      console.log('Dialog result:', result)
      return result.filePaths[0] || null
    } catch (error) {
      console.error('Error in select-folder handler:', error)
      return null
    }
  })


  ipcMain.handle('get-directory-tree', async (event, dirPath) => {
    const parseNoteNumber = (filename) => {
      const match = filename.match(/^(\d+(?:\.\d+)*)\.md$/)
      if (!match) return null
      return match[1].split('.').map(Number)
    }
    
    const buildTreeFromFlat = (notes) => {
      const map = new Map()
      const roots = []
      
      notes.forEach(note => {
        const hasChildren = notes.some(n => 
          n.number.length === note.number.length + 1 &&
          n.number.slice(0, -1).join('.') === note.numberKey
        )
        
        map.set(note.numberKey, { 
          ...note, 
          children: [],
          type: hasChildren ? 'note-parent' : 'note-child'
        })
      })
      
      notes.forEach(note => {
        const node = map.get(note.numberKey)
        if (note.number.length === 1) {
          roots.push(node)
        } else {
          const parentKey = note.number.slice(0, -1).join('.')
          const parent = map.get(parentKey)
          if (parent) {
            parent.children.push(node)
          } else {
            roots.push(node)
          }
        }
      })
      
      return roots
    }
    
    const buildNoteHierarchy = async (folderPath, baseName) => {
      try {
        const items = await fs.readdir(folderPath, { withFileTypes: true })
        const mdFiles = items
          .filter(item => item.isFile() && item.name.endsWith('.md'))
          .map(item => ({
            name: item.name,
            number: parseNoteNumber(item.name),
            path: path.join(folderPath, item.name)
          }))
          .filter(item => item.number !== null)
        
        if (mdFiles.length === 0) return []
        
        mdFiles.sort((a, b) => {
          for (let i = 0; i < Math.max(a.number.length, b.number.length); i++) {
            const aNum = a.number[i] || 0
            const bNum = b.number[i] || 0
            if (aNum !== bNum) return aNum - bNum
          }
          return 0
        })
        
        const notesWithKeys = mdFiles.map(note => ({
          ...note,
          numberKey: note.number.join('.')
        }))
        
        return buildTreeFromFlat(notesWithKeys)
      } catch (error) {
        return []
      }
    }
    
    const buildTree = async (dir) => {
      const items = await fs.readdir(dir, { withFileTypes: true })
      const tree = []
      
      const fileMap = new Map()
      items.filter(item => item.isFile()).forEach(item => {
        const baseName = path.basename(item.name, path.extname(item.name))
        fileMap.set(baseName, item)
      })
      
      for (const item of items) {
        const fullPath = path.join(dir, item.name)
        
        if (item.isDirectory()) {
          if (item.name === '.increvise') continue
          
          if (fileMap.has(item.name)) {
            const fileItem = fileMap.get(item.name)
            const filePath = path.join(dir, fileItem.name)
            
            const hierarchy = await buildNoteHierarchy(fullPath, item.name)
            
            tree.push({
              name: fileItem.name,
              type: 'note-parent',
              path: filePath,
              children: hierarchy
            })
            
            fileMap.delete(item.name)
          } else {
            tree.push({
              name: item.name,
              type: 'directory',
              path: fullPath,
              children: null
            })
          }
        }
      }
      
      for (const [baseName, item] of fileMap) {
        const fullPath = path.join(dir, item.name)
        tree.push({
          name: item.name,
          type: 'file',
          path: fullPath
        })
      }
      
      return tree
    }
    return await buildTree(dirPath)
  })

  ipcMain.handle('fetch-children', async (event, dirPath) => {
    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true })
      const children = []
      for (const item of items) {
        const fullPath = path.join(dirPath, item.name)
        if (item.isDirectory()) {
          children.push({
            name: item.name,
            type: 'directory',
            path: fullPath,
            children: null // Lazy-load children
          })
        } else {
          children.push({
            name: item.name,
            type: 'file',
            path: fullPath
          })
        }
      }
      return children
    } catch (error) {
      console.error('Error fetching children:', error)
      return []
    }
  })

  ipcMain.handle('create-database', async (event, dbPath) => {
    try {
      const oldDbPath = path.join(dbPath, 'db.sqlite')
      const increviseFolder = path.join(dbPath, '.increvise')
      const dbFilePath = path.join(increviseFolder, 'db.sqlite')

      await fs.mkdir(increviseFolder, { recursive: true })
      console.log('Attempting to create database at:', dbFilePath)

      try {
        await fs.access(oldDbPath)
        console.log('Found old db.sqlite, migrating to .increvise folder')
        await fs.rename(oldDbPath, dbFilePath)
        console.log('Migration complete')
        return { success: true, path: dbFilePath }
      } catch {}

      try {
        await fs.access(dbFilePath)
        console.log('Database file already exists')
        return { success: true, path: dbFilePath }
      } catch {
        console.log('Creating new database file')
      }

      try {
        const db = new Database(dbFilePath)
        db.exec(`
          -- Note Queue table
          CREATE TABLE IF NOT EXISTS note_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            array_name TEXT NOT NULL,
            array_of_notes TEXT, -- JSON string containing array of note IDs
            sr_setting TEXT, -- JSON string for spaced repetition settings
            created_time DATETIME DEFAULT CURRENT_TIMESTAMP
          );

          -- File table (notes/files)
          CREATE TABLE IF NOT EXISTS file (
            note_id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_path TEXT NOT NULL UNIQUE,
            creation_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_revised_time DATETIME,
            review_count INTEGER DEFAULT 0,
            difficulty REAL DEFAULT 0.0, -- Difficulty rating (e.g., 0.0 to 1.0)
            due_time DATETIME
          );

          -- Folder data table
          CREATE TABLE IF NOT EXISTS folder_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            folder_path TEXT NOT NULL UNIQUE,
            overall_priority INTEGER DEFAULT 0,
            created_time DATETIME DEFAULT CURRENT_TIMESTAMP
          );
        `)
        db.close()
        console.log('Database created successfully at:', dbFilePath)
        return { success: true, path: dbFilePath }
      } catch (err) {
        console.error('Error creating database:', err)
        return { success: false, error: err.message }
      }
    } catch (error) {
      console.error('Error in create-database handler:', error)
      return { success: false, error: error.message }
    }
  })

  // Add file to revision queue
  ipcMain.handle('check-file-in-queue', async (event, filePath) => {
    try {
      const result = await findIncreviseDatabase(filePath)
      if (!result.found) {
        return { inQueue: false }
      }
      try {
        const db = new Database(result.dbPath)
        const row = db.prepare('SELECT note_id FROM file WHERE file_path = ?').get(filePath)
        db.close()
        return { inQueue: !!row }
      } catch (err) {
        console.error('Error in check-file-in-queue handler:', err)
        return { inQueue: false }
      }
    } catch (error) {
      console.error('Error in check-file-in-queue handler:', error)
      return { inQueue: false }
    }
  })

  ipcMain.handle('add-file-to-queue', async (event, filePath) => {
    try {
      const result = await findIncreviseDatabase(filePath)
      if (!result.found) {
        return { success: false, error: 'Database not found. Please create a database first.' }
      }
      try {
        const db = new Database(result.dbPath)
        // Check if file already exists
        const row = db.prepare('SELECT note_id FROM file WHERE file_path = ?').get(filePath)
        if (row) {
          db.close()
          return { success: false, error: 'File already in queue', alreadyExists: true }
        }
        // Insert file
        const insertStmt = db.prepare('INSERT INTO file (file_path, creation_time, review_count, difficulty, due_time) VALUES (?, datetime(\'now\'), 0, 0.0, datetime(\'now\'))')
        const info = insertStmt.run(filePath)
        const noteId = info.lastInsertRowid
        // Insert folder if not exists
        db.prepare('INSERT OR IGNORE INTO folder_data (folder_path, overall_priority) VALUES (?, 0)').run(result.rootPath)
        db.close()
        return { success: true, noteId, message: 'File added to revision queue' }
      } catch (err) {
        console.error('Error adding file to queue:', err)
        return { success: false, error: err.message }
      }
    } catch (error) {
      console.error('Error adding file to queue:', error)
      return { success: false, error: error.message }
    }
  })

  // Get files due for revision today
  ipcMain.handle('get-files-for-revision', async (event, rootPath) => {
    try {
      // Find all db.sqlite files in subdirectories
      const findDatabases = async (dir) => {
        const databases = []
        const items = await fs.readdir(dir, { withFileTypes: true })
        for (const item of items) {
          const fullPath = path.join(dir, item.name)
          if (item.isDirectory()) {
            if (item.name === '.increvise') {
              const dbFile = path.join(fullPath, 'db.sqlite')
              try {
                await fs.access(dbFile)
                databases.push(dbFile)
              } catch {}
            } else {
              databases.push(...await findDatabases(fullPath))
            }
          }
        }
        return databases
      }
      const dbPaths = await findDatabases(rootPath)
      console.log('Found databases:', dbPaths)
      // Aggregate files from all databases
      const allFiles = []
      for (const dbPath of dbPaths) {
        try {
          const db = new Database(dbPath, { readonly: true })
          const rows = db.prepare(`
            SELECT note_id, file_path, creation_time, last_revised_time, 
                   review_count, difficulty, due_time
            FROM file
            WHERE date(due_time) <= date('now')
            ORDER BY due_time ASC
          `).all()
          allFiles.push(...rows.map(row => ({ ...row, dbPath })))
          db.close()
        } catch (err) {
          console.error('Error querying database:', dbPath, err)
        }
      }
      console.log('Files for revision:', allFiles)
      return { success: true, files: allFiles }
    } catch (error) {
      console.error('Error getting files for revision:', error)
      return { success: false, error: error.message, files: [] }
    }
  })

  ipcMain.handle('get-all-files-for-revision', async (event) => {
    try {
      const centralDbPath = getCentralDbPath()
      let workspaces = []
      try {
        const db = new Database(centralDbPath, { readonly: true })
        workspaces = db.prepare('SELECT folder_path, db_path FROM workspace_history ORDER BY last_opened DESC').all()
        db.close()
      } catch (err) {
        console.error('Error reading workspace history:', err)
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
          const rows = db.prepare(`
            SELECT note_id, file_path, creation_time, last_revised_time, 
                   review_count, difficulty, due_time
            FROM file
            WHERE date(due_time) <= date('now')
            ORDER BY due_time ASC
          `).all()
          allFiles.push(...rows.map(row => ({
            ...row,
            dbPath: workspace.db_path,
            workspacePath: workspace.folder_path
          })))
          db.close()
        } catch (err) {
          // skip this workspace if error
        }
      }
      allFiles.sort((a, b) => new Date(a.due_time) - new Date(b.due_time))
      console.log('All files for revision from all workspaces:', allFiles.length)
      return { success: true, files: allFiles }
    } catch (error) {
      console.error('Error getting all files for revision:', error)
      return { success: false, error: error.message, files: [] }
    }
  })

  // Update file after revision (spaced repetition feedback)
  ipcMain.handle('update-revision-feedback', async (event, dbPath, noteId, feedback) => {
    try {
      // Calculate next due time based on feedback
      // feedback: 'easy', 'medium', 'hard', 'again'
      const intervals = {
        'again': 0, // Review again today
        'hard': 1,  // 1 day
        'medium': 3, // 3 days
        'easy': 7    // 7 days
      }
      const daysToAdd = intervals[feedback] || 1
      // Update difficulty based on feedback
      const difficultyChanges = {
        'again': 0.2,
        'hard': 0.1,
        'medium': 0,
        'easy': -0.1
      }
      const difficultyChange = difficultyChanges[feedback] || 0
      try {
        const db = new Database(dbPath)
        const stmt = db.prepare(`
          UPDATE file
          SET last_revised_time = datetime('now'),
              review_count = review_count + 1,
              difficulty = MAX(0.0, MIN(1.0, difficulty + ?)),
              due_time = datetime('now', '+' || ? || ' days')
          WHERE note_id = ?
        `)
        const info = stmt.run(difficultyChange, daysToAdd, noteId)
        db.close()
        return {
          success: true,
          message: `File updated. Next review in ${daysToAdd} day(s)`,
          changes: info.changes
        }
      } catch (err) {
        console.error('Error updating revision feedback:', err)
        return { success: false, error: err.message }
      }
    } catch (error) {
      console.error('Error updating revision feedback:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('extract-note', async (event, parentFilePath, selectedText) => {
    try {
      const parentDir = path.dirname(parentFilePath)
      const parentFileName = path.basename(parentFilePath, path.extname(parentFilePath))
      const parentDirName = path.basename(parentDir)
      
      const matchNumber = (filename) => {
        const match = filename.match(/^(\d+(?:\.\d+)*)$/)
        if (!match) return null
        return match[1].split('.').map(Number)
      }
      
      const currentNumber = matchNumber(parentFileName)
      const isAlreadyInNoteFolder = currentNumber !== null
      
      let noteFolder
      let currentPrefix
      
      if (isAlreadyInNoteFolder) {
        noteFolder = parentDir
        currentPrefix = currentNumber
      } else {
        noteFolder = path.join(parentDir, parentFileName)
        await fs.mkdir(noteFolder, { recursive: true })
        
        const increviseDir = path.join(noteFolder, '.increvise')
        const noteFolderDbPath = path.join(increviseDir, 'data.sqlite')
        
        await fs.mkdir(increviseDir, { recursive: true })
        
        try {
          await fs.access(noteFolderDbPath)
        } catch {
          const noteDb = new Database(noteFolderDbPath)
          await new Promise((resolve, reject) => {
            noteDb.exec(`
              CREATE TABLE IF NOT EXISTS file (
                note_id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_path TEXT NOT NULL UNIQUE,
                creation_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_revised_time DATETIME,
                review_count INTEGER DEFAULT 0,
                difficulty REAL DEFAULT 0.0,
                due_time DATETIME
              );
            `, (err) => {
              noteDb.close()
              if (err) reject(err)
              else resolve()
            })
          })
        }
        
        currentPrefix = []
      }
      
      const existingFiles = await fs.readdir(noteFolder)
      const mdFiles = existingFiles.filter(f => f.endsWith('.md'))
      
      const allNumbers = mdFiles
        .map(f => matchNumber(path.basename(f, '.md')))
        .filter(n => n !== null)
      
      let nextNumber
      
      if (currentPrefix.length === 0) {
        if (allNumbers.length === 0) {
          nextNumber = [1]
        } else {
          const maxFirstLevel = Math.max(...allNumbers.map(n => n[0]))
          nextNumber = [maxFirstLevel + 1]
        }
      } else {
        const childNumbers = allNumbers.filter(n => {
          if (n.length !== currentPrefix.length + 1) return false
          for (let i = 0; i < currentPrefix.length; i++) {
            if (n[i] !== currentPrefix[i]) return false
          }
          return true
        })
        
        if (childNumbers.length === 0) {
          nextNumber = [...currentPrefix, 1]
        } else {
          const maxLastLevel = Math.max(...childNumbers.map(n => n[n.length - 1]))
          nextNumber = [...currentPrefix, maxLastLevel + 1]
        }
      }
      
      const newFileName = nextNumber.join('.') + '.md'
      const newFilePath = path.join(noteFolder, newFileName)
      
      await fs.writeFile(newFilePath, selectedText, 'utf-8')
      
      const result = await findIncreviseDatabase(newFilePath)
      
      if (result.found) {
        try {
          const db = new Database(result.dbPath)
          db.prepare(`
            INSERT INTO file (file_path, creation_time, review_count, difficulty, due_time)
            VALUES (?, datetime('now'), 0, 0.0, datetime('now'))
          `).run(newFilePath)
          db.close()
        } catch (err) {
          console.error('Error adding extracted note to queue:', err)
        }
      }
      
      return {
        success: true,
        fileName: newFileName,
        filePath: newFilePath
      }
      
    } catch (error) {
      console.error('Error extracting note:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('read-file', async (event, filePath) => {
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      return { success: true, content }
    } catch (error) {
      console.error('Error reading file:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('write-file', async (event, filePath, content) => {
    try {
      await fs.writeFile(filePath, content, 'utf-8')
      return { success: true }
    } catch (error) {
      console.error('Error writing file:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('record-workspace', async (event, folderPath) => {
    const centralDbPath = getCentralDbPath()
    const folderName = path.basename(folderPath)
    const dbPath = path.join(folderPath, '.increvise', 'db.sqlite')
    try {
      const db = new Database(centralDbPath)
      const stmt = db.prepare(`
        INSERT INTO workspace_history 
        (folder_path, folder_name, db_path, last_opened, open_count)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP, 1)
        ON CONFLICT(folder_path) DO UPDATE SET
          last_opened = CURRENT_TIMESTAMP,
          open_count = open_count + 1
      `)
      const info = stmt.run(folderPath, folderName, dbPath)
      db.close()
      console.log('Workspace recorded:', folderPath)
      return { success: true, id: info.lastInsertRowid }
    } catch (err) {
      console.error('Error recording workspace:', err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('get-recent-workspaces', async (event, limit = 10) => {
    const centralDbPath = getCentralDbPath()
    try {
      const db = new Database(centralDbPath)
      const rows = db.prepare(`
        SELECT * FROM workspace_history 
        ORDER BY last_opened DESC 
        LIMIT ?
      `).all(limit)
      db.close()
      return rows || []
    } catch (err) {
      console.error('Error getting recent workspaces:', err)
      return []
    }
  })

  ipcMain.handle('update-workspace-stats', async (event, folderPath, totalFiles, filesDueToday) => {
    const centralDbPath = getCentralDbPath()
    try {
      const db = new Database(centralDbPath)
      const stmt = db.prepare(`
        UPDATE workspace_history 
        SET total_files = ?, files_due_today = ?
        WHERE folder_path = ?
      `)
      const info = stmt.run(totalFiles, filesDueToday, folderPath)
      db.close()
      console.log('Workspace stats updated:', folderPath, totalFiles, filesDueToday)
      return { success: true, changes: info.changes }
    } catch (err) {
      console.error('Error updating workspace stats:', err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('remove-workspace', async (event, folderPath) => {
    const centralDbPath = getCentralDbPath()
    try {
      const db = new Database(centralDbPath)
      const stmt = db.prepare(`
        DELETE FROM workspace_history 
        WHERE folder_path = ?
      `)
      const info = stmt.run(folderPath)
      db.close()
      console.log('Workspace removed:', folderPath)
      return { success: true, changes: info.changes }
    } catch (err) {
      console.error('Error removing workspace:', err)
      return { success: false, error: err.message }
    }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
}) 
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})