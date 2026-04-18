// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Incremental Reading IPC Handlers
import { Buffer } from 'node:buffer'
import path from 'node:path'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import Database from 'better-sqlite3'
import { env, pipeline } from '@xenova/transformers'
import { getWorkspaceDbPath } from '../db/index.js'

const DEFAULT_EMBEDDING_SIMILARITY_THRESHOLD = 0.82
const DEFAULT_EMBEDDING_MODEL = 'Xenova/multilingual-e5-small'
let embeddingPipelinePromise = null

// Create single instance of the pipeline
async function getEmbeddingPipeline() {
  if (!embeddingPipelinePromise) {
    env.allowRemoteModels = true
    embeddingPipelinePromise = pipeline('feature-extraction', DEFAULT_EMBEDDING_MODEL, {
      quantized: true,
    })
  }

  return embeddingPipelinePromise
}

async function embedText(text) {
  const pipelineInstance = await getEmbeddingPipeline()
  const output = await pipelineInstance(text, {
    pooling: 'mean',
    normalize: true,
  })

  return Float32Array.from(output.data)
}

function serializeEmbedding(vector) {
  return new Uint8Array(
    vector.buffer.slice(vector.byteOffset, vector.byteOffset + vector.byteLength)
  )
}

function deserializeEmbedding(bytes) {
  const raw = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4)
  return Float32Array.from(raw)
}

function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    return -1
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < vecA.length; i++) {
    const a = vecA[i]
    const b = vecB[i]
    dotProduct += a * b
    normA += a * a
    normB += b * b
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  if (denominator === 0) {
    return -1
  }

  return dotProduct / denominator
}

function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

async function computeFingerprintForText(text, includeEmbedding = true) {
  const contentHash = hashBuffer(Buffer.from(text, 'utf-8'))

  if (!includeEmbedding) {
    return {
      contentHash,
      contentEmbedding: null,
      contentEmbeddingModel: null,
      contentEmbeddingDim: null,
    }
  }

  try {
    const embedding = await embedText(text)
    return {
      contentHash,
      contentEmbedding: serializeEmbedding(embedding),
      contentEmbeddingModel: DEFAULT_EMBEDDING_MODEL,
      contentEmbeddingDim: embedding?.length || null,
    }
  } catch (error) {
    return {
      contentHash,
      contentEmbedding: null,
      contentEmbeddingModel: null,
      contentEmbeddingDim: null,
      embeddingError: error.message,
    }
  }
}

async function computeFingerprintForPath(filePath, includeEmbeddingForText = true) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.txt' || ext === '.md') {
    const text = await fs.readFile(filePath, 'utf-8')
    return computeFingerprintForText(text, includeEmbeddingForText)
  }

  const buffer = await fs.readFile(filePath)
  return {
    contentHash: hashBuffer(buffer),
    contentEmbedding: null,
    contentEmbeddingModel: null,
    contentEmbeddingDim: null,
  }
}

/**
 * Set due_time to random days later (3-10 days)
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
    // Match pattern: [optional p/l prefix]start-end[_ or end]name
    // Examples: "10-20_intro" (with underscore), "10-20" (range only, ends here), "notes" (no range)
    const match = layer.match(/^[pl]?(\d+)-(\d+)(?:_|$)(.*)/)
    if (!match) {
      // No range found - treat as null range with name
      parsed.push({
        rangeStart: null,
        rangeEnd: null,
        name: layer,
      })
    } else {
      parsed.push({
        rangeStart: parseInt(match[1]),
        rangeEnd: parseInt(match[2]),
        name: match[3],
      })
    }
  }

  return parsed.length > 0 ? parsed : null
}

/**
 * Generate filename for a new child note (Option B: go back 2 layers)
 * @param {string} fileRelativePath - Relative path of current file in workspace
 * @param {number} rangeStart - Start line of extracted text
 * @param {number} rangeEnd - End line of extracted text
 * @param {string} extractedText - The extracted text to generate name from
 * @returns {string} - New filename without extension
 */
