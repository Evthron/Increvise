const { app, BrowserWindow, ipcMain } = require('electron/main')
const { dialog } = require('electron')
const path = require('node:path')
const fs = require('node:fs').promises

const createWindow = () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  })

  win.loadFile('index.html')
}

app.whenReady().then(() => {
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
    const buildTree = async (dir) => {
      const items = await fs.readdir(dir, { withFileTypes: true })
      const tree = []
      for (const item of items) {
        const fullPath = path.join(dir, item.name)
        if (item.isDirectory()) {
          tree.push({
            name: item.name,
            type: 'directory',
            path: fullPath,
            children: null // Lazy-load children
          })
        } else {
          tree.push({
            name: item.name,
            type: 'file',
            path: fullPath
          })
        }
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