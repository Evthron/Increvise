// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Incremental Reading IPC Handlers
import path from 'node:path'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import Database from 'better-sqlite3'
import { getWorkspaceDbPath } from '../db/index.js'

/**
 * Generate random days for initial review of extracted content
 * @returns {number} Random number of days
 */
function getRandomInitialDays() {
  return Math.floor(Math.random() * 6) + 3 // 3 to 8 days
}

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

  // Strip HTML tags to get plain text for naming
  // This regex removes all HTML tags including their attributes
  const plainText = extractedText.replace(/<[^>]*>/g, '').trim()

  // Generate name from first 3 words of extracted text - optimized
  let words = ''
  const text = plainText
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
    // Parent is a top-level file - extract name from filename (as fallback)
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

    // For HTML/semantic extractions (rangeStart/rangeEnd = 0), use words from content with 0-0 prefix
    // For text-line extractions, use range-based naming with parent name as fallback
    if (rangeStart === 0 && rangeEnd === 0) {
      return `0-0-${words || parentName || 'note'}`
    } else {
      return `${rangeStart}-${rangeEnd}-${parentName || words || 'note'}`
    }
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
  // Normalize the parent file path to ensure it's absolute
  const normalizedParentPath = path.resolve(parentFilePath)

  // Ensure rootPath is also normalized
  const normalizedRootPath = path.resolve(rootPath)

  // Calculate relative path, ensuring it doesn't contain '..'
  // If parentFilePath is outside rootPath, this will return a path starting with '..'
  const parentRelativePath = path.relative(normalizedRootPath, normalizedParentPath)

  // Check if the path goes outside the root (contains '..')
  if (parentRelativePath.startsWith('..')) {
    console.error('[findTopLevelNoteFolder] Parent file is outside workspace:', {
      parentFilePath: normalizedParentPath,
      rootPath: normalizedRootPath,
      relativePath: parentRelativePath,
    })
    // Fallback: create folder in same directory as parent file
    const parentDir = path.dirname(normalizedParentPath)
    const parentFileName = path.basename(normalizedParentPath, path.extname(normalizedParentPath))
    return path.join(parentDir, parentFileName)
  }

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
    const parentDir = path.dirname(normalizedParentPath)
    const parentFileName = path.basename(normalizedParentPath, path.extname(normalizedParentPath))
    return path.join(parentDir, parentFileName)
  } else {
    // Parent is a child note, recursively find its top-level ancestor
    const grandParentPath = path.join(normalizedRootPath, result.parent_path)
    return findTopLevelNoteFolder(grandParentPath, db, libraryId, normalizedRootPath)
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
  const dbInfo = await getWorkspaceDbPath(libraryId, getCentralDbPath)
  if (!dbInfo.found) {
    return { success: false, error: 'Database not found' }
  }

  const db = new Database(dbInfo.dbPath)
  const relativePath = path.relative(dbInfo.folderPath, notePath)

  const directChildren = db
    .prepare(
      `SELECT relative_path, range_start, range_end, source_hash
           FROM note_source
           WHERE library_id = ? AND parent_path = ?`
    )
    .all(libraryId, relativePath)

  // Read parent content
  const parentContent = await fs.readFile(notePath, 'utf-8')
  for (const child of directChildren) {
    const relativePath = child.relative_path

    // Validate current position in database
    const dbRange = [parseInt(child.range_start), parseInt(child.range_end)]
    const currentContent = extractLines(parentContent, dbRange[0], dbRange[1])
    const currentHash = crypto.createHash('sha256').update(currentContent).digest('hex')

    // If hash mismatch, try to recover
    if (currentHash !== child.source_hash) {
      const lineCount = dbRange[1] - dbRange[0] + 1

      const newRange = findContentByHashAndLineCount(parentContent, child.source_hash, lineCount)

      if (newRange) {
        // Recovery successful - update database
        db.prepare(
          `
              UPDATE note_source
              SET range_start = ?, range_end = ?
              WHERE library_id = ? AND relative_path = ?
            `
        ).run(String(newRange.start), String(newRange.end), libraryId, relativePath)
      } else {
        console.warn(`Failed to recover position for child note: ${relativePath}`)
      }
    }
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

/**
 * Get the extracted ranges from all child notes of a parent note
 * @param {string} parentPath - Absolute path to parent note
 * @param {string} libraryId - Library ID
 * @param {Function} getCentralDbPath - Function to get central DB path
 * @param {boolean} useDynamicContent - Whether to expand nested children (default: true)
 * Return list of child notes, each child note object:
 *   {
 *     path: relative path of the child note,
 *     start: range start
 *     end: range end
 *     content: inner content of the child note
 *     lineCount: line count of the child note
 *   }
 */
async function getChildRanges(parentPath, libraryId, getCentralDbPath, useDynamicContent = true) {
  try {
    const dbInfo = await getWorkspaceDbPath(libraryId, getCentralDbPath)
    if (!dbInfo.found) {
      return { success: false, error: 'Database not found' }
    }

    const db = new Database(dbInfo.dbPath)
    const parentRelativePath = path.relative(dbInfo.folderPath, parentPath)

    // Check if parent is a PDF file
    const isPdfParent = path.extname(parentPath).toLowerCase() === '.pdf'

    // Auto-validate and recover all direct children before retrieving ranges
    // This ensures that ranges are up-to-date if parent file was modified externally
    if (!isPdfParent) {
      validateAndRecoverNoteRange(parentPath, libraryId, getCentralDbPath)
    }

    // Simple query: only get direct children
    if (!useDynamicContent) {
      const children = db
        .prepare(
          `SELECT
            relative_path,
            parent_path,
            range_start,
            range_end,
            extract_type
          FROM note_source
          WHERE library_id = ? AND parent_path = ?
          ORDER BY range_start ASC
        `
        )
        .all(libraryId, parentRelativePath)

      // Read direct children content (skip if parent is PDF)
      if (!isPdfParent) {
        for (const child of children) {
          const childAbsPath = path.join(dbInfo.folderPath, child.relative_path)
          try {
            child.content = await fs.readFile(childAbsPath, 'utf-8')
          } catch (err) {
            console.warn(`Failed to read child note ${child.relative_path}:`, err.message)
            child.content = '[Content unavailable]'
          }
        }
      }

      const ranges = children.map((child) => {
        // Parse range_start and range_end to handle line numbers
        const parseRange = (rangeStr) => {
          if (rangeStr.includes(':')) {
            const [page, line] = rangeStr.split(':')
            return { page: parseInt(page), line: parseInt(line) }
          }
          return { page: parseInt(rangeStr), line: null }
        }

        const startParsed = parseRange(child.range_start)
        const endParsed = parseRange(child.range_end)

        return {
          path: child.relative_path,
          extract_type: child.extract_type,
          start: parseInt(child.range_start),
          end: parseInt(child.range_end),
          pageNum: startParsed.page,
          lineStart: startParsed.line,
          lineEnd: endParsed.line,
          content: isPdfParent ? undefined : child.content,
          lineCount: isPdfParent ? undefined : child.content.split('\n').length,
        }
      })

      db.close()

      return {
        success: true,
        ranges,
      }
    }

    // Dynamic content: use recursive CTE to get all nested children
    const children = db
      .prepare(
        `WITH RECURSIVE parent_chain AS (
          SELECT
            relative_path,
            parent_path, 
            range_start,
            range_end,
            extract_type,
            1 AS recur_depth
          FROM note_source
          WHERE library_id = ? AND parent_path = ?

          UNION ALL
          
          SELECT
            ns.relative_path,
            ns.parent_path,
            ns.range_start,
            ns.range_end,
            ns.extract_type,
            pc.recur_depth + 1
          FROM parent_chain AS pc
          INNER JOIN note_source AS ns ON pc.relative_path = ns.parent_path
          WHERE ns.library_id = ? AND recur_depth < 10 -- max 10 child layers 
        )
  
        SELECT
          relative_path,
          parent_path,
          range_start,
          range_end,
          extract_type,
          recur_depth
        FROM parent_chain
        ORDER BY recur_depth DESC, range_start DESC
      `
      )
      .all(libraryId, parentRelativePath, libraryId)

    // Read all children content
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      const childAbsPath = path.join(dbInfo.folderPath, child.relative_path)
      try {
        child.content = await fs.readFile(childAbsPath, 'utf-8')
      } catch (err) {
        console.warn(`Failed to read child note ${child.relative_path}:`, err.message)
        child.content = '[Content unavailable]'
      }
    }

    // Create a Map for O(1) lookup of children by relative_path
    const childrenMap = new Map(children.map((c) => [c.relative_path, c]))

    // Merging content from grandchild and deeper notes to direct child
    // recur_depth DESC: bottom-to-top traversal
    // range_start DESC: Ensures that replacing lines in a parent does not disrupt the line numbers for other children
    for (const child of children) {
      // direct children are skipped
      if (child.recur_depth === 1) continue

      const parent = childrenMap.get(child.parent_path)

      if (parent && parent.content) {
        // Replace lines in parent with child content
        const lines = parent.content.split('\n')
        // range_start and range_end are 1-based
        const rangeStart = parseInt(child.range_start) - 1
        const rangeEnd = parseInt(child.range_end) - 1

        // Split parent content into: before, (replaced with child), after
        const beforeLines = lines.slice(0, rangeStart)
        const childLines = child.content.split('\n')
        const afterLines = lines.slice(rangeEnd + 1)

        // Update parent content
        parent.content = [...beforeLines, ...childLines, ...afterLines].join('\n')
      }
    }

    // Filter to only return direct children (depth=1)
    const directChildren = children.filter((c) => c.recur_depth === 1)

    // Sort by range_start ASC for final output
    directChildren.sort((a, b) => parseInt(a.range_start) - parseInt(b.range_start))

    // Map to result format
    const ranges = directChildren.map((child) => {
      // Parse range_start and range_end to handle line numbers
      // Format: "pageNum:lineNum" or just "pageNum"
      const parseRange = (rangeStr) => {
        if (rangeStr.includes(':')) {
          const [page, line] = rangeStr.split(':')
          return { page: parseInt(page), line: parseInt(line) }
        }
        return { page: parseInt(rangeStr), line: null }
      }

      const startParsed = parseRange(child.range_start)
      const endParsed = parseRange(child.range_end)

      return {
        path: child.relative_path,
        extract_type: child.extract_type,
        start: parseInt(child.range_start),
        end: parseInt(child.range_end),
        // Add parsed page and line numbers for PDFs
        pageNum: startParsed.page,
        lineStart: startParsed.line,
        lineEnd: endParsed.line,
        content: child.content,
        lineCount: child.content ? child.content.split('\n').length : 0,
      }
    })

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
      // Preserve parent file's extension to maintain format (.html, .md, etc.)
      const parentExt = path.extname(parentFilePath)
      const newFileName =
        generateChildNoteName(parentFilePath, rangeStart, rangeEnd, selectedText) + parentExt
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
      // Set due_time to random days later (3-10 days)
      const initialDays = getRandomInitialDays()
      db.prepare(
        `
            INSERT INTO file (library_id, relative_path, added_time, review_count, easiness, rank, due_time, intermediate_base, intermediate_multiplier)
            VALUES (?, ?, datetime('now'), 0, 0.0, 70.0, datetime('now', '+' || ? || ' days'), 7, 1.0)
          `
      ).run(libraryId, relativePath, initialDays)

      // Add to intermediate queue (for extracted notes)
      db.prepare(
        `
            INSERT INTO queue_membership (library_id, queue_name, relative_path)
            VALUES (?, 'intermediate', ?)
          `
      ).run(libraryId, relativePath)

      // Insert note_source record with parent_path
      // Note: For HTML/semantic extractions, rangeStart and rangeEnd are both 0
      if (rangeStart !== undefined && rangeEnd !== undefined) {
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
      // Set due_time to random days later (3-10 days)
      const initialDays = getRandomInitialDays()
      db.prepare(
        `
        INSERT INTO file (library_id, relative_path, added_time, review_count, easiness, rank, due_time, intermediate_base, intermediate_multiplier)
        VALUES (?, ?, datetime('now'), 0, 0.0, 70.0, datetime('now', '+' || ? || ' days'), 7, 1.0)
      `
      ).run(libraryId, relativePath, initialDays)

      // Add to intermediate queue (for extracted notes)
      db.prepare(
        `
        INSERT INTO queue_membership (library_id, queue_name, relative_path)
        VALUES (?, 'intermediate', ?)
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
 * Extract text from PDF page
 * @param {string} pdfPath - Path to PDF file
 * @param {string} text - Selected text content
 * @param {number} pageNum - Page number (1-indexed)
 * @param {number} lineStart - Start line number (1-indexed, optional)
 * @param {number} lineEnd - End line number (1-indexed, optional)
 * @param {string} libraryId - Library ID
 * @param {Function} getCentralDbPath - Function to get central DB path
 * @returns {Promise<Object>} - Result object
 */
async function extractPdfText(
  pdfPath,
  text,
  pageNum,
  lineStart,
  lineEnd,
  libraryId,
  getCentralDbPath
) {
  try {
    console.log('[extractPdfText] Starting extraction:', {
      pdfPath,
      pageNum,
      textLength: text.length,
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
      console.log('[extractPdfText] Creating container folder:', containerFolder)

      try {
        await fs.mkdir(containerFolder, { recursive: true })
      } catch (mkdirError) {
        console.error('[extractPdfText] mkdir error:', mkdirError)
        return {
          success: false,
          error: `Failed to create container folder: ${mkdirError.message}`,
        }
      }

      // Generate filename from first 3 words
      let words = ''
      const trimmedText = text.trim()
      let wordCount = 0
      let currentWord = ''

      for (let i = 0; i < trimmedText.length && wordCount < 3; i++) {
        const char = trimmedText[i]
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

      if (!words) words = 'text'

      const fileName = `${pageNum}-${pageNum}-${words}.md`
      const textFilePath = path.join(containerFolder, fileName)
      console.log('[extractPdfText] Will create text file:', textFilePath)
      const relativePath = path.relative(rootPath, textFilePath)
      const parentRelativePath = path.relative(rootPath, pdfPath)

      // Check if file already exists
      try {
        await fs.access(textFilePath)
        return {
          success: false,
          error: 'A note with this name already exists. Please select different text.',
        }
      } catch {
        // File doesn't exist, good to proceed
      }

      // Write text to file
      await fs.writeFile(textFilePath, text, 'utf-8')

      // Insert into database
      // Set due_time to random days later (3-10 days)
      const initialDays = getRandomInitialDays()
      db.prepare(
        `
        INSERT INTO file (library_id, relative_path, added_time, review_count, easiness, rank, due_time, intermediate_base, intermediate_multiplier)
        VALUES (?, ?, datetime('now'), 0, 0.0, 70.0, datetime('now', '+' || ? || ' days'), 7, 1.0)
      `
      ).run(libraryId, relativePath, initialDays)

      // Add to intermediate queue (for extracted notes)
      db.prepare(
        `
        INSERT INTO queue_membership (library_id, queue_name, relative_path)
        VALUES (?, 'intermediate', ?)
      `
      ).run(libraryId, relativePath)

      // Create source hash for text
      const sourceHash = crypto.createHash('sha256').update(text).digest('hex')

      // Store line numbers in range_start and range_end
      // Format: "pageNum:lineStart-lineEnd" or just "pageNum" if no line numbers
      const rangeStart =
        lineStart !== undefined && lineStart !== null ? `${pageNum}:${lineStart}` : String(pageNum)
      const rangeEnd =
        lineEnd !== undefined && lineEnd !== null ? `${pageNum}:${lineEnd}` : String(pageNum)

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
        'pdf-text',
        rangeStart,
        rangeEnd,
        sourceHash
      )

      return {
        success: true,
        filePath: textFilePath,
        fileName: fileName,
      }
    } finally {
      db.close()
    }
  } catch (error) {
    console.error('Error extracting PDF text:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Extract video clip (time range)
 * @param {string} videoPath - Path to video file
 * @param {number} startTime - Start time in seconds
 * @param {number} endTime - End time in seconds
 * @param {string} libraryId - Library ID
 * @param {Function} getCentralDbPath - Function to get central DB path
 * @returns {Promise<Object>} - Result object
 */
async function extractVideoClip(videoPath, startTime, endTime, libraryId, getCentralDbPath) {
  try {
    console.log('[extractVideoClip] Starting extraction:', {
      videoPath,
      startTime,
      endTime,
      libraryId,
    })

    const dbInfo = await getWorkspaceDbPath(libraryId, getCentralDbPath)
    if (!dbInfo.found) {
      return { success: false, error: 'Database not found' }
    }

    const db = new Database(dbInfo.dbPath)
    const rootPath = dbInfo.folderPath

    try {
      // Get video file name without extension
      const videoExt = path.extname(videoPath)
      const videoBaseName = path.basename(videoPath, videoExt)

      // Create video container folder
      const containerFolder = path.join(path.dirname(videoPath), videoBaseName)
      console.log('[extractVideoClip] Creating container folder:', containerFolder)

      try {
        await fs.mkdir(containerFolder, { recursive: true })
      } catch (mkdirError) {
        console.error('[extractVideoClip] mkdir error:', mkdirError)
        return {
          success: false,
          error: `Failed to create container folder: ${mkdirError.message}`,
        }
      }

      // Generate filename: {startTime}-{endTime}-clip.md
      const fileName = `${startTime}-${endTime}-clip.md`
      const metadataFilePath = path.join(containerFolder, fileName)
      console.log('[extractVideoClip] Will create metadata file:', metadataFilePath)
      const relativePath = path.relative(rootPath, metadataFilePath)
      const parentRelativePath = path.relative(rootPath, videoPath)

      // Check if file already exists
      try {
        await fs.access(metadataFilePath)
        return {
          success: false,
          error: 'A note with this time range already exists. Please select a different range.',
        }
      } catch {
        // File doesn't exist, good to proceed
      }

      // Create metadata file
      const metadataContent = '## Video Notes'
      await fs.writeFile(metadataFilePath, metadataContent, 'utf-8')

      // Insert into database
      // Set due_time to random days later (3-10 days)
      const initialDays = getRandomInitialDays()
      db.prepare(
        `
        INSERT INTO file (library_id, relative_path, added_time, review_count, easiness, rank, due_time, intermediate_base, intermediate_multiplier)
        VALUES (?, ?, datetime('now'), 0, 0.0, 70.0, datetime('now', '+' || ? || ' days'), 7, 1.0)
      `
      ).run(libraryId, relativePath, initialDays)

      // Add to intermediate queue (for extracted notes)
      db.prepare(
        `
        INSERT INTO queue_membership (library_id, queue_name, relative_path)
        VALUES (?, 'intermediate', ?)
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
        'video-clip',
        String(startTime),
        String(endTime),
        null // No source hash for video clip extraction
      )

      return {
        success: true,
        filePath: metadataFilePath,
        fileName: fileName,
      }
    } finally {
      db.close()
    }
  } catch (error) {
    console.error('Error extracting video clip:', error)
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
/**
 * Extract a flashcard from text-based file
 * @param {string} parentFilePath - Path to parent file
 * @param {string} selectedText - Selected text (answer)
 * @param {number} charStart - Start character position
 * @param {number} charEnd - End character position
 * @param {string} libraryId - Library ID
 * @param {Function} getCentralDbPath - Function to get central DB path
 * @returns {Promise<Object>} - Result object
 */
async function extractFlashcard(
  parentFilePath,
  selectedText,
  charStart,
  charEnd,
  libraryId,
  getCentralDbPath
) {
  try {
    console.log('[extractFlashcard] Starting flashcard extraction:', {
      parentFilePath,
      textLength: selectedText.length,
      charStart,
      charEnd,
      libraryId,
    })

    // Get database info from central database
    const dbInfo = await getWorkspaceDbPath(libraryId, getCentralDbPath)
    if (!dbInfo.found) {
      return {
        success: false,
        error: dbInfo.error || 'Database not found',
      }
    }

    const db = new Database(dbInfo.dbPath)

    try {
      // Find the top-level note folder (flat structure)
      const noteFolder = findTopLevelNoteFolder(parentFilePath, db, libraryId, dbInfo.folderPath)

      // Create note folder if it doesn't exist
      await fs.mkdir(noteFolder, { recursive: true })

      // Generate new filename using character ranges
      const baseName = generateChildNoteName(parentFilePath, charStart, charEnd, selectedText)
      const newFileName = baseName + '.flashcard'
      const newFilePath = path.join(noteFolder, newFileName)

      console.log('[extractFlashcard] Generated file path:', newFilePath)

      // Check if file already exists
      try {
        await fs.access(newFilePath)
        return {
          success: false,
          error: 'A flashcard with this name already exists. Please select different text.',
        }
      } catch {
        // File doesn't exist, good to proceed
      }

      // Write empty flashcard file (dummy file)
      await fs.writeFile(newFilePath, '', 'utf-8')
      console.log('[extractFlashcard] Created empty flashcard file')

      // Update database
      const relativePath = path.relative(dbInfo.folderPath, newFilePath)
      const parentRelativePath = path.relative(dbInfo.folderPath, parentFilePath)

      console.log('[extractFlashcard] Database paths:', {
        relativePath,
        parentRelativePath,
      })

      // Insert file record - flashcards go to spaced-standard queue with initial interval
      db.prepare(
        `
            INSERT INTO file (library_id, relative_path, added_time, review_count, easiness, rank, interval, due_time)
            VALUES (?, ?, datetime('now'), 0, 2.5, 70.0, 1, datetime('now', '+1 day'))
          `
      ).run(libraryId, relativePath)
      console.log('[extractFlashcard] Inserted file record')

      // Add to spaced-standard queue (for flashcards)
      db.prepare(
        `
            INSERT INTO queue_membership (library_id, queue_name, relative_path)
            VALUES (?, 'spaced-standard', ?)
          `
      ).run(libraryId, relativePath)
      console.log('[extractFlashcard] Added to spaced-standard queue')

      // Insert note_source record with character positions
      const sourceHash = crypto.createHash('sha256').update(selectedText).digest('hex')
      db.prepare(
        `
            INSERT INTO note_source (library_id, relative_path, parent_path, extract_type, range_start, range_end, source_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `
      ).run(
        libraryId,
        relativePath,
        parentRelativePath,
        'flashcard',
        String(charStart),
        String(charEnd),
        sourceHash
      )
      console.log('[extractFlashcard] Inserted note_source record with type: flashcard')

      console.log('[extractFlashcard] ✓ Flashcard extraction completed successfully')

      return {
        success: true,
        fileName: newFileName,
        filePath: newFilePath,
      }
    } finally {
      db.close()
    }
  } catch (error) {
    console.error('[extractFlashcard] ✗ Error:', error)
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

  ipcMain.handle(
    'get-child-ranges',
    async (event, parentPath, libraryId, useDynamicContent = true) =>
      getChildRanges(parentPath, libraryId, getCentralDbPath, useDynamicContent)
  )

  ipcMain.handle('update-locked-ranges', async (event, parentPath, rangeUpdates, libraryId) =>
    updateLockedRanges(parentPath, rangeUpdates, libraryId, getCentralDbPath)
  )

  // PDF extraction handlers
  ipcMain.handle('extract-pdf-pages', async (event, pdfPath, startPage, endPage, libraryId) =>
    extractPdfPages(pdfPath, startPage, endPage, libraryId, getCentralDbPath)
  )

  ipcMain.handle(
    'extract-pdf-text',
    async (event, pdfPath, text, pageNum, lineStart, lineEnd, libraryId) =>
      extractPdfText(pdfPath, text, pageNum, lineStart, lineEnd, libraryId, getCentralDbPath)
  )

  // Video extraction handlers
  ipcMain.handle('extract-video-clip', async (event, videoPath, startTime, endTime, libraryId) =>
    extractVideoClip(videoPath, startTime, endTime, libraryId, getCentralDbPath)
  )

  // Flashcard extraction handler
  ipcMain.handle(
    'extract-flashcard',
    async (event, parentFilePath, selectedText, charStart, charEnd, libraryId) =>
      extractFlashcard(
        parentFilePath,
        selectedText,
        charStart,
        charEnd,
        libraryId,
        getCentralDbPath
      )
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
  updateLockedRanges,
  extractPdfPages,
  extractPdfText,
  extractVideoClip,
  getNoteExtractInfo,
}
