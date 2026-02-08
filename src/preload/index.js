// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
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
  getDirectoryTree: (path, libraryId) => ipcRenderer.invoke('get-directory-tree', path, libraryId),
  readPdfFile: (filePath) => ipcRenderer.invoke('read-pdf-file', filePath),

  // 2. Spaced Repetition
  createDatabase: (dbPath) => ipcRenderer.invoke('create-database', dbPath),
  checkFileInQueue: (filePath, libraryId) =>
    ipcRenderer.invoke('check-file-in-queue', filePath, libraryId),
  addFileToQueue: (filePath, libraryId) =>
    ipcRenderer.invoke('add-file-to-queue', filePath, libraryId),
  getFilesForRevision: (rootPath) => ipcRenderer.invoke('get-files-for-revision', rootPath),
  getFilesIncludingFuture: (rootPath) => ipcRenderer.invoke('get-files-including-future', rootPath),
  getAllFilesForRevision: () => ipcRenderer.invoke('get-all-files-for-revision'),
  getAllFilesIncludingFuture: () => ipcRenderer.invoke('get-all-files-including-future'),
  updateRevisionFeedback: (dbPath, libraryId, relativePath, feedback) =>
    ipcRenderer.invoke('update-revision-feedback', dbPath, libraryId, relativePath, feedback),
  forgetFile: (filePath, libraryId) => ipcRenderer.invoke('forget-file', filePath, libraryId),
  updateFileRank: (filePath, libraryId, newRank) =>
    ipcRenderer.invoke('update-file-rank', filePath, libraryId, newRank),
  updateIntermediateInterval: (filePath, libraryId, newInterval) =>
    ipcRenderer.invoke('update-intermediate-interval', filePath, libraryId, newInterval),
  updateRotationInterval: (filePath, libraryId, newInterval) =>
    ipcRenderer.invoke('update-rotation-interval', filePath, libraryId, newInterval),
  getFileQueue: (filePath, libraryId) => ipcRenderer.invoke('get-file-queue', filePath, libraryId),
  moveFileToQueue: (filePath, libraryId, targetQueue) =>
    ipcRenderer.invoke('move-file-to-queue', filePath, libraryId, targetQueue),

  // 3. Incremental Reading
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),
  extractNote: (filePath, selectedText, childFileName, rangeStart, rangeEnd, libraryId) =>
    ipcRenderer.invoke(
      'extract-note',
      filePath,
      selectedText,
      childFileName,
      rangeStart,
      rangeEnd,
      libraryId
    ),
  validateAndRecoverNoteRange: (notePath, libraryId) =>
    ipcRenderer.invoke('validate-note', notePath, libraryId),
  compareFilenameWithDbRange: (notePath, libraryId) =>
    ipcRenderer.invoke('compare-filename-with-db-range', notePath, libraryId),
  getChildRanges: (parentPath, libraryId) =>
    ipcRenderer.invoke('get-child-ranges', parentPath, libraryId),
  updateLockedRanges: (parentPath, rangeUpdates, libraryId) =>
    ipcRenderer.invoke('update-locked-ranges', parentPath, rangeUpdates, libraryId),
  getNoteExtractInfo: (notePath, libraryId) =>
    ipcRenderer.invoke('get-note-extract-info', notePath, libraryId),

  // 3b. PDF Extraction
  extractPdfPages: (pdfPath, startPage, endPage, libraryId) =>
    ipcRenderer.invoke('extract-pdf-pages', pdfPath, startPage, endPage, libraryId),
  extractPdfText: (pdfPath, text, pageNum, lineStart, lineEnd, libraryId) =>
    ipcRenderer.invoke('extract-pdf-text', pdfPath, text, pageNum, lineStart, lineEnd, libraryId),
  extractPdfAnnotation: (pdfPath, annotation, libraryId) =>
    ipcRenderer.invoke('extract-pdf-annotation', pdfPath, annotation, libraryId),

  // 3c. Video Extraction
  extractVideoClip: (videoPath, startTime, endTime, libraryId) =>
    ipcRenderer.invoke('extract-video-clip', videoPath, startTime, endTime, libraryId),

  // 3d. Flashcard Extraction
  extractFlashcard: (filePath, selectedText, charStart, charEnd, libraryId) =>
    ipcRenderer.invoke('extract-flashcard', filePath, selectedText, charStart, charEnd, libraryId),

  // 4. Workspace
  recordWorkspace: (folderPath) => ipcRenderer.invoke('record-workspace', folderPath),
  getRecentWorkspaces: (limit) => ipcRenderer.invoke('get-recent-workspaces', limit),
  updateWorkspaceStats: (folderPath, totalFiles, filesDueToday) =>
    ipcRenderer.invoke('update-workspace-stats', folderPath, totalFiles, filesDueToday),
  removeWorkspace: (folderPath) => ipcRenderer.invoke('remove-workspace', folderPath),
})
