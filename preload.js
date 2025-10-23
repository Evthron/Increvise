const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('versions', {
  node: () => process.versions.node,
  chrome: () => process.versions.chrome,
  electron: () => process.versions.electron,
  ping: () => ipcRenderer.invoke('ping')
  // we can also expose variables, not just functions
})

contextBridge.exposeInMainWorld('fileManager', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  getDirectoryTree: (path) => ipcRenderer.invoke('get-directory-tree', path),
  createDatabase: (dbPath) => ipcRenderer.invoke('create-database', dbPath),
  addFileToQueue: (filePath, folderPath) => ipcRenderer.invoke('add-file-to-queue', filePath, folderPath),
  getFilesForRevision: (rootPath) => ipcRenderer.invoke('get-files-for-revision', rootPath),
  updateRevisionFeedback: (dbPath, noteId, feedback) => ipcRenderer.invoke('update-revision-feedback', dbPath, noteId, feedback)
})