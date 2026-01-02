// SPDX-FileCopyrightText: 2025 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Incremental Reading IPC Handlers
import path from 'node:path'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import Database from 'better-sqlite3'
import { getWorkspaceDbPath } from '../db/index.js'

/**
 * Parse a hierarchical note filename
 * Format: rangeStart-rangeEnd-layer1Name.rangeStart-rangeEnd-layer2Name.md
 * Example: "10-20-introduction-to.15-18-core-concepts.md"
 * @param {string} fileName - The note filename without extension
 * @returns {Array|null} - Array of layer objects [{range: [10, 20], name: 'introduction-to'}, ...] or null
 */
function parseNoteFileName(fileName) {
  // Split by dots to get each layer
  const layers = fileName.split('.')
  const parsed = []

  for (const layer of layers) {
    // Match pattern: rangeStart-rangeEnd-name
    const match = layer.match(/^(\d+)-(\d+)-(.+)$/)
    if (!match) return null

    parsed.push({
      rangeStart: parseInt(match[1]),
      rangeEnd: parseInt(match[2]),
      name: match[3],
    })
  }

  return parsed.length > 0 ? parsed : null
}

/**
 * Generate filename for a new child note (Option B: go back 2 layers)
 * @param {string} parentFilePath - Path to parent note file
 * @param {number} rangeStart - Start line of extracted text
 * @param {number} rangeEnd - End line of extracted text
 * @param {string} extractedText - The extracted text to generate name from
 * @returns {string} - New filename without extension
 */
function generateChildNoteName(parentFilePath, rangeStart, rangeEnd, extractedText) {
  const parentFileName = path.basename(parentFilePath, path.extname(parentFilePath))
  const parentLayers = parseNoteFileName(parentFileName)

  // Generate name from first 3 words of extracted text - optimized
  let words = ''
  const text = extractedText.trim()
  let wordCount = 0
  let currentWord = ''

  for (let i = 0; i < text.length && wordCount < 3; i++) {
    const char = text[i]
    const lower = char.toLowerCase()
    const isAlphaNum = (lower >= 'a' && lower <= 'z') || (lower >= '0' && lower <= '9')

    if (isAlphaNum) {
      currentWord += lower
    } else if (currentWord.length > 0) {
      if (words) words += '-'
      words += currentWord
      currentWord = ''
      wordCount++
    }
  }
  // Add last word if exists
  if (currentWord.length > 0 && wordCount < 3) {
    if (words) words += '-'
    words += currentWord
  }

  if (!parentLayers) {
    // Parent is a top-level file - extract name from filename
    let parentName = ''
    wordCount = 0
    currentWord = ''

    for (let i = 0; i < parentFileName.length && wordCount < 3; i++) {
      const char = parentFileName[i]
      const lower = char.toLowerCase()
      const isAlphaNum = (lower >= 'a' && lower <= 'z') || (lower >= '0' && lower <= '9')

      if (isAlphaNum || char === '-') {
        currentWord += lower
      } else if (currentWord.length > 0) {
        if (parentName) parentName += '-'
        parentName += currentWord
        currentWord = ''
        wordCount++
      }
    }
    if (currentWord.length > 0 && wordCount < 3) {
      if (parentName) parentName += '-'
      parentName += currentWord
    }

    return `${rangeStart}-${rangeEnd}-${parentName || words || 'note'}`
  } else {
    // Flat structure: keep all parent layers, append new layer
    const allLayers = [...parentLayers, { rangeStart, rangeEnd, name: words || 'note' }]
    return allLayers.map((l) => `${l.rangeStart}-${l.rangeEnd}-${l.name}`).join('.')
  }
}

/**
 * Find the top-level note folder for flat structure
 * If parent is already a child note, find its top-level ancestor's folder
 * @param {string} parentFilePath - Path to parent note file
 * @param {Object} db - Database instance
 * @param {string} libraryId - Library ID
 * @param {string} rootPath - Root path of the workspace
 * @returns {string} - Top-level note folder path
 */
function findTopLevelNoteFolder(parentFilePath, db, libraryId, rootPath) {
  const parentRelativePath = path.relative(rootPath, parentFilePath)

  // Check if parent has a parent_path in database (i.e., it's a child note)
  const result = db
    .prepare(
      `
      SELECT parent_path FROM note_source 
      WHERE library_id = ? AND relative_path = ?
    `
    )
    .get(libraryId, parentRelativePath)

  if (!result || !result.parent_path) {
    // Parent is a top-level original note, create folder named after it
    const parentDir = path.dirname(parentFilePath)
    const parentFileName = path.basename(parentFilePath, path.extname(parentFilePath))
    return path.join(parentDir, parentFileName)
  } else {
    // Parent is a child note, recursively find its top-level ancestor
    const grandParentPath = path.join(rootPath, result.parent_path)
    return findTopLevelNoteFolder(grandParentPath, db, libraryId, rootPath)
  }
}

