// SPDX-FileCopyrightText: 2025 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// File System IPC Handlers
import { dialog } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'

async function selectFolder() {
  console.log('select-folder IPC handler invoked')
  try {
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
   * Format: rangeStart-rangeEnd-name.rangeStart-rangeEnd-name.md
   * Returns array of layers with depth info
   */
  const parseHierarchicalNote = (filename) => {
    const baseName = filename.replace(/\.md$/, '')
    const layers = baseName.split('.')

    const parsed = []
    for (const layer of layers) {
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

  const buildNoteHierarchy = async (folderPath, baseName) => {
    try {
      const items = await fs.readdir(folderPath, { withFileTypes: true })
      const mdFiles = items
        .filter((item) => item.isFile() && item.name.endsWith('.md'))
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

      if (mdFiles.length === 0) return []

      // Sort by depth first, then by range
      mdFiles.sort((a, b) => {
        if (a.depth !== b.depth) return a.depth - b.depth
        const aRange = a.layers[0].rangeStart
        const bRange = b.layers[0].rangeStart
        return aRange - bRange
      })

      // Build tree structure using optimized O(n) algorithm
      // Use a Map with layer signature as key for O(1) parent lookup
      const layerSignature = (layers) => {
        return layers.map((l) => `${l.rangeStart}-${l.rangeEnd}-${l.name}`).join('.')
      }

      const nodesBySignature = new Map()
      const roots = []

      for (const note of mdFiles) {
        const noteNode = {
          name: note.name,
          path: note.path,
          layers: note.layers,
          children: [],
          type: 'note-child',
        }

        // Store by signature for fast lookup
        const signature = layerSignature(note.layers)
        nodesBySignature.set(signature, noteNode)

        if (note.depth === 1) {
          roots.push(noteNode)
        } else {
          // Build parent signature (all layers except last one)
          const parentSignature = layerSignature(note.layers.slice(0, -1))
          const parent = nodesBySignature.get(parentSignature)

          if (parent) {
            parent.children.push(noteNode)
            parent.type = 'note-parent'
          } else {
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
  const buildTree = async (dir) => {
    const items = await fs.readdir(dir, { withFileTypes: true })
    const tree = []
    const fileMap = new Map()
    items
      .filter((item) => item.isFile())
      .forEach((item) => {
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
            children: hierarchy,
          })
          fileMap.delete(item.name)
        } else {
          tree.push({
            name: item.name,
            type: 'directory',
            path: fullPath,
            children: null,
          })
        }
      }
    }
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

async function fetchChildren(dirPath) {
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
          children: null,
        })
      } else {
        children.push({
          name: item.name,
          type: 'file',
          path: fullPath,
        })
      }
    }
    return children
  } catch (error) {
    console.error('Error fetching children:', error)
    return []
  }
}

export function registerFileIpc(ipcMain) {
  ipcMain.handle('select-folder', async (event) => selectFolder())

  ipcMain.handle('get-directory-tree', async (event, dirPath) => getDirectoryTree(dirPath))

  ipcMain.handle('fetch-children', async (event, dirPath) => fetchChildren(dirPath))
}

export { selectFolder, getDirectoryTree, fetchChildren }
