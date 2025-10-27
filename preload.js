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
  checkFileInQueue: (filePath) => ipcRenderer.invoke('check-file-in-queue', filePath),
  addFileToQueue: (filePath) => ipcRenderer.invoke('add-file-to-queue', filePath),
  getFilesForRevision: (rootPath) => ipcRenderer.invoke('get-files-for-revision', rootPath),
  getAllFilesForRevision: () => ipcRenderer.invoke('get-all-files-for-revision'),
  updateRevisionFeedback: (dbPath, noteId, feedback) => ipcRenderer.invoke('update-revision-feedback', dbPath, noteId, feedback),
  extractNote: (filePath, selectedText) => ipcRenderer.invoke('extract-note', filePath, selectedText),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),
  recordWorkspace: (folderPath) => ipcRenderer.invoke('record-workspace', folderPath),
  getRecentWorkspaces: (limit) => ipcRenderer.invoke('get-recent-workspaces', limit),
  updateWorkspaceStats: (folderPath, totalFiles, filesDueToday) => 
    ipcRenderer.invoke('update-workspace-stats', folderPath, totalFiles, filesDueToday),
  removeWorkspace: (folderPath) => ipcRenderer.invoke('remove-workspace', folderPath)
})