/**
 * Find the parent source file path for a given note
 * @param {string} noteFilePath - Path to the note file
 * @param {Object} db - Database instance
 * @param {string} libraryId - Library ID
 * @param {string} rootPath - Root path of the workspace
 * @returns {Promise<string|null>} - Parent file path or null
 */
async function findParentPath(noteFilePath, db, libraryId, rootPath) {
  try {
    const relativePath = path.relative(rootPath, noteFilePath)
    const result = db
      .prepare(
        `
      SELECT parent_path FROM note_source 
      WHERE library_id = ? AND relative_path = ?
    `
      )
      .get(libraryId, relativePath)

    return result?.parent_path || null
  } catch {
    return null
  }
}

/**
 * Extract lines from content by line range
 * @param {string} content - The content to extract from
 * @param {number} startLine - Start line (1-based)
 * @param {number} endLine - End line (1-based, inclusive)
 * @returns {string} - Extracted content
 */
function extractLines(content, startLine, endLine) {
  const lines = content.split('\n')
  return lines.slice(startLine - 1, endLine).join('\n')
}

/**
 * Find content in parent note by hash
 * @param {string} parentContent - Parent note content
 * @param {string} targetHash - Hash to search for
 * @returns {Object|null} - {start, end} or null if not found
 */
function findContentByHashAndLineCount(parentContent, targetHash, numberOfLines) {
  const lines = parentContent.split('\n')

  // Try different window lengths
  for (let start = 0; start <= lines.length - numberOfLines; start++) {
    const content = lines.slice(start, start + numberOfLines).join('\n')
    const hash = crypto.createHash('sha256').update(content).digest('hex')

    if (hash === targetHash) {
      return { start: start + 1, end: start + numberOfLines }
    }
  }

  return null
}

/**
 * Validate note range and recover position if needed
 * @param {string} notePath - Absolute path to note file
 * @param {string} libraryId - Library ID
 * @param {Function} getCentralDbPath - Function to get central DB path
 * @returns {Promise<Object>} - Validation result
 */
