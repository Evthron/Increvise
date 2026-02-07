// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// File System IPC Handlers
import { dialog } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'

async function selectFolder() {
  try {
    // Open system dialog to select folder
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    })
    console.log('Dialog result:', result)
    return result.filePaths[0] || null
  } catch (error) {
    console.error('Error in select-folder handler:', error)
    return null
  }
}

async function getDirectoryTree(dirPath, libraryId = null) {
  /**
   * Parse hierarchical note filename
   * Tenative Format: rangeStart-rangeEnd-name.rangeStart-rangeEnd-name.{ext}
   * Returns array of layers
   * each layer has
   *    rangeStart
   *    rangeEnd
   *    layer name
   */
  const parseHierarchicalNote = (filename) => {
    const baseName = path.basename(filename, path.extname(filename))
    const layers = baseName.split('.')

    const parsed = []
    for (const layer of layers) {
      // Match pattern: [optional p/l prefix]start-end[_ or end]name
      // If there's no underscore, the range must be at the end of the string
      const match = layer.match(/^[pl]?(\d+)-(\d+)(?:_|$)(.*)/)
      if (!match) {
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
   * Build note hierarchy from a folder containing extracted notes
   * Returns { success, data } or { success, error }
   * On success: data is array of note nodes
   * On failure: returns error info for graceful degradation
   */
  const buildNoteHierarchy = async (folderPath) => {
    let items
    try {
      items = await fs.readdir(folderPath, { withFileTypes: true })
    } catch (error) {
      return {
        success: false,
        error: error.message,
      }
    }

    // Detect parent file extension from the folder name (which matches parent basename)
    // The folder contains extracted notes with same extension as parent
    const parentExt = items.find((item) => item.isFile())
      ? path.extname(items.find((item) => item.isFile()).name)
      : '.md' // Default to .md if no files found

    // Get all files with hierarchical naming structure (regardless of extension)
    const noteFiles = items
      .filter((item) => item.isFile())
      .map((item) => {
        const layers = parseHierarchicalNote(item.name)
        return {
          name: item.name,
          layers: layers,
          depth: layers ? layers.length : 0,
          path: path.join(folderPath, item.name),
        }
      })
      .filter((item) => item.layers !== null)

    if (noteFiles.length === 0) {
      return { success: true, data: [] }
    }

    // Sort by depth first, then by range
    // Ensure parent nodes get added to the tree earlier than their children
    noteFiles.sort((a, b) => {
      // Sort by depth first (parent before children)
      if (a.depth !== b.depth) return a.depth - b.depth

      // For same depth, use the LAST layer (current node's range position)
      const aLastLayer = a.layers[a.layers.length - 1]
      const bLastLayer = b.layers[b.layers.length - 1]

      const aStart = aLastLayer.rangeStart
      const bStart = bLastLayer.rangeStart
      const aEnd = aLastLayer.rangeEnd
      const bEnd = bLastLayer.rangeEnd

      // Handle null values: non-null comes before null
      // Note: both rangeStart and rangeEnd are either both null or both non-null
      if (aStart !== null && bStart !== null) {
        if (aStart === null) return 1 // a after b (b has valid range)
        if (bStart === null) return -1 // a before b (a has valid range)

        // Both have valid ranges, compare numerically
        // Compare rangeStart first, then rangeEnd (smaller values first)
        if (aStart !== bStart) {
          return aStart - bStart
        }
        return aEnd - bEnd
      }
    })

    // Build tree structure - use filename as key for O(1) parent lookup
    const nodesByName = new Map()
    const roots = []

    for (const note of noteFiles) {
      const lastLayer = note.layers[note.layers.length - 1]

      // Build display name: omit range prefix if null
      let displayName
      if (lastLayer.rangeStart === null && lastLayer.rangeEnd === null) {
        displayName = lastLayer.name
      } else {
        displayName = `${lastLayer.rangeStart}-${lastLayer.rangeEnd}_${lastLayer.name}`
      }

      const noteNode = {
        name: displayName,
        path: note.path,
        layers: note.layers,
        children: [],
        type: 'note-child',
        library_id: libraryId,
      }

      // Store node by filename
      nodesByName.set(note.name, noteNode)

      if (note.depth === 1) {
        roots.push(noteNode)
      } else {
        // Find parent by removing last layer from filename
        // Example: 1-10-intro.3-5-key.html -> 1-10-intro.html
        const nameParts = path.basename(note.name, path.extname(note.name)).split('.')
        const parentName = nameParts.slice(0, -1).join('.') + parentExt
        const parent = nodesByName.get(parentName)

        // If parent exists, update the type of the parent node
        if (parent) {
          parent.children.push(noteNode)
          parent.type = 'note-parent'
        } else {
          // Note has >1 depth but can't find parent, add it as root anyway
          roots.push(noteNode)
        }
      }
    }

    return { success: true, data: roots }
  }

  // Read directory items (only I/O operation that can fail)
  let items
  try {
    items = await fs.readdir(dirPath, { withFileTypes: true })
  } catch (error) {
    console.error(`Error reading directory tree ${dirPath}:`, error)
    return {
      success: false,
      error: error.message,
    }
  }

  // All business logic below (no try-catch needed)
  const tree = []
  const fileMap = new Map()

  // Build file map: basename -> file item
  items
    .filter((item) => item.isFile())
    .forEach((item) => {
      const baseName = path.basename(item.name, path.extname(item.name))
      fileMap.set(baseName, item)
    })

  // Process directories and files
  for (const item of items) {
    const fullPath = path.join(dirPath, item.name)

    if (item.isDirectory()) {
      // Skip the database folder
      if (item.name === '.increvise') continue

      // Check if this is a hierarchy folder (folder name matching existing file basename)
      if (fileMap.has(item.name)) {
        const fileItem = fileMap.get(item.name)
        const filePath = path.join(dirPath, fileItem.name)

        // Try to build note hierarchy
        const result = await buildNoteHierarchy(fullPath)

        if (result.success) {
          // Success: add as hierarchy parent with children
          const isPdf = fileItem.name.endsWith('.pdf')

          tree.push({
            name: fileItem.name,
            type: isPdf ? 'pdf-parent' : 'note-parent',
            path: filePath,
            children: result.data,
            library_id: libraryId,
          })
          fileMap.delete(item.name)
        } else {
          // Failure: degrade to regular file
          console.error(`Failed to build hierarchy for ${fullPath}:`, result.error)

          // Add parent file as regular file (degraded)
          tree.push({
            name: fileItem.name,
            type: 'file',
            path: filePath,
            library_id: libraryId,
          })
          fileMap.delete(item.name)
        }
      }
      // Regular directory
      else {
        tree.push({
          name: item.name,
          type: 'directory',
          path: fullPath,
          children: null,
          library_id: libraryId,
        })
      }
    }
  }

  // Add remaining files (not paired with folders)
  for (const [, item] of fileMap) {
    const fullPath = path.join(dirPath, item.name)

    // Detect flashcard files
    const isFlashcard = item.name.endsWith('.flashcard')

    tree.push({
      name: item.name,
      type: isFlashcard ? 'flashcard' : 'file',
      path: fullPath,
      library_id: libraryId,
    })
  }

  return {
    success: true,
    data: tree,
  }
}

async function readPdfFile(filePath) {
  try {
    const buffer = await fs.readFile(filePath)
    // Convert buffer to array for IPC transfer
    return { success: true, data: Array.from(buffer) }
  } catch (error) {
    console.error('Error reading PDF file:', error)
    return { success: false, error: error.message }
  }
}

export function registerFileIpc(ipcMain) {
  ipcMain.handle('select-folder', async () => selectFolder())

  ipcMain.handle('get-directory-tree', async (_event, dirPath, libraryId) =>
    getDirectoryTree(dirPath, libraryId)
  )

  ipcMain.handle('read-pdf-file', async (_event, filePath) => readPdfFile(filePath))
}

export { selectFolder, getDirectoryTree, readPdfFile }