function generateChildNoteName(parentFilePath, rangeStart, rangeEnd, extractedText) {
  const parentFileName = path.basename(parentFilePath, path.extname(parentFilePath))
  const parentLayers = parseNoteFileName(parentFileName)

  // Strip HTML tags to get plain text for naming
  const plainText = extractedText.replace(/<[^>]*>/g, '').trim()

  // Configuration for name generation
  const MIN_LENGTH = 10 // Minimum character count (strict)
  const SOFT_MAX_LENGTH = 20 // Soft maximum - can exceed to complete a word
  const HARD_MAX_LENGTH = 30 // Hard maximum - never exceed

  /**
   * Generate a clean, multi-language compatible name from text
   * Supports: Latin, CJK (Chinese/Japanese/Korean), Cyrillic, etc.
   *
   * Strategy for CJK:
   * - Use punctuation as phrase boundaries
   * - After MIN_LENGTH characters, stop at next punctuation mark
   * - Don't add hyphens between CJK characters
   *
   * Strategy for Latin:
   * - Use spaces as word boundaries
   * - Add hyphens between words
   */
  function generateNameFromText(text) {
    if (!text || text.length === 0) return ''

    // Helper function to check if character is CJK
    function isCJKChar(code) {
      return (
        (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
        (code >= 0x3400 && code <= 0x4dbf) || // CJK Extension A
        (code >= 0x20000 && code <= 0x2a6df) || // CJK Extension B
        (code >= 0xf900 && code <= 0xfaff) || // CJK Compatibility Ideographs
        (code >= 0x3040 && code <= 0x309f) || // Hiragana
        (code >= 0x30a0 && code <= 0x30ff) || // Katakana
        (code >= 0xac00 && code <= 0xd7af) // Hangul
      )
    }

    // Helper function to check if character is CJK punctuation
    function isCJKPunct(char) {
      return /[。，、；：！？]/.test(char)
    }

    // First pass: clean the text
    let cleaned = text
      .replace(/["""''`]/g, '') // Remove quotes
      .replace(/[<>{}[\]()]/g, '') // Remove brackets
      .replace(/[*_~`|\\#]/g, '') // Remove markdown/special chars (including #)
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()

    if (cleaned.length === 0) return ''

    // Build the filename character by character
    let result = ''
    let lastWasCJK = false
    let lastWasSpace = false
    let reachedMin = false
    let reachedSoftMax = false

    for (let i = 0; i < cleaned.length; i++) {
      const char = cleaned[i]
      const code = char.charCodeAt(0)
      const isCJK = isCJKChar(code)
      const isPunct = isCJKPunct(char) || /[.,;:!?]/.test(char)

      // If we've reached minimum length and hit punctuation, stop
      if (reachedMin && isPunct) {
        break
      }

      // If we've exceeded soft max and hit a word boundary (space/punct), stop
      if (reachedSoftMax && (isPunct || char === ' ')) {
        break
      }

      // Skip punctuation (don't add to filename)
      if (isPunct) {
        lastWasSpace = true // Treat punctuation as word boundary
        continue
      }

      // Handle spaces
      if (char === ' ') {
        lastWasSpace = true
        continue
      }

      // Check if we would exceed hard maximum
      if (result.length >= HARD_MAX_LENGTH) {
        break
      }

      // Add separator if needed
      if (result.length > 0 && lastWasSpace) {
        // Only add hyphen between non-CJK words
        if (!isCJK && !lastWasCJK) {
          result += '-'
        }
        lastWasSpace = false
      }

      // Add the character (lowercase for Latin, keep CJK as-is)
      if (isCJK) {
        result += char
      } else {
        result += char.toLowerCase()
      }

      lastWasCJK = isCJK

      // Check if we've reached minimum length (count actual characters, not hyphens)
      const contentLength = result.replace(/-/g, '').length

      if (contentLength >= MIN_LENGTH) {
        reachedMin = true
      }

      // Check if we've exceeded soft max (including hyphens)
      if (result.length >= SOFT_MAX_LENGTH) {
        reachedSoftMax = true
      }
    }

    return result
  }

  const words = generateNameFromText(plainText)

  // Check if parent is truly a top-level file (no layers with ranges, or only null range)
  const isTopLevel =
    !parentLayers ||
    (parentLayers.length === 1 &&
      parentLayers[0].rangeStart === null &&
      parentLayers[0].rangeEnd === null)

  if (isTopLevel) {
    // Parent is a top-level file - extract name from filename (as fallback)
    const parentName = generateNameFromText(parentFileName) || parentFileName.substring(0, 20)

    // For HTML/semantic extractions (rangeStart/rangeEnd = 0), use words from content with 0-0 prefix
    // For text-line extractions, use range-based naming with parent name as fallback
    // For null ranges, omit the range prefix entirely
    if (rangeStart === null && rangeEnd === null) {
      return words || parentName || 'note'
    } else {
      return `${rangeStart}-${rangeEnd}_${words || parentName || 'note'}`
    }
  } else {
    // Flat structure: keep all parent layers, append new layer
    const allLayers = [...parentLayers, { rangeStart, rangeEnd, name: words || 'note' }]
    return allLayers
      .map((l) => {
        // Omit range prefix for null values
        if (l.rangeStart === null && l.rangeEnd === null) {
          return l.name
        }
        return `${l.rangeStart}-${l.rangeEnd}_${l.name}`
      })
      .join('.')
  }
}

/**
 * Find the name of the extraction note folder of parent note or child note
 * @param {string} parentFilePath - Path to parent note file
 * @param {Object} db - Database instance
 * @param {string} libraryId - Library ID
 * @param {string} rootPath - Root path of the workspace
 * @returns {string} - Top-level note folder path
 */
function findTopLevelNoteFolder(fileRelativePath, db, libraryId) {
  const result = db
    .prepare(
      `
      WITH RECURSIVE lineage(relative_path, parent_path, depth) AS (
        SELECT relative_path, parent_path, 0
        FROM note_source
        WHERE library_id = ? AND relative_path = ?

        UNION ALL

        SELECT ns.relative_path, ns.parent_path, lineage.depth + 1
        FROM note_source ns
        JOIN lineage ON ns.library_id = ? AND ns.relative_path = lineage.parent_path
        WHERE lineage.parent_path IS NOT NULL AND lineage.depth < 100
      )
      SELECT parent_path AS top_level_parent_path
      FROM lineage
      WHERE parent_path IS NOT NULL
      ORDER BY depth DESC
      LIMIT 1
    `
    )
    .get(libraryId, fileRelativePath, libraryId)

  const topLevelFilePath = result?.top_level_parent_path ?? fileRelativePath
  return path.basename(topLevelFilePath, path.extname(topLevelFilePath))
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
    const content = lines
      .slice(start, start + numberOfLines)
      .join('\n')
      .trim()
    const hash = crypto.createHash('sha256').update(content).digest('hex')

    if (hash === targetHash) {
      return { start: start + 1, end: start + numberOfLines }
    }
  }

  return null
}

/**
 * Find content in parent note by embedding
 * @param {string} parentContent - Parent note content
 * @param {Float32Array} targetEmbedding - Target embedding to search for
 * @param {number} numberOfLines - Number of lines in the window
 * @returns {Promise<Object|null>} - {start, end, similarity} or null if not found
 */
async function findContentByEmbeddingAndLineCount(parentContent, targetEmbedding, numberOfLines) {
  const lines = parentContent.split('\n')

  if (!targetEmbedding || numberOfLines <= 0 || lines.length < numberOfLines) {
    return null
  }

  let bestMatch = null

  for (let start = 0; start <= lines.length - numberOfLines; start++) {
    const content = lines
      .slice(start, start + numberOfLines)
      .join('\n')
      .trim()
    const currentEmbedding = await embedText(content)

    if (!currentEmbedding || currentEmbedding.length !== targetEmbedding.length) {
      continue
    }

    const similarity = cosineSimilarity(targetEmbedding, currentEmbedding)

    if (!bestMatch || similarity > bestMatch.similarity) {
      bestMatch = {
        start: start + 1,
        end: start + numberOfLines,
        similarity,
      }
    }
  }

  if (!bestMatch || bestMatch.similarity < DEFAULT_EMBEDDING_SIMILARITY_THRESHOLD) {
    return null
  }

  return bestMatch
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

  try {
    const directChildren = db
      .prepare(
        `SELECT relative_path, extract_type, range_start, range_end, source_hash, source_embedding, embedding_dim
             FROM note_source
             WHERE library_id = ? AND parent_path = ?`
      )
      .all(libraryId, relativePath)

    // Read parent content
    const parentContent = await fs.readFile(notePath, 'utf-8')
    for (const child of directChildren) {
      const childRelativePath = child.relative_path

      if (child.extract_type !== 'text-lines') {
        continue
      }

      // Validate current position in database
      const startLine = parseInt(child.range_start)
      const endLine = parseInt(child.range_end)
      // Remove surrounding whitespace and newlines for more robust hashing
      const currentContent = parentContent
        .split('\n')
        .slice(startLine - 1, endLine)
        .join('\n')
        .trim()

      const currentHash = crypto.createHash('sha256').update(currentContent).digest('hex')

      // If hash mismatch, try to recover
      if (currentHash !== child.source_hash) {
        const lineCount = endLine - startLine + 1
        let newRange = findContentByHashAndLineCount(parentContent, child.source_hash, lineCount)
        if (newRange) {
          // Recovery successful - update database
          db.prepare(
            `
                UPDATE note_source
                SET range_start = ?, range_end = ?
                WHERE library_id = ? AND relative_path = ?
              `
          ).run(String(newRange.start), String(newRange.end), libraryId, childRelativePath)
        } else if (child.source_embedding) {
          const targetEmbedding = deserializeEmbedding(child.source_embedding)
          newRange = await findContentByEmbeddingAndLineCount(
            parentContent,
            targetEmbedding,
            lineCount
          )
          if (newRange) {
            db.prepare(
              `
                UPDATE note_source
                SET range_start = ?, range_end = ?
                WHERE library_id = ? AND relative_path = ?
              `
            ).run(String(newRange.start), String(newRange.end), libraryId, childRelativePath)
          }
        } else {
          console.warn(`Failed to recover position for child note: ${childRelativePath}`)
        }
      }
    }
  } finally {
    db.close()
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
async function getChildRanges(parentPath, libraryId, useDynamicContent = true, getCentralDbPath) {
  try {
    const dbInfo = await getWorkspaceDbPath(libraryId, getCentralDbPath)
    if (!dbInfo.found) {
      console.error('Database not found for library:', libraryId)
      return []
    }

    const db = new Database(dbInfo.dbPath)
    const parentRelativePath = path.relative(dbInfo.folderPath, parentPath)

    // Check if parent is a text-like file (markdown or HTML)
    const parentExt = path.extname(parentPath).toLowerCase()
    const isMarkdown = parentExt === '.md'
    const isHTML = parentExt === '.html' || parentExt === '.htm'

    // Auto-validate and recover all direct children before retrieving ranges
    // This ensures that ranges are up-to-date if parent file was modified externally
    if (isMarkdown) {
      await validateAndRecoverNoteRange(parentPath, libraryId, getCentralDbPath)
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

      // Read direct children content (for markdown and HTML files)
      if (isMarkdown || isHTML) {
        for (const child of children) {
          const childAbsPath = path.join(dbInfo.folderPath, child.relative_path)
          try {
            child.content = await fs.readFile(childAbsPath, 'utf-8')
            child.fileExists = true
          } catch (err) {
            console.warn(`Failed to read child note ${child.relative_path}:`, err.message)
            child.fileExists = false
          }
        }
        const ranges = children.map((child) => {
          const start = parseInt(child.range_start)
          const end = parseInt(child.range_end)
          return {
            path: child.relative_path,
            extract_type: child.extract_type,
            start: start,
            end: end,
            content: child.fileExists ? child.content : '[Content unavailable]',
            // lineCount should be based on database range, not file content
            // This ensures consistency with stored range_start and range_end
            lineCount: child.fileExists ? end - start + 1 : 1,
            fileExists: child.fileExists,
          }
        })
        return ranges
      } else {
        const ranges = children.map((child) => {
          // Parse range_start and range_end to handle line numbers
          const parseRange = (rangeStr) => {
            if (!rangeStr) {
              return { page: null, line: null }
            }
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
            content: child.content,
            lineCount: child.content?.split('\n').length,
            fileExists: true, // HTML/PDF files don't check fileExists, assume true
          }
        })

        db.close()

        return ranges
      }
    } else {
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

      if (isMarkdown || isHTML) {
        // Read all children content (for markdown and HTML files)
        for (let i = 0; i < children.length; i++) {
          const child = children[i]
          const childAbsPath = path.join(dbInfo.folderPath, child.relative_path)
          try {
            child.content = await fs.readFile(childAbsPath, 'utf-8')
            child.fileExists = true
          } catch (err) {
            console.warn(`Failed to read child note ${child.relative_path}:`, err.message)
            child.fileExists = false
          }
        }
      }

      // Create a Map for O(1) lookup of children by relative_path
      // Include all children even if they don't exist
      const childrenMap = new Map(children.map((c) => [c.relative_path, c]))

      // Merging content from grandchild and deeper notes to direct child
      // recur_depth DESC: bottom-to-top traversal
      // range_start DESC: Ensures that replacing lines in a parent does not disrupt the line numbers for other children
      for (const child of children) {
        // Skip if file doesn't exist (for markdown/HTML)
        if ((isMarkdown || isHTML) && !child.fileExists) continue

        // direct children are skipped
        if (child.recur_depth === 1) continue

        const parent = childrenMap.get(child.parent_path)

        if (parent && parent.fileExists && parent.content) {
          // Replace lines in parent with child content
          const lines = parent.content.split('\n')
          // range_start and range_end are 1-based
          const rangeStart = parseInt(child.range_start) - 1
          const rangeEnd = parseInt(child.range_end) - 1

          // Split parent content into: before, (replaced with child), after
          const beforeLines = lines.slice(0, rangeStart)
          const childLines =
            child.fileExists && child.content
              ? child.content.split('\n')
              : ['[Content unavailable]']
          const afterLines = lines.slice(rangeEnd + 1)

          // Update parent content
          parent.content = [...beforeLines, ...childLines, ...afterLines].join('\n')
        }
      }

      // Filter to only return direct children (depth=1)
      // Include children with missing files, but mark them with unavailable content
      const directChildren = children.filter((c) => {
        return c.recur_depth === 1
      })

      // Sort by range_start ASC for final output
      directChildren.sort((a, b) => parseInt(a.range_start) - parseInt(b.range_start))

      // Map to result format
      const ranges = directChildren.map((child) => {
        // Parse range_start and range_end to handle line numbers
        // Format: "pageNum:lineNum" or just "pageNum"
        const parseRange = (rangeStr) => {
          if (!rangeStr) {
            return { page: null, line: null }
          }
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
          content: child.fileExists ? child.content : '[Content unavailable]',
          lineCount: child.fileExists ? (child.content ? child.content.split('\n').length : 0) : 1,
          fileExists: child.fileExists,
        }
      })

      db.close()

      return ranges
    }
  } catch (error) {
    console.error('Error in getChildRanges:', error)
    return []
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

async function readFile(filePath, libraryId, getCentralDbPath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8')

    // Check if file hash has changed and update database if needed
    if (libraryId && getCentralDbPath) {
      try {
        const dbInfo = await getWorkspaceDbPath(libraryId, getCentralDbPath)
        if (dbInfo.found) {
          const db = new Database(dbInfo.dbPath)

          const relativePath = path.relative(dbInfo.folderPath, filePath)
          const currentFingerprint = await computeFingerprintForText(content, true)

          // Get existing file record
          const fileRecord = db
            .prepare('SELECT content_hash FROM file WHERE library_id = ? AND relative_path = ?')
            .get(libraryId, relativePath)

          // If hash changed, update the database
          if (fileRecord && fileRecord.content_hash !== currentFingerprint.contentHash) {
            db.prepare(
              `
              UPDATE file
              SET content_hash = ?,
                  content_embedding = ?,
                  content_embedding_model = ?,
                  content_embedding_dim = ?
              WHERE library_id = ? AND relative_path = ?
            `
            ).run(
              currentFingerprint.contentHash,
              currentFingerprint.contentEmbedding,
              currentFingerprint.contentEmbeddingModel,
              currentFingerprint.contentEmbeddingDim,
              libraryId,
              relativePath
            )

            console.log(`[readFile] Updated hash for ${relativePath}`)
          }

          db.close()
        }
      } catch (dbError) {
        // Log but don't fail
        console.warn(`[readFile] Failed to update file hash:`, dbError.message)
      }
    }

    return { success: true, content }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

async function replaceChildRangeWithChildContent(
  parentPath,
  childPath,
  libraryId,
  getCentralDbPath
) {
  try {
    const dbInfo = await getWorkspaceDbPath(libraryId, getCentralDbPath)
    if (!dbInfo.found) {
      return { success: false, error: dbInfo.error || 'Database not found' }
    }

    const parentRelativePath = path.relative(dbInfo.folderPath, parentPath)
    const childRelativePath = path.isAbsolute(childPath)
      ? path.relative(dbInfo.folderPath, childPath)
      : childPath
    const childAbsolutePath = path.isAbsolute(childPath)
      ? childPath
      : path.join(dbInfo.folderPath, childRelativePath)

    const db = new Database(dbInfo.dbPath)
    try {
      const source = db
        .prepare(
          `
          SELECT range_start, range_end
          FROM note_source
          WHERE library_id = ?
            AND parent_path = ?
            AND relative_path = ?
            AND extract_type = 'text-lines'
        `
        )
        .get(libraryId, parentRelativePath, childRelativePath)

      if (!source) {
        return { success: false, error: 'Child note source range not found' }
      }

      const oldStart = parseInt(source.range_start)
      const oldEnd = parseInt(source.range_end)
      if (isNaN(oldStart) || isNaN(oldEnd)) {
        return { success: false, error: 'Invalid source range for child note' }
      }

      const [parentContent, childContent] = await Promise.all([
        fs.readFile(parentPath, 'utf-8'),
        fs.readFile(childAbsolutePath, 'utf-8'),
      ])

      const parentLines = parentContent.split('\n')
      const childLines = childContent.split('\n')
      const oldLineCount = oldEnd - oldStart + 1
      const newLineCount = childLines.length
      const delta = newLineCount - oldLineCount
      const newEnd = oldStart + newLineCount - 1

      const updatedParent = [
        ...parentLines.slice(0, oldStart - 1),
        ...childLines,
        ...parentLines.slice(oldEnd),
      ].join('\n')

      await fs.writeFile(parentPath, updatedParent, 'utf-8')

      // Compute new fingerprints for parent and child files
      const [parentFingerprint, childFingerprint] = await Promise.all([
        computeFingerprintForText(updatedParent, true),
        computeFingerprintForText(childContent, true),
      ])

      db.transaction(() => {
        // Update parent file's hash and embedding
        db.prepare(
          `
          UPDATE file
          SET content_hash = ?,
              content_embedding = ?,
              content_embedding_model = ?,
              content_embedding_dim = ?
          WHERE library_id = ? AND relative_path = ?
        `
        ).run(
          parentFingerprint.contentHash,
          parentFingerprint.contentEmbedding,
          parentFingerprint.contentEmbeddingModel,
          parentFingerprint.contentEmbeddingDim,
          libraryId,
          parentRelativePath
        )

        // Update note_source for child with new range and fingerprint
        db.prepare(
          `
          UPDATE note_source
          SET range_start = ?, 
              range_end = ?,
              source_hash = ?,
              source_embedding = ?,
              embedding_model = ?,
              embedding_dim = ?
          WHERE library_id = ?
            AND parent_path = ?
            AND relative_path = ?
            AND extract_type = 'text-lines'
        `
        ).run(
          String(oldStart),
          String(newEnd),
          childFingerprint.contentHash,
          childFingerprint.contentEmbedding,
          childFingerprint.contentEmbeddingModel,
          childFingerprint.contentEmbeddingDim,
          libraryId,
          parentRelativePath,
          childRelativePath
        )

        // If line count changed, update all ranges of sibling that come after the modified child note
        if (delta !== 0) {
          const siblings = db
            .prepare(
              `
              SELECT relative_path, range_start, range_end
              FROM note_source
              WHERE library_id = ?
                AND parent_path = ?
                AND relative_path != ?
                AND extract_type = 'text-lines'
                AND range_start GLOB '[0-9]*'
                AND range_end GLOB '[0-9]*'
                AND CAST(range_start AS INTEGER) > ?
            `
            )
            .all(libraryId, parentRelativePath, childRelativePath, oldEnd)

          const updateSibling = db.prepare(
            `
            UPDATE note_source
            SET range_start = ?, range_end = ?
            WHERE library_id = ?
              AND parent_path = ?
              AND relative_path = ?
              AND extract_type = 'text-lines'
          `
          )

          for (const sibling of siblings) {
            const siblingStart = parseInt(sibling.range_start)
            const siblingEnd = parseInt(sibling.range_end)
            updateSibling.run(
              String(siblingStart + delta),
              String(siblingEnd + delta),
              libraryId,
              parentRelativePath,
              sibling.relative_path
            )
          }
        }
      })()

      return {
        success: true,
        oldStart,
        oldEnd,
        newStart: oldStart,
        newEnd,
        delta,
      }
    } finally {
      db.close()
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

async function extractNote(
  parentFilePath,
  selectedText,
  childFileName,
  rangeStart,
  rangeEnd,
  libraryId,
  getCentralDbPath
) {
  const dbInfo = await getWorkspaceDbPath(libraryId, getCentralDbPath)
  if (!dbInfo.found) {
    return {
      success: false,
      error: dbInfo.error || 'Database not found',
    }
  }
  const db = new Database(dbInfo.dbPath)

  try {
    const parentRelativePath = path.relative(dbInfo.folderPath, parentFilePath)
    const topLevelFolder = findTopLevelNoteFolder(parentRelativePath, db, libraryId)
    const parentDir = path.dirname(parentRelativePath)

    let relativeNoteFolderPath
    if (parentDir === '.' || parentDir === '') {
      relativeNoteFolderPath = topLevelFolder
    } else {
      const lastSegment = path.basename(parentDir)
      if (lastSegment === topLevelFolder) {
        relativeNoteFolderPath = parentDir
      } else {
        relativeNoteFolderPath = path.join(parentDir, topLevelFolder)
      }
    }

    const absoluteNoteFolderPath = path.join(dbInfo.folderPath, relativeNoteFolderPath)

    const noteFolder = path.relative(dbInfo.folderPath, absoluteNoteFolderPath)
    try {
      await fs.mkdir(absoluteNoteFolderPath, { recursive: true })
    } catch (err) {
      return {
        success: false,
        error: `Failed to create note folder: ${err.message}`,
      }
    }

    // Generate or use provided filename
    const parentExt = path.extname(parentFilePath)

    let finalFileName = childFileName
    if (!finalFileName) {
      finalFileName = generateChildNoteName(parentFilePath, rangeStart, rangeEnd, selectedText)
    }

    const newFileName = finalFileName.endsWith(parentExt)
      ? finalFileName
      : finalFileName + parentExt

    const newFilePath = path.join(path.join(dbInfo.folderPath, noteFolder), newFileName)

    // Write the new note file (overwrite if exists)
    await fs.writeFile(newFilePath, selectedText, 'utf-8')

    // Insert or update file record
    const relativePath = path.relative(dbInfo.folderPath, newFilePath)
    const initialDays = getRandomInitialDays()
    const fingerprint = await computeFingerprintForText(selectedText, true)

    try {
      db.transaction(() => {
        // Check if file record already exists
        const existingFile = db
          .prepare('SELECT relative_path FROM file WHERE library_id = ? AND relative_path = ?')
          .get(libraryId, relativePath)

        if (existingFile) {
          // Update existing file record
          db.prepare(
            `
            UPDATE file
            SET content_hash = ?,
                content_embedding = ?,
                content_embedding_model = ?,
                content_embedding_dim = ?
            WHERE library_id = ? AND relative_path = ?
          `
          ).run(
            fingerprint.contentHash,
            fingerprint.contentEmbedding,
            fingerprint.contentEmbeddingModel,
            fingerprint.contentEmbeddingDim,
            libraryId,
            relativePath
          )
        } else {
          // Insert new file record
          db.prepare(
            `
            INSERT INTO file (
              library_id,
              relative_path,
              added_time,
              review_count,
              easiness,
              rank,
              due_time,
              intermediate_interval,
              content_hash,
              content_embedding,
              content_embedding_model,
              content_embedding_dim
            )
            VALUES (
              ?,
              ?,
              datetime('now'),
              0,
              0.0,
              70.0,
              datetime('now', '+' || ? || ' days'),
              7,
              ?,
              ?,
              ?,
              ?
            )
          `
          ).run(
            libraryId,
            relativePath,
            initialDays,
            fingerprint.contentHash,
            fingerprint.contentEmbedding,
            fingerprint.contentEmbeddingModel,
            fingerprint.contentEmbeddingDim
          )

          db.prepare(
            `
            INSERT INTO queue_membership (library_id, queue_name, relative_path)
            VALUES (?, 'intermediate', ?)
          `
          ).run(libraryId, relativePath)
        }

        // Has line ranges, for non-html extraction
        if (rangeStart != null && rangeEnd != null) {
          // Check if note_source record already exists
          const existingSource = db
            .prepare(
              'SELECT relative_path FROM note_source WHERE library_id = ? AND relative_path = ?'
            )
            .get(libraryId, relativePath)

          if (existingSource) {
            // Update existing note_source record
            db.prepare(
              `
              UPDATE note_source
              SET parent_path = ?,
                  range_start = ?,
                  range_end = ?,
                  source_hash = ?,
                  source_embedding = ?,
                  embedding_model = ?,
                  embedding_dim = ?
              WHERE library_id = ? AND relative_path = ?
            `
            ).run(
              parentRelativePath,
              String(rangeStart),
              String(rangeEnd),
              fingerprint.contentHash,
              fingerprint.contentEmbedding,
              fingerprint.contentEmbeddingModel,
              fingerprint.contentEmbeddingDim,
              libraryId,
              relativePath
            )
          } else {
            // Insert new note_source record
            db.prepare(
              `
              INSERT INTO note_source (
                library_id,
                relative_path,
                parent_path,
                extract_type,
                range_start,
                range_end,
                source_hash,
                source_embedding,
                embedding_model,
                embedding_dim
              )
              VALUES (?, ?, ?, 'text-lines', ?, ?, ?, ?, ?, ?)
            `
            ).run(
              libraryId,
              relativePath,
              parentRelativePath,
              String(rangeStart),
              String(rangeEnd),
              fingerprint.contentHash,
              fingerprint.contentEmbedding,
              fingerprint.contentEmbeddingModel,
              fingerprint.contentEmbeddingDim
            )
          }
        }
      })()
    } catch (err) {
      console.error('Failed to insert/update extracted note records:', err.message)
      return {
        success: false,
        error: `Failed to insert/update extracted note records: ${err.message}`,
      }
    }

    return {
      success: true,
      fileName: newFileName,
      filePath: newFilePath,
    }
  } finally {
    db.close()
  }
}

async function saveNote(filePath, content, libraryId, getCentralDbPath) {
  // Write the new note file
  await fs.writeFile(filePath, content, 'utf-8')

  const dbInfo = await getWorkspaceDbPath(libraryId, getCentralDbPath)
  if (!dbInfo.found) {
    return {
      success: false,
      error: dbInfo.error || 'Database not found',
    }
  }

  const db = new Database(dbInfo.dbPath)
  // Insert file record
  const relativePath = path.relative(dbInfo.folderPath, filePath)
  const fingerprint = await computeFingerprintForText(content, true)

  try {
    const result = db.transaction(() => {
      db.prepare(
        `
        UPDATE file
        SET content_hash = ?,
            content_embedding = ?,
            content_embedding_model = ?,
            content_embedding_dim = ?
        WHERE library_id = ? AND relative_path = ?
      `
      ).run(
        fingerprint.contentHash,
        fingerprint.contentEmbedding,
        fingerprint.contentEmbeddingModel,
        fingerprint.contentEmbeddingDim,
        libraryId,
        relativePath
      )

      return {
        success: true,
      }
    })()

    return result
  } catch (err) {
    console.error('Failed to update fingerprint:', err.message)
    return {
      success: false,
      error: `Failed to update fingerprint ${err.message}`,
    }
  } finally {
    db.close()
  }
}

async function extractHTML(
  parentFilePath,
  selectedText,
  childFileName,
  libraryId,
  getCentralDbPath
) {
  const dbInfo = await getWorkspaceDbPath(libraryId, getCentralDbPath)
  if (!dbInfo.found) {
    return {
      success: false,
      error: dbInfo.error || 'Database not found',
    }
  }
  const db = new Database(dbInfo.dbPath)

  try {
    const parentRelativePath = path.relative(dbInfo.folderPath, parentFilePath)

    const topLevelFolder = findTopLevelNoteFolder(parentRelativePath, db, libraryId)
    const parentDir = path.dirname(parentRelativePath)

    let relativeNoteFolderPath
    if (parentDir === '.' || parentDir === '') {
      relativeNoteFolderPath = topLevelFolder
    } else {
      const lastSegment = path.basename(parentDir)
      if (lastSegment === topLevelFolder) {
        relativeNoteFolderPath = parentDir
      } else {
        relativeNoteFolderPath = path.join(parentDir, topLevelFolder)
      }
    }

    const absoluteNoteFolderPath = path.join(dbInfo.folderPath, relativeNoteFolderPath)

    const noteFolder = path.relative(dbInfo.folderPath, absoluteNoteFolderPath)
    try {
      await fs.mkdir(absoluteNoteFolderPath, { recursive: true })
    } catch (err) {
      return {
        success: false,
        error: `Failed to create note folder: ${err.message}`,
      }
    }

    // Generate or use provided filename
    const parentExt = path.extname(parentFilePath)

    let finalFileName = childFileName
    if (!finalFileName) {
      // For HTML extraction, we generate a simpler name without line ranges
      finalFileName = 'extracted-' + Date.now()
    }

    const newFileName = finalFileName.endsWith(parentExt)
      ? finalFileName
      : finalFileName + parentExt

    const newFilePath = path.join(path.join(dbInfo.folderPath, noteFolder), newFileName)

    // Write the new note file (overwrite if exists)
    await fs.writeFile(newFilePath, selectedText, 'utf-8')

    // Insert or update records
    const relativePath = path.relative(dbInfo.folderPath, newFilePath)
    const initialDays = getRandomInitialDays()
    const fingerprint = await computeFingerprintForText(selectedText, false)

    try {
      db.transaction(() => {
        // Check if file record already exists
        const existingFile = db
          .prepare('SELECT relative_path FROM file WHERE library_id = ? AND relative_path = ?')
          .get(libraryId, relativePath)

        if (existingFile) {
          // Update existing file record
          db.prepare(
            `
            UPDATE file
            SET content_hash = ?
            WHERE library_id = ? AND relative_path = ?
          `
          ).run(fingerprint.contentHash, libraryId, relativePath)
        } else {
          // Insert new file record
          db.prepare(
            `
              INSERT INTO file (
                library_id,
                relative_path,
                added_time,
                review_count,
                easiness,
                rank,
                due_time,
                intermediate_interval,
                content_hash
              )
              VALUES (
                ?,
                ?,
                datetime('now'),
                0,
                0.0,
                70.0,
                datetime('now', '+' || ? || ' days'),
                7,
                ?
              )
            `
          ).run(libraryId, relativePath, initialDays, fingerprint.contentHash)

          db.prepare(
            `
              INSERT INTO queue_membership (library_id, queue_name, relative_path)
              VALUES (?, 'intermediate', ?)
            `
          ).run(libraryId, relativePath)
        }

        // Check if note_source record already exists
        const existingSource = db
          .prepare(
            'SELECT relative_path FROM note_source WHERE library_id = ? AND relative_path = ?'
          )
          .get(libraryId, relativePath)

        if (existingSource) {
          // Update existing note_source record
          db.prepare(
            `
            UPDATE note_source
            SET parent_path = ?,
                source_hash = ?
            WHERE library_id = ? AND relative_path = ?
          `
          ).run(parentRelativePath, fingerprint.contentHash, libraryId, relativePath)
        } else {
          // Insert new note_source record
          db.prepare(
            `
              INSERT INTO note_source (
                library_id,
                relative_path,
                parent_path,
                extract_type,
                source_hash
              )
              VALUES (?, ?, ?, 'html', ?)
            `
          ).run(libraryId, relativePath, parentRelativePath, fingerprint.contentHash)
        }
      })()
    } catch (err) {
      console.error('Failed to insert/update extracted note records:', err.message)
      return {
        success: false,
        error: `Failed to insert/update extracted note records: ${err.message}`,
      }
    }

    return {
      success: true,
      fileName: newFileName,
      filePath: newFilePath,
    }
  } finally {
    db.close()
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
  const dbInfo = await getWorkspaceDbPath(libraryId, getCentralDbPath)
  if (!dbInfo.found) {
    return { success: false, error: 'Database not found' }
  }

  const db = new Database(dbInfo.dbPath)
  const rootPath = dbInfo.folderPath

  try {
    // Create PDF container folder
    const containerFolder = path.join(path.dirname(pdfPath), path.basename(pdfPath, '.pdf'))

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
    const relativePath = path.relative(rootPath, metadataFilePath)
    const parentRelativePath = path.relative(rootPath, pdfPath)

    // Create metadata file (overwrite if exists)
    const metadataContent = '## Notes'
    await fs.writeFile(metadataFilePath, metadataContent, 'utf-8')

    // Insert or update records
    const initialDays = getRandomInitialDays()

    try {
      db.transaction(() => {
        // Check if file record already exists
        const existingFile = db
          .prepare('SELECT relative_path FROM file WHERE library_id = ? AND relative_path = ?')
          .get(libraryId, relativePath)

        if (existingFile) {
          // Update existing file record (PDF pages don't have content hash)
          // Just update the timestamps if needed
        } else {
          // Insert new file record
          db.prepare(
            `
                INSERT INTO file (
                  library_id,
                  relative_path,
                  added_time,
                  review_count,
                  easiness,
                  rank,
                  due_time,
                  intermediate_interval
                )
                VALUES (
                  ?,
                  ?,
                  datetime('now'),
                  0,
                  0.0,
                  70.0,
                  datetime('now', '+' || ? || ' days'),
                  7
                )
              `
          ).run(libraryId, relativePath, initialDays)

          db.prepare(
            `
                INSERT INTO queue_membership (library_id, queue_name, relative_path)
                VALUES (?, 'intermediate', ?)
              `
          ).run(libraryId, relativePath)
        }

        // Check if note_source record already exists
        const existingSource = db
          .prepare(
            'SELECT relative_path FROM note_source WHERE library_id = ? AND relative_path = ?'
          )
          .get(libraryId, relativePath)

        if (existingSource) {
          // Update existing note_source record
          db.prepare(
            `
            UPDATE note_source
            SET parent_path = ?,
                range_start = ?,
                range_end = ?
            WHERE library_id = ? AND relative_path = ?
          `
          ).run(parentRelativePath, String(startPage), String(endPage), libraryId, relativePath)
        } else {
          // Insert new note_source record
          db.prepare(
            `
                INSERT INTO note_source (
                  library_id,
                  relative_path,
                  parent_path,
                  extract_type,
                  range_start,
                  range_end
                )
                VALUES (?, ?, ?, 'pdf-page', ?, ?)
              `
          ).run(libraryId, relativePath, parentRelativePath, String(startPage), String(endPage))
        }
      })()
    } catch (err) {
      console.error('Failed to insert/update extracted note records:', err.message)
      return {
        success: false,
        error: `Failed to insert/update extracted note records: ${err.message}`,
      }
    }

    return {
      success: true,
      filePath: metadataFilePath,
      fileName: `${startPage}-${endPage}-pages.md`,
    }
  } finally {
    db.close()
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
  const dbInfo = await getWorkspaceDbPath(libraryId, getCentralDbPath)
  if (!dbInfo.found) {
    return { success: false, error: 'Database not found' }
  }

  const db = new Database(dbInfo.dbPath)
  const rootPath = dbInfo.folderPath

  try {
    // Create PDF container folder
    const containerFolder = path.join(path.dirname(pdfPath), path.basename(pdfPath, '.pdf'))

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

    const fileName = `${pageNum}-${pageNum}_${words}.md`
    const textFilePath = path.join(containerFolder, fileName)
    const relativePath = path.relative(rootPath, textFilePath)
    const parentRelativePath = path.relative(rootPath, pdfPath)

    // Write text to file (overwrite if exists)
    await fs.writeFile(textFilePath, text, 'utf-8')

    // Insert or update records
    const initialDays = getRandomInitialDays()
    const fingerprint = await computeFingerprintForText(text, true)

    // Store line numbers in range_start and range_end
    // Format: "pageNum:lineStart-lineEnd" or just "pageNum" if no line numbers
    const rangeStart =
      lineStart !== undefined && lineStart !== null ? `${pageNum}:${lineStart}` : String(pageNum)
    const rangeEnd =
      lineEnd !== undefined && lineEnd !== null ? `${pageNum}:${lineEnd}` : String(pageNum)

    try {
      db.transaction(() => {
        // Check if file record already exists
        const existingFile = db
          .prepare('SELECT relative_path FROM file WHERE library_id = ? AND relative_path = ?')
          .get(libraryId, relativePath)

        if (existingFile) {
          // Update existing file record
          db.prepare(
            `
            UPDATE file
            SET content_hash = ?
            WHERE library_id = ? AND relative_path = ?
          `
          ).run(fingerprint.contentHash, libraryId, relativePath)
        } else {
          // Insert new file record
          db.prepare(
            `
                INSERT INTO file (
                  library_id,
                  relative_path,
                  added_time,
                  review_count,
                  easiness,
                  rank,
                  due_time,
                  intermediate_interval,
                  content_hash
                )
                VALUES (
                  ?,
                  ?,
                  datetime('now'),
                  0,
                  0.0,
                  70.0,
                  datetime('now', '+' || ? || ' days'),
                  7,
                  ?
                )
              `
          ).run(libraryId, relativePath, initialDays, fingerprint.contentHash)

          db.prepare(
            `
                INSERT INTO queue_membership (library_id, queue_name, relative_path)
                VALUES (?, 'intermediate', ?)
              `
          ).run(libraryId, relativePath)
        }

        // Check if note_source record already exists
        const existingSource = db
          .prepare(
            'SELECT relative_path FROM note_source WHERE library_id = ? AND relative_path = ?'
          )
          .get(libraryId, relativePath)

        if (existingSource) {
          // Update existing note_source record
          db.prepare(
            `
            UPDATE note_source
            SET parent_path = ?,
                range_start = ?,
                range_end = ?,
                source_hash = ?
            WHERE library_id = ? AND relative_path = ?
          `
          ).run(
            parentRelativePath,
            rangeStart,
            rangeEnd,
            fingerprint.contentHash,
            libraryId,
            relativePath
          )
        } else {
          // Insert new note_source record
          db.prepare(
            `
                INSERT INTO note_source (
                  library_id,
                  relative_path,
                  parent_path,
                  extract_type,
                  range_start,
                  range_end,
                  source_hash
                )
                VALUES (?, ?, ?, 'pdf-text', ?, ?, ?)
              `
          ).run(
            libraryId,
            relativePath,
            parentRelativePath,
            rangeStart,
            rangeEnd,
            fingerprint.contentHash
          )
        }
      })()
    } catch (err) {
      console.error('Failed to insert/update extracted note records:', err.message)
      return {
        success: false,
        error: `Failed to insert/update extracted note records: ${err.message}`,
      }
    }

    return {
      success: true,
      filePath: textFilePath,
      fileName: fileName,
    }
  } finally {
    db.close()
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
      const fileName = `${startTime}-${endTime}_clip.md`
      const metadataFilePath = path.join(containerFolder, fileName)
      const relativePath = path.relative(rootPath, metadataFilePath)
      const parentRelativePath = path.relative(rootPath, videoPath)

      // Create metadata file (overwrite if exists)
      const metadataContent = '## Video Notes'
      await fs.writeFile(metadataFilePath, metadataContent, 'utf-8')

      // Insert or update records
      const initialDays = getRandomInitialDays()

      try {
        db.transaction(() => {
          // Check if file record already exists
          const existingFile = db
            .prepare('SELECT relative_path FROM file WHERE library_id = ? AND relative_path = ?')
            .get(libraryId, relativePath)

          if (existingFile) {
            // Update existing file record (video metadata doesn't have content hash)
            // Just update the timestamps if needed
          } else {
            // Insert new file record
            db.prepare(
              `
                INSERT INTO file (
                  library_id,
                  relative_path,
                  added_time,
                  review_count,
                  easiness,
                  rank,
                  due_time,
                  intermediate_interval
                )
                VALUES (
                  ?,
                  ?,
                  datetime('now'),
                  0,
                  0.0,
                  70.0,
                  datetime('now', '+' || ? || ' days'),
                  7
                )
              `
            ).run(libraryId, relativePath, initialDays)

            db.prepare(
              `
                INSERT INTO queue_membership (library_id, queue_name, relative_path)
                VALUES (?, 'intermediate', ?)
              `
            ).run(libraryId, relativePath)
          }

          // Check if note_source record already exists
          const existingSource = db
            .prepare(
              'SELECT relative_path FROM note_source WHERE library_id = ? AND relative_path = ?'
            )
            .get(libraryId, relativePath)

          if (existingSource) {
            // Update existing note_source record
            db.prepare(
              `
              UPDATE note_source
              SET parent_path = ?,
                  range_start = ?,
                  range_end = ?
              WHERE library_id = ? AND relative_path = ?
            `
            ).run(parentRelativePath, String(startTime), String(endTime), libraryId, relativePath)
          } else {
            // Insert new note_source record
            db.prepare(
              `
                INSERT INTO note_source (
                  library_id,
                  relative_path,
                  parent_path,
                  extract_type,
                  range_start,
                  range_end
                )
                VALUES (?, ?, ?, 'video-clip', ?, ?)
              `
            ).run(libraryId, relativePath, parentRelativePath, String(startTime), String(endTime))
          }
        })()
      } catch (err) {
        console.error('Failed to insert extracted note records:', err.message)
        return {
          success: false,
          error: `Failed to insert extracted note records: ${err.message}`,
        }
      }

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
        rangeStart:
          info.range_start !== null && info.range_start !== 'null'
            ? parseInt(info.range_start)
            : null,
        rangeEnd:
          info.range_end !== null && info.range_end !== 'null' ? parseInt(info.range_end) : null,
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
      const parentRelativePath = path.relative(dbInfo.folderPath, parentFilePath)

      const topLevelFolder = findTopLevelNoteFolder(parentRelativePath, db, libraryId)
      const parentDir = path.dirname(parentRelativePath)

      let relativeNoteFolderPath
      if (parentDir === '.' || parentDir === '') {
        relativeNoteFolderPath = topLevelFolder
      } else {
        const lastSegment = path.basename(parentDir)
        if (lastSegment === topLevelFolder) {
          relativeNoteFolderPath = parentDir
        } else {
          relativeNoteFolderPath = path.join(parentDir, topLevelFolder)
        }
      }

      const absoluteNoteFolderPath = path.join(dbInfo.folderPath, relativeNoteFolderPath)

      const noteFolder = path.relative(dbInfo.folderPath, absoluteNoteFolderPath)
      await fs.mkdir(absoluteNoteFolderPath, { recursive: true })

      // Generate new filename using character ranges
      const baseName = generateChildNoteName(parentFilePath, charStart, charEnd, selectedText)
      const newFileName = baseName + '.flashcard'
      const newFilePath = path.join(path.join(dbInfo.folderPath, noteFolder), newFileName)

      // Write empty flashcard file (dummy file) - overwrite if exists
      await fs.writeFile(newFilePath, '', 'utf-8')

      // Insert or update records
      const relativePath = path.relative(dbInfo.folderPath, newFilePath)
      const fingerprint = await computeFingerprintForText(selectedText, true)

      try {
        db.transaction(() => {
          // Check if file record already exists
          const existingFile = db
            .prepare('SELECT relative_path FROM file WHERE library_id = ? AND relative_path = ?')
            .get(libraryId, relativePath)

          if (existingFile) {
            // Update existing file record
            db.prepare(
              `
              UPDATE file
              SET content_hash = ?,
                  content_embedding = ?,
                  content_embedding_model = ?,
                  content_embedding_dim = ?
              WHERE library_id = ? AND relative_path = ?
            `
            ).run(
              fingerprint.contentHash,
              fingerprint.contentEmbedding,
              fingerprint.contentEmbeddingModel,
              fingerprint.contentEmbeddingDim,
              libraryId,
              relativePath
            )
          } else {
            // Insert new file record
            db.prepare(
              `
                INSERT INTO file (
                  library_id,
                  relative_path,
                  added_time,
                  review_count,
                  easiness,
                  rank,
                  interval,
                  due_time,
                  content_hash,
                  content_embedding,
                  content_embedding_model,
                  content_embedding_dim
                )
                VALUES (?, ?, datetime('now'), 0, 2.5, 70.0, 1, datetime('now', '+1 day'), ?, ?, ?, ?)
              `
            ).run(
              libraryId,
              relativePath,
              fingerprint.contentHash,
              fingerprint.contentEmbedding,
              fingerprint.contentEmbeddingModel,
              fingerprint.contentEmbeddingDim
            )

            db.prepare(
              `
              INSERT INTO queue_membership (library_id, queue_name, relative_path)
              VALUES (?, 'spaced-standard', ?)
            `
            ).run(libraryId, relativePath)
          }

          // Check if note_source record already exists
          const existingSource = db
            .prepare(
              'SELECT relative_path FROM note_source WHERE library_id = ? AND relative_path = ?'
            )
            .get(libraryId, relativePath)

          if (existingSource) {
            // Update existing note_source record
            db.prepare(
              `
              UPDATE note_source
              SET parent_path = ?,
                  range_start = ?,
                  range_end = ?,
                  source_hash = ?,
                  source_embedding = ?,
                  embedding_model = ?,
                  embedding_dim = ?
              WHERE library_id = ? AND relative_path = ?
            `
            ).run(
              parentRelativePath,
              String(charStart),
              String(charEnd),
              fingerprint.contentHash,
              fingerprint.contentEmbedding,
              fingerprint.contentEmbeddingModel,
              fingerprint.contentEmbeddingDim,
              libraryId,
              relativePath
            )
          } else {
            // Insert new note_source record
            db.prepare(
              `
                INSERT INTO note_source (
                  library_id,
                  relative_path,
                  parent_path,
                  extract_type,
                  range_start,
                  range_end,
                  source_hash,
                  source_embedding,
                  embedding_model,
                  embedding_dim
                )
                VALUES (?, ?, ?, 'flashcard', ?, ?, ?, ?, ?, ?)
              `
            ).run(
              libraryId,
              relativePath,
              parentRelativePath,
              String(charStart),
              String(charEnd),
              fingerprint.contentHash,
              fingerprint.contentEmbedding,
              fingerprint.contentEmbeddingModel,
              fingerprint.contentEmbeddingDim
            )
          }
        })()
      } catch (err) {
        console.error('Failed to insert/update extracted note records:', err.message)
        return {
          success: false,
          error: `Failed to insert/update extracted note records: ${err.message}`,
        }
      }

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
  ipcMain.handle('read-file', async (event, filePath, libraryId) =>
    readFile(filePath, libraryId, getCentralDbPath)
  )

  ipcMain.handle('save-note', async (event, filePath, content, libraryId) =>
    saveNote(filePath, content, libraryId, getCentralDbPath)
  )

  ipcMain.handle(
    'extract-note',
    async (event, parentFilePath, selectedText, childFileName, rangeStart, rangeEnd, libraryId) =>
      extractNote(
        parentFilePath,
        selectedText,
        childFileName,
        rangeStart,
        rangeEnd,
        libraryId,
        getCentralDbPath
      )
  )

  ipcMain.handle(
    'extract-html',
    async (event, parentFilePath, selectedText, childFileName, libraryId) =>
      extractHTML(parentFilePath, selectedText, childFileName, libraryId, getCentralDbPath)
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
      getChildRanges(parentPath, libraryId, useDynamicContent, getCentralDbPath)
  )

  ipcMain.handle('update-locked-ranges', async (event, parentPath, rangeUpdates, libraryId) =>
    updateLockedRanges(parentPath, rangeUpdates, libraryId, getCentralDbPath)
  )

  ipcMain.handle(
    'replace-child-range-with-child-content',
    async (event, parentPath, childPath, libraryId) =>
      replaceChildRangeWithChildContent(parentPath, childPath, libraryId, getCentralDbPath)
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
  DEFAULT_EMBEDDING_SIMILARITY_THRESHOLD,
  cosineSimilarity,
  deserializeEmbedding,
  computeFingerprintForPath,
  readFile,
  saveNote,
  extractNote,
  parseNoteFileName,
  generateChildNoteName,
  findTopLevelNoteFolder,
  findContentByHashAndLineCount,
  findContentByEmbeddingAndLineCount,
  validateAndRecoverNoteRange,
  compareFilenameWithDbRange,
  getChildRanges,
  updateLockedRanges,
  replaceChildRangeWithChildContent,
  extractPdfPages,
  extractPdfText,
  extractVideoClip,
  getNoteExtractInfo,
}
