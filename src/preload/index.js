// SPDX-FileCopyrightText: 2025 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('versions', {
  node: () => process.versions.node,
  chrome: () => process.versions.chrome,
  electron: () => process.versions.electron,
  ping: () => ipcRenderer.invoke('ping'),
  // we can also expose variables, not just functions
})

contextBridge.exposeInMainWorld('fileManager', {
  // 1. File System
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  getDirectoryTree: (path) => ipcRenderer.invoke('get-directory-tree', path),

  // 2. Spaced Repetition
  createDatabase: (dbPath) => ipcRenderer.invoke('create-database', dbPath),
  checkFileInQueue: (filePath, libraryId) =>
    ipcRenderer.invoke('check-file-in-queue', filePath, libraryId),
  addFileToQueue: (filePath, libraryId) =>
    ipcRenderer.invoke('add-file-to-queue', filePath, libraryId),
  getFilesForRevision: (rootPath) => ipcRenderer.invoke('get-files-for-revision', rootPath),
  getAllFilesForRevision: () => ipcRenderer.invoke('get-all-files-for-revision'),
  updateRevisionFeedback: (dbPath, libraryId, relativePath, feedback) =>
    ipcRenderer.invoke('update-revision-feedback', dbPath, libraryId, relativePath, feedback),

  // 3. Incremental Reading
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),
  extractNote: (filePath, selectedText, rangeStart, rangeEnd) =>
    ipcRenderer.invoke('extract-note', filePath, selectedText, rangeStart, rangeEnd),
  validateAndRecoverNoteRange: (notePath, libraryId) =>
    ipcRenderer.invoke('validate-note', notePath, libraryId),
  compareFilenameWithDbRange: (notePath, libraryId) =>
    ipcRenderer.invoke('compare-filename-with-db-range', notePath, libraryId),
  getChildNotesLineRanges: (parentPath, libraryId) =>
    ipcRenderer.invoke('get-child-notes-line-ranges', parentPath, libraryId),

  // 4. Workspace
  recordWorkspace: (folderPath) => ipcRenderer.invoke('record-workspace', folderPath),
  getRecentWorkspaces: (limit) => ipcRenderer.invoke('get-recent-workspaces', limit),
  updateWorkspaceStats: (folderPath, totalFiles, filesDueToday) =>
    ipcRenderer.invoke('update-workspace-stats', folderPath, totalFiles, filesDueToday),
  removeWorkspace: (folderPath) => ipcRenderer.invoke('remove-workspace', folderPath),
})
