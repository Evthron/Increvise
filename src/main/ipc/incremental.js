// SPDX-FileCopyrightText: 2025 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Incremental Reading IPC Handlers
import path from 'node:path'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import Database from 'better-sqlite3'

/**
 * Find the source file for a note folder
 * For "tutorial/1.md" -> looks for "tutorial.md" in parent directory
 * For "tutorial/1.1.md" -> looks for "tutorial/1.md" in same directory
 * @param {string} noteFilePath - Path to the note file
 * @returns {Promise<string|null>} - Path to source file, or null if not found
 */
async function findSourceFile(noteFilePath) {
  const noteDir = path.dirname(noteFilePath)
  const noteFileName = path.basename(noteFilePath, path.extname(noteFilePath))

  // Check if this is a numbered note (e.g., "1" or "1.1")
  const isNumberedNote = /^(\d+(?:\.\d+)*)$/.test(noteFileName)

  if (!isNumberedNote) {
    // Not a numbered note, no source to find
    return null
  }

  // Parse the note number (e.g., "1.1" -> [1, 1])
  const noteParts = noteFileName.split('.').map(Number)

  let sourceFileName
  let sourceDir

  if (noteParts.length === 1) {
    // Top-level note like "tutorial/1.md" -> source is "tutorial.md"
    sourceDir = path.dirname(noteDir)
    sourceFileName = path.basename(noteDir)
  } else {
    // Nested note like "tutorial/1.1.md" -> source is "tutorial/1.md"
    sourceDir = noteDir
    sourceFileName = noteParts.slice(0, -1).join('.')
  }

  // Look for a file with matching basename (any extension)
  try {
    const files = await fs.readdir(sourceDir)
    for (const file of files) {
      const fileBaseName = path.basename(file, path.extname(file))
      if (fileBaseName === sourceFileName) {
        const sourcePath = path.join(sourceDir, file)
        // Verify it's a file, not a directory
        const stat = await fs.stat(sourcePath)
        if (stat.isFile()) {
          return sourcePath
        }
      }
    }
  } catch {
    return null
  }

  return null
}

export function registerIncrementalIpc(ipcMain, findIncreviseDatabase) {
  ipcMain.handle('read-file', async (event, filePath) => {
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      return { success: true, content }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('write-file', async (event, filePath, content) => {
    try {
      await fs.writeFile(filePath, content, 'utf-8')
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(
    'extract-note',
    async (event, parentFilePath, selectedText, rangeStart, rangeEnd) => {
      try {
        const parentDir = path.dirname(parentFilePath)
        const parentFileName = path.basename(parentFilePath, path.extname(parentFilePath))
        const matchNumber = (filename) => {
          const match = filename.match(/^(\d+(?:\.\d+)*)$/)
          if (!match) return null
          return match[1].split('.').map(Number)
        }
        const currentNumber = matchNumber(parentFileName)
        const isAlreadyInNoteFolder = currentNumber !== null
        let noteFolder, currentPrefix
        if (isAlreadyInNoteFolder) {
          noteFolder = parentDir
          currentPrefix = currentNumber
        } else {
          noteFolder = path.join(parentDir, parentFileName)
          await fs.mkdir(noteFolder, { recursive: true })
          const increviseDir = path.join(parentDir, '.increvise')
          const noteFolderDbPath = path.join(increviseDir, 'db.sqlite')
          await fs.mkdir(increviseDir, { recursive: true })
          try {
            await fs.access(noteFolderDbPath)
          } catch (error) {
            return { success: false, error: error.message }
          }
          currentPrefix = []
        }
        const existingFiles = await fs.readdir(noteFolder)
        const mdFiles = existingFiles.filter((f) => f.endsWith('.md'))
        const allNumbers = mdFiles
          .map((f) => matchNumber(path.basename(f, '.md')))
          .filter((n) => n !== null)
        let nextNumber
        if (currentPrefix.length === 0) {
          if (allNumbers.length === 0) {
            nextNumber = [1]
          } else {
            const maxFirstLevel = Math.max(...allNumbers.map((n) => n[0]))
            nextNumber = [maxFirstLevel + 1]
          }
        } else {
          const childNumbers = allNumbers.filter((n) => {
            if (n.length !== currentPrefix.length + 1) return false
            for (let i = 0; i < currentPrefix.length; i++) {
              if (n[i] !== currentPrefix[i]) return false
            }
            return true
          })
          if (childNumbers.length === 0) {
            nextNumber = [...currentPrefix, 1]
          } else {
            const maxLastLevel = Math.max(...childNumbers.map((n) => n[n.length - 1]))
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
            const relativePath = path.relative(result.rootPath, newFilePath)
            const libraryId = db.prepare('SELECT library_id FROM library LIMIT 1').get()?.library_id
            if (libraryId) {
              // Insert file record
              db.prepare(
                `
              INSERT INTO file (library_id, relative_path, added_time, review_count, difficulty, importance, due_time)
              VALUES (?, ?, datetime('now'), 0, 0.0, 70.0, datetime('now'))
            `
              ).run(libraryId, relativePath)

              // Try to insert note_source record if we have range info and can find source
              if (rangeStart && rangeEnd) {
                const sourceFilePath = await findSourceFile(newFilePath)
                if (sourceFilePath) {
                  // Hash the extracted text content, not the entire file
                  const sourceHash = crypto.createHash('sha256').update(selectedText).digest('hex')
                  try {
                    db.prepare(
                      `
                      INSERT INTO note_source (library_id, relative_path, extract_type, range_start, range_end, source_hash)
                      VALUES (?, ?, ?, ?, ?, ?)
                    `
                    ).run(
                      libraryId,
                      relativePath,
                      'text-lines',
                      String(rangeStart),
                      String(rangeEnd),
                      sourceHash
                    )
                  } catch (err) {
                    // Ignore errors in note_source insertion (optional metadata)
                    console.error('Failed to insert note_source record:', err.message)
                  }
                }
              }
            }
            db.close()
          } catch (err) {}
        }
        return {
          success: true,
          fileName: newFileName,
          filePath: newFilePath,
        }
      } catch (error) {
        return { success: false, error: error.message }
      }
    }
  )
}