async function validateAndRecoverNoteRange(notePath, libraryId, getCentralDbPath) {
  try {
    const dbInfo = await getWorkspaceDbPath(libraryId, getCentralDbPath)
    if (!dbInfo.found) {
      return { success: false, error: 'Database not found' }
    }

    const db = new Database(dbInfo.dbPath)
    const relativePath = path.relative(dbInfo.folderPath, notePath)

    // Get note record
    const note = db
      .prepare(
        `
        SELECT parent_path, range_start, range_end, source_hash
        FROM note_source
        WHERE library_id = ? AND relative_path = ?
      `
      )
      .get(libraryId, relativePath)

    if (!note) {
      db.close()
      return { success: false, error: 'Note not found in database' }
    }

    // Read parent content
    const parentPath = path.join(dbInfo.folderPath, note.parent_path)
    const parentContent = await fs.readFile(parentPath, 'utf-8')

    // Use the hash from the first extract to recover extract location
    const sourceHash = note.source_hash

    // Validate current position in database
    const dbRange = [parseInt(note.range_start), parseInt(note.range_end)]
    const currentContent = extractLines(parentContent, dbRange[0], dbRange[1])
    const currentHash = crypto.createHash('sha256').update(currentContent).digest('hex')

    // Case 1: Position still valid
    if (currentHash === sourceHash) {
      db.close()
      return {
        success: true,
        status: 'valid',
        range: dbRange,
      }
    }
    const lineCount = dbRange[1] - dbRange[0] + 1

    // Case 2: Position invalid, try to recover
    const newRange = findContentByHashAndLineCount(parentContent, sourceHash, lineCount)

    if (newRange) {
      // Recovery successful - update database
      db.prepare(
        `
        UPDATE note_source
        SET range_start = ?, range_end = ?
        WHERE library_id = ? AND relative_path = ?
      `
      ).run(String(newRange.start), String(newRange.end), libraryId, relativePath)

      db.close()
      return {
        success: true,
        status: 'moved',
        oldRange: dbRange,
        newRange: [newRange.start, newRange.end],
      }
    }

    // Case 3: Cannot recover - keep database unchanged
    db.close()
    return {
      success: true,
      status: 'lost',
      range: dbRange,
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * Compare the note range shown on filename with the note range stored in database
 * @param {string} notePath - Absolute path to note file
 * @param {string} libraryId - Library ID
 * @param {Function} getCentralDbPath - Function to get central DB path
 * @returns {Promise<Object>} - Status information
 */
async function compareFilenameWithDbRange(notePath, libraryId, getCentralDbPath) {
  try {
    const dbInfo = await getWorkspaceDbPath(libraryId, getCentralDbPath)
    if (!dbInfo.found) {
      return { success: false, error: 'Database not found' }
    }

    const db = new Database(dbInfo.dbPath)
    const relativePath = path.relative(dbInfo.folderPath, notePath)

    const note = db
      .prepare(
        `
        SELECT range_start, range_end
        FROM note_source
        WHERE library_id = ? AND relative_path = ?
      `
      )
      .get(libraryId, relativePath)

    db.close()

    if (!note) {
      return { success: false, error: 'Note not found in database' }
    }

    // Parse range from filename
    const filename = path.basename(notePath, '.md')
    const parsed = parseNoteFileName(filename)
    if (!parsed) {
      return { success: false, error: 'Invalid filename format' }
    }

    const filenameRange = [parsed[parsed.length - 1].rangeStart, parsed[parsed.length - 1].rangeEnd]
    const dbRange = [parseInt(note.range_start), parseInt(note.range_end)]

    // Compare
    const isSame = filenameRange[0] === dbRange[0] && filenameRange[1] === dbRange[1]

    return {
      success: true,
      filenameRange,
      dbRange,
      status: isSame ? 'unknown' : 'moved',
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// Recursively expand child note content by replacing extract markers with actual content
async function expandNoteContentRecursively(
  notePath,
  noteContent,
  libraryId,
  getCentralDbPath,
  currentDepth = 0,
  maxDepth = 10,
  visitedPaths = new Set()
) {
  // Check recursion depth limit
  if (currentDepth >= maxDepth) {
    console.warn(`[expandNoteContentRecursively] Max depth ${maxDepth} reached for ${notePath}`)
    return noteContent
  }

  // Check for circular references
  const normalizedPath = path.normalize(notePath)
  if (visitedPaths.has(normalizedPath)) {
    console.warn(`[expandNoteContentRecursively] Circular reference detected: ${notePath}`)
    return '[Circular reference detected]'
  }

  // Add current path to visited set
  const newVisitedPaths = new Set(visitedPaths)
  newVisitedPaths.add(normalizedPath)

  try {
    // Get child ranges for this note
    const childResult = await getChildRanges(notePath, libraryId, getCentralDbPath)

    // If no children or error, return original content
    if (!childResult.success || !childResult.ranges || childResult.ranges.length === 0) {
      return noteContent
    }

    // Split content into lines for manipulation
    let lines = noteContent.split('\n')

    // Sort ranges in descending order (process from end to start to avoid offset issues)
    const sortedRanges = [...childResult.ranges].sort((a, b) => b.start - a.start)

    // Process each child range
    for (const childRange of sortedRanges) {
      try {
        // Get child's absolute path
        const dbInfo = await getWorkspaceDbPath(libraryId, getCentralDbPath)
        if (!dbInfo.found) {
          console.warn(`[expandNoteContentRecursively] Database not found for ${notePath}`)
          continue
        }

        const childAbsPath = path.join(dbInfo.folderPath, childRange.path)

        // Read child content
        let childContent = ''
        try {
          childContent = await fs.readFile(childAbsPath, 'utf-8')
        } catch (err) {
          console.warn(
            `[expandNoteContentRecursively] Failed to read child ${childRange.path}:`,
            err.message
          )
          childContent = '[Content unavailable]'
        }

        // Recursively expand child content
        const expandedChildContent = await expandNoteContentRecursively(
          childAbsPath,
          childContent,
          libraryId,
          getCentralDbPath,
          currentDepth + 1,
          maxDepth,
          newVisitedPaths
        )

        // Replace the range with expanded content
        // Note: range_start is 1-based, array indices are 0-based
        const beforeLines = lines.slice(0, childRange.start - 1)
        const expandedLines = expandedChildContent.split('\n')
        const afterLines = lines.slice(childRange.end) // range_end is inclusive, slice is exclusive

        lines = [...beforeLines, ...expandedLines, ...afterLines]
      } catch (err) {
        console.error(
          `[expandNoteContentRecursively] Error processing child ${childRange.path}:`,
          err.message
        )
        // Continue processing other children even if one fails
      }
    }

    return lines.join('\n')
  } catch (error) {
    console.error(`[expandNoteContentRecursively] Error expanding ${notePath}:`, error.message)
    return noteContent
  }
}

/**
 * Get the extracted ranges from all child notes of a parent note
 * @param {string} parentPath - Absolute path to parent note
 * @param {string} libraryId - Library ID
 * @param {Function} getCentralDbPath - Function to get central DB path
 * @returns {Promise<Object>} - Child notes ranges information
 */
async function getChildRanges(parentPath, libraryId, getCentralDbPath) {
  try {
    const dbInfo = await getWorkspaceDbPath(libraryId, getCentralDbPath)
    if (!dbInfo.found) {
      return { success: false, error: 'Database not found' }
    }

    const db = new Database(dbInfo.dbPath)
    const parentRelativePath = path.relative(dbInfo.folderPath, parentPath)

    // Use recursive CTE to calculate nesting depth for all children at once
    const children = db
      .prepare(
        `
        WITH RECURSIVE parent_chain AS (
          -- Base case: get all direct children of the parent
          SELECT 
            relative_path,
            parent_path,
            range_start,
            range_end,
            1 AS nesting_depth
          FROM note_source
          WHERE library_id = ? 
            AND parent_path = ? 
            AND extract_type = 'text-lines'
          
          UNION ALL
          
          -- Recursive case: traverse up the parent chain to count depth
          SELECT 
            pc.relative_path,
            ns.parent_path,
            pc.range_start,
            pc.range_end,
            pc.nesting_depth + 1
          FROM parent_chain pc
          INNER JOIN note_source ns ON pc.parent_path = ns.relative_path
          WHERE ns.library_id = ? AND pc.nesting_depth < 10  -- Safety limit
        )
        SELECT 
          relative_path,
          range_start,
          range_end
        FROM parent_chain
        GROUP BY relative_path, range_start, range_end
        ORDER BY range_start ASC
      `
      )
      .all(libraryId, parentRelativePath, libraryId)
    console.log('[get childranges], children', children)

    const ranges = []

    for (const child of children) {
      const childAbsPath = path.join(dbInfo.folderPath, child.relative_path)

      // Read child note content
      let childContent = ''
      try {
        childContent = await fs.readFile(childAbsPath, 'utf-8')
      } catch (err) {
        console.warn(`Failed to read child note ${child.relative_path}:`, err.message)
        childContent = '[Content unavailable]'
      }

      // Recursively expand child content to show nested extracts
      const expandedContent = await expandNoteContentRecursively(
        childAbsPath,
        childContent,
        libraryId,
        getCentralDbPath,
        0, // Start at depth 0
        10 // Max 10 levels
      )

      ranges.push({
        path: child.relative_path,
        start: parseInt(child.range_start),
        end: parseInt(child.range_end),
        content: expandedContent,
        lineCount: expandedContent.split('\n').length,
      })
    }

    db.close()

    return {
      success: true,
      ranges,
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// Update locked line ranges in database after line shifts
async function updateLockedRanges(parentPath, rangeUpdates, libraryId, getCentralDbPath) {
  try {
    const dbInfo = await getWorkspaceDbPath(libraryId, getCentralDbPath)
    if (!dbInfo.found) {
      return { success: false, error: 'Database not found' }
    }

    const db = new Database(dbInfo.dbPath)
    const parentRelativePath = path.relative(dbInfo.folderPath, parentPath)

    // Use transaction to ensure atomicity
    const updateStmt = db.prepare(`
      UPDATE note_source 
      SET range_start = ?, range_end = ?
      WHERE library_id = ? 
        AND parent_path = ? 
        AND relative_path = ?
    `)

    const transaction = db.transaction((updates) => {
      for (let update of updates) {
        updateStmt.run(
          update.newStart,
          update.newEnd,
          libraryId,
          parentRelativePath,
          update.childPath
        )
      }
    })

    transaction(rangeUpdates)
    db.close()

    return {
      success: true,
      updatedCount: rangeUpdates.length,
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

async function readFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    return { success: true, content }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

async function writeFile(filePath, content) {
  try {
    await fs.writeFile(filePath, content, 'utf-8')
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

async function extractNote(
  parentFilePath,
  selectedText,
  rangeStart,
  rangeEnd,
  libraryId,
  getCentralDbPath
) {
  try {
    // Get database info from central database
    const dbInfo = await getWorkspaceDbPath(libraryId, getCentralDbPath)
    if (!dbInfo.found) {
      return {
        success: false,
        error: dbInfo.error || 'Database not found',
      }
    }

    // Open database connection early (needed for finding note folder)
    const db = new Database(dbInfo.dbPath)

    try {
      // Find the top-level note folder (flat structure)
      const noteFolder = findTopLevelNoteFolder(parentFilePath, db, libraryId, dbInfo.folderPath)

      // Create note folder if it doesn't exist
      await fs.mkdir(noteFolder, { recursive: true })

      // Generate new filename using hierarchical naming scheme
      const newFileName =
        generateChildNoteName(parentFilePath, rangeStart, rangeEnd, selectedText) + '.md'
      const newFilePath = path.join(noteFolder, newFileName)

      // Check if file already exists
      try {
        await fs.access(newFilePath)
        return {
          success: false,
          error: 'A note with this name already exists. Please select different lines.',
        }
      } catch {
        // File doesn't exist, good to proceed
      }

      // Write the new note file
      await fs.writeFile(newFilePath, selectedText, 'utf-8')

      // Update database
      const relativePath = path.relative(dbInfo.folderPath, newFilePath)
      const parentRelativePath = path.relative(dbInfo.folderPath, parentFilePath)

      // Insert file record
      db.prepare(
        `
            INSERT INTO file (library_id, relative_path, added_time, review_count, easiness, rank, due_time)
            VALUES (?, ?, datetime('now'), 0, 0.0, 70.0, datetime('now'))
          `
      ).run(libraryId, relativePath)

      // Insert note_source record with parent_path
      if (rangeStart && rangeEnd) {
        const sourceHash = crypto.createHash('sha256').update(selectedText).digest('hex')
        try {
          db.prepare(
            `
                INSERT INTO note_source (library_id, relative_path, parent_path, extract_type, range_start, range_end, source_hash)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `
          ).run(
            libraryId,
            relativePath,
            parentRelativePath,
            'text-lines',
            String(rangeStart),
            String(rangeEnd),
            sourceHash
          )
        } catch (err) {
          console.error('Failed to insert note_source record:', err.message)
        }
      }

      return {
        success: true,
        fileName: newFileName,
        filePath: newFilePath,
      }
    } finally {
      // Ensure database is always closed
      db.close()
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * Extract PDF pages as metadata file
 * @param {string} pdfPath - Path to PDF file
 * @param {number} startPage - Start page number (1-indexed)
 * @param {number} endPage - End page number (1-indexed)
 * @param {string} libraryId - Library ID
 * @param {Function} getCentralDbPath - Function to get central DB path
 * @returns {Promise<Object>} - Result object
 */
async function extractPdfPages(pdfPath, startPage, endPage, libraryId, getCentralDbPath) {
  try {
    console.log('[extractPdfPages] Starting extraction:', {
      pdfPath,
      startPage,
      endPage,
      libraryId,
    })

    const dbInfo = await getWorkspaceDbPath(libraryId, getCentralDbPath)
    if (!dbInfo.found) {
      return { success: false, error: 'Database not found' }
    }

    const db = new Database(dbInfo.dbPath)
    const rootPath = dbInfo.folderPath

    try {
      // Create PDF container folder
      const containerFolder = path.join(path.dirname(pdfPath), path.basename(pdfPath, '.pdf'))
      console.log('[extractPdfPages] Creating container folder:', containerFolder)

      try {
        await fs.mkdir(containerFolder, { recursive: true })
      } catch (mkdirError) {
        console.error('[extractPdfPages] mkdir error:', mkdirError)
        return {
          success: false,
          error: `Failed to create container folder: ${mkdirError.message}`,
        }
      }

      const metadataFilePath = path.join(containerFolder, `${startPage}-${endPage}-pages.md`)
      console.log('[extractPdfPages] Will create metadata file:', metadataFilePath)
      const relativePath = path.relative(rootPath, metadataFilePath)
      const parentRelativePath = path.relative(rootPath, pdfPath)

      // Check if file already exists
      try {
        await fs.access(metadataFilePath)
        return {
          success: false,
          error: 'A note with this page range already exists. Please select different pages.',
        }
      } catch {
        // File doesn't exist, good to proceed
      }

      // Create metadata file
      const metadataContent = '## Notes'
      await fs.writeFile(metadataFilePath, metadataContent, 'utf-8')

      // Insert into database
      db.prepare(
        `
        INSERT INTO file (library_id, relative_path, added_time, due_time)
        VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `
      ).run(libraryId, relativePath)

      db.prepare(
        `
        INSERT INTO note_source 
        (library_id, relative_path, parent_path, extract_type, range_start, range_end, source_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        libraryId,
        relativePath,
        parentRelativePath,
        'pdf-page',
        String(startPage),
        String(endPage),
        null
        // No source hash for pdf page extraction
      )

      return {
        success: true,
        filePath: metadataFilePath,
        fileName: `${startPage}-${endPage}-pages.md`,
      }
    } finally {
      db.close()
    }
  } catch (error) {
    console.error('Error extracting PDF pages:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Get extract information for a note file from database
 * Simple query to check if file is an extract and get its source info
 *
 * @param {string} notePath - Absolute path to the note file
 * @param {string} libraryId - Library ID
 * @param {Function} getCentralDbPath - Function to get central DB path
 * @returns {Promise<Object>} - Extract info or null
 */
async function getNoteExtractInfo(notePath, libraryId, getCentralDbPath) {
  try {
    const dbInfo = await getWorkspaceDbPath(libraryId, getCentralDbPath)
    if (!dbInfo.found) {
      return { success: false, error: 'Database not found' }
    }

    const db = new Database(dbInfo.dbPath)
    const relativePath = path.relative(dbInfo.folderPath, notePath)

    try {
      const info = db
        .prepare(
          `
        SELECT parent_path, extract_type, range_start, range_end
        FROM note_source
        WHERE library_id = ? AND relative_path = ?
      `
        )
        .get(libraryId, relativePath)

      if (!info) {
        return { success: true, found: false }
      }

      // Convert relative parent_path to absolute path
      const absoluteParentPath = path.join(dbInfo.folderPath, info.parent_path)

      return {
        success: true,
        found: true,
        extractType: info.extract_type,
        parentPath: absoluteParentPath,
        rangeStart: info.range_start ? parseInt(info.range_start) : null,
        rangeEnd: info.range_end ? parseInt(info.range_end) : null,
      }
    } finally {
      db.close()
    }
  } catch (error) {
    console.error('Error getting note extract info:', error)
    return { success: false, error: error.message }
  }
}
export function registerIncrementalIpc(ipcMain, getCentralDbPath) {
  ipcMain.handle('read-file', async (event, filePath) => readFile(filePath))

  ipcMain.handle('write-file', async (event, filePath, content) => writeFile(filePath, content))

  ipcMain.handle(
    'extract-note',
    async (event, parentFilePath, selectedText, rangeStart, rangeEnd, libraryId) =>
      extractNote(parentFilePath, selectedText, rangeStart, rangeEnd, libraryId, getCentralDbPath)
  )

  ipcMain.handle('validate-note', async (event, notePath, libraryId) =>
    validateAndRecoverNoteRange(notePath, libraryId, getCentralDbPath)
  )

  ipcMain.handle('compare-filename-with-db-range', async (event, notePath, libraryId) =>
    compareFilenameWithDbRange(notePath, libraryId, getCentralDbPath)
  )

  ipcMain.handle('get-child-ranges', async (event, parentPath, libraryId) =>
    getChildRanges(parentPath, libraryId, getCentralDbPath)
  )

  ipcMain.handle('update-locked-ranges', async (event, parentPath, rangeUpdates, libraryId) =>
    updateLockedRanges(parentPath, rangeUpdates, libraryId, getCentralDbPath)
  )

  // PDF extraction handlers
  ipcMain.handle('extract-pdf-pages', async (event, pdfPath, startPage, endPage, libraryId) =>
    extractPdfPages(pdfPath, startPage, endPage, libraryId, getCentralDbPath)
  )

  ipcMain.handle('get-note-extract-info', async (event, notePath, libraryId) =>
    getNoteExtractInfo(notePath, libraryId, getCentralDbPath)
  )
}

// Export functions for testing
export {
  readFile,
  writeFile,
  extractNote,
  parseNoteFileName,
  generateChildNoteName,
  findTopLevelNoteFolder,
  findParentPath,
  extractLines,
  findContentByHashAndLineCount,
  validateAndRecoverNoteRange,
  compareFilenameWithDbRange,
  getChildRanges,
  expandNoteContentRecursively,
  updateLockedRanges,
  extractPdfPages,
  getNoteExtractInfo,
}
