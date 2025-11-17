// SPDX-FileCopyrightText: 2025 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// File System IPC Handlers
import { dialog } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'

export function registerFileIpc(ipcMain) {
  ipcMain.handle('select-folder', async () => {
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
      notes.forEach((note) => {
        const hasChildren = notes.some(
          (n) =>
            n.number.length === note.number.length + 1 &&
            n.number.slice(0, -1).join('.') === note.numberKey
        )
        map.set(note.numberKey, {
          ...note,
          children: [],
          type: hasChildren ? 'note-parent' : 'note-child',
        })
      })
      notes.forEach((note) => {
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
          .filter((item) => item.isFile() && item.name.endsWith('.md'))
          .map((item) => ({
            name: item.name,
            number: parseNoteNumber(item.name),
            path: path.join(folderPath, item.name),
          }))
          .filter((item) => item.number !== null)
        if (mdFiles.length === 0) return []
        mdFiles.sort((a, b) => {
          for (let i = 0; i < Math.max(a.number.length, b.number.length); i++) {
            const aNum = a.number[i] || 0
            const bNum = b.number[i] || 0
            if (aNum !== bNum) return aNum - bNum
          }
          return 0
        })
        const notesWithKeys = mdFiles.map((note) => ({
          ...note,
          numberKey: note.number.join('.'),
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
  })
}
