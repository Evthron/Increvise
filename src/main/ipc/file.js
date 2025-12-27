// SPDX-FileCopyrightText: 2025 The Increvise Project Contributors
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

async function getDirectoryTree(dirPath) {
  /**
   * Parse hierarchical note filename
   * Tenative Format: rangeStart-rangeEnd-name.rangeStart-rangeEnd-name.{ext}
   * Returns array of layers
   * each layer has
   *    rangeStart
        rangeEnd
        layer name
   */
  const parseHierarchicalNote = (filename) => {
    const baseName = path.basename(filename, path.extname(filename))
    const layers = baseName.split('.')

    const parsed = []
    for (const layer of layers) {
      // Get all the parts that fits the format
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

  // Turn a hirarchical folder into node tree
  // each node has
  //   name
  //   path
  //   layers
  //   children
  //   type
  // }
  const buildNoteHierarchy = async (folderPath) => {
    try {
      const items = await fs.readdir(folderPath, { withFileTypes: true })
      // Get all markdown files with file name following hirarchical structure
      const mdFiles = items
        .filter((item) => item.isFile() && item.name.endsWith('.md'))
        .map((item) => {
          const layers = parseHierarchicalNote(item.name)
          return {
            name: item.name,
            layers: layers, // range
            depth: layers ? layers.length : 0,
            path: path.join(folderPath, item.name),
          }
        })
        .filter((item) => item.layers !== null)

      if (mdFiles.length === 0) return []

      // Sort by depth first, then by range
      // Ensure parent nodes get added to the tree eariler than their child
      mdFiles.sort((a, b) => {
        if (a.depth !== b.depth) return a.depth - b.depth
        const aRange = a.layers[0].rangeStart
        const bRange = b.layers[0].rangeStart
        return aRange - bRange
      })

      // Build tree structure - use filename as key for O(1) parent lookup
      const nodesByName = new Map()
      const roots = []

      for (const note of mdFiles) {
        const noteNode = {
          name: [
            note.layers[note.layers.length - 1].rangeStart,
            note.layers[note.layers.length - 1].rangeEnd,
            note.layers[note.layers.length - 1].name,
          ].join('-'),
          path: note.path,
          layers: note.layers,
          children: [],
          type: 'note-child',
        }

        // Store node by filename
        nodesByName.set(note.name, noteNode)

        if (note.depth === 1) {
          roots.push(noteNode)
        } else {
          // Find parent by removing last layer from filename
          // Example: 1-10-intro.3-5-key.md -> 1-10-intro.md
          const nameParts = path.basename(note.name, path.extname(note.name)).split('.')
          const parentName = nameParts.slice(0, -1).join('.') + '.md'
          const parent = nodesByName.get(parentName)

          // If parent exists, pdate the type of the parent node
          if (parent) {
            parent.children.push(noteNode)
            parent.type = 'note-parent'
          } else {
            // Note has >1 depth but can't find parent, add it as root anyway
            roots.push(noteNode)
          }
        }
      }

      return roots
    } catch (error) {
      console.error('Error building note hierarchy:', error)
      return []
    }
  }
  // Node properties
  // name
  // type
  // path
  // children
  const buildTree = async (dir) => {
    const items = await fs.readdir(dir, { withFileTypes: true })
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
      const fullPath = path.join(dir, item.name)

      if (item.isDirectory()) {
        // Skip for the database folder
        if (item.name === '.increvise') continue

        // Check if this is a hierarchy folder (folder name matching existing file basename)
        if (fileMap.has(item.name)) {
          const fileItem = fileMap.get(item.name)
          const filePath = path.join(dir, fileItem.name)
          // Convert the notes inside the folder to note hierarchy
          const hierarchy = await buildNoteHierarchy(fullPath, item.name)

          // Detect if parent is PDF or text file
          const isPdf = fileItem.name.endsWith('.pdf')

          if (isPdf) {
            tree.push({
              name: fileItem.name,
              type: 'pdf-parent',
              path: filePath,
              children: hierarchy,
            })
          } else {
            tree.push({
              name: fileItem.name,
              type: 'note-parent',
              path: filePath,
              children: hierarchy,
            })
          }
          fileMap.delete(item.name)
        }
        // Regular directory
        else {
          tree.push({
            name: item.name,
            type: 'directory',
            path: fullPath,
            children: null,
          })
        }
      }
    }

    // Add remaining files (not paired with folders)
    for (const [baseName, item] of fileMap) {
      const fullPath = path.join(dir, item.name)
      tree.push({
        name: item.name,
        type: 'file',
        path: fullPath,
      })
    }

    return tree
  }
  return await buildTree(dirPath)
}

export function registerFileIpc(ipcMain) {
  ipcMain.handle('select-folder', async (event) => selectFolder())

  ipcMain.handle('get-directory-tree', async (event, dirPath) => getDirectoryTree(dirPath))
}

export { selectFolder, getDirectoryTree }
