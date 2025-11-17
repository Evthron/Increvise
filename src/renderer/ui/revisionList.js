// SPDX-FileCopyrightText: 2025 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Revision list and review controls logic extracted from renderer.js
// Handles revision file listing, review navigation, and feedback

const reviseFilesBtn = document.getElementById('revise-files')
const revisionList = document.getElementById('revision-list')
const revisionControls = document.getElementById('revision-controls')
const currentFileName = document.getElementById('current-file-name')

let revisionFiles = []
let currentRevisionIndex = 0

function showToast(message, isError = false) {
  const toast = document.getElementById('toast')
  toast.textContent = message
  toast.classList.toggle('error', isError)
  toast.classList.add('show')
  setTimeout(() => {
    toast.classList.remove('show')
  }, 3000)
}

export function displayRevisionList(files) {
  revisionList.innerHTML = ''
  const header = document.createElement('div')
  header.classList.add('revision-list-header')
  header.innerHTML = `
    <div class="revision-count">${files.length} file${files.length !== 1 ? 's' : ''}</div>
    <div class="revision-subtitle">Due for review</div>
  `
  revisionList.appendChild(header)
  if (files.length === 0) {
    const emptyState = document.createElement('div')
    emptyState.classList.add('empty-state')
    emptyState.innerHTML = `
      <div class="empty-icon">🎉</div>
      <div class="empty-text">All caught up!</div>
      <div class="empty-subtext">No files due for revision</div>
    `
    revisionList.appendChild(emptyState)
    return
  }
  const groupedFiles = {}
  files.forEach((file) => {
    const workspace = file.workspacePath || 'Unknown'
    if (!groupedFiles[workspace]) groupedFiles[workspace] = []
    groupedFiles[workspace].push(file)
  })
  const listContainer = document.createElement('div')
  listContainer.classList.add('revision-list-container')
  Object.entries(groupedFiles).forEach(([workspace, workspaceFiles]) => {
    const workspaceGroup = document.createElement('div')
    workspaceGroup.classList.add('workspace-group')
    const workspaceHeader = document.createElement('div')
    workspaceHeader.classList.add('workspace-group-header')
    const workspaceName = workspace.split('/').pop()
    workspaceHeader.innerHTML = `
      <span class="workspace-icon">📁</span>
      <span class="workspace-group-name">${workspaceName}</span>
      <span class="workspace-file-count">${workspaceFiles.length}</span>
    `
    workspaceGroup.appendChild(workspaceHeader)
    workspaceFiles.forEach((file, fileIndex) => {
      const globalIndex = files.indexOf(file)
      const item = document.createElement('div')
      item.classList.add('revision-item')
      if (globalIndex === currentRevisionIndex) item.classList.add('active')
      const fileName = file.file_path.split('/').pop()
      const filePath = file.file_path
      const difficultyColor =
        file.difficulty > 0.6 ? '#ff3b30' : file.difficulty > 0.3 ? '#ff9500' : '#34c759'
      const difficultyLabel =
        file.difficulty > 0.6 ? 'Hard' : file.difficulty > 0.3 ? 'Medium' : 'Easy'
      item.innerHTML = `
        <div class="revision-item-main">
          <div class="revision-item-icon">📄</div>
          <div class="revision-item-content">
            <div class="revision-item-name" title="${filePath}">${fileName}</div>
            <div class="revision-item-meta">
              <span class="revision-meta-item">
                <span class="meta-icon">🔄</span>
                <span>${file.review_count} review${file.review_count !== 1 ? 's' : ''}</span>
              </span>
              <span class="revision-meta-item">
                <span class="meta-dot" style="background-color: ${difficultyColor}"></span>
                <span>${difficultyLabel}</span>
              </span>
            </div>
          </div>
        </div>
      `
      item.addEventListener('click', async () => {
        document.querySelectorAll('.revision-item').forEach((el) => el.classList.remove('active'))
        item.classList.add('active')
        currentRevisionIndex = globalIndex
        showRevisionFile(globalIndex)
        const { openFile } = await import('./editor.js')
        await openFile(file.file_path)
      })
      workspaceGroup.appendChild(item)
    })
    listContainer.appendChild(workspaceGroup)
  })
  revisionList.appendChild(listContainer)
}

export function showRevisionFile(index) {
  if (index >= revisionFiles.length) return
  const file = revisionFiles[index]
  const fileName = file.file_path.split('/').pop()
  const workspaceName = file.workspacePath ? file.workspacePath.split('/').pop() : 'Unknown'
  currentFileName.innerHTML = `
    <div class="current-file-header">
      <div class="current-file-title">${fileName}</div>
      <div class="current-file-meta">
        <span class="file-meta-item">
          <span class="meta-icon">📁</span>
          <span>${workspaceName}</span>
        </span>
        <span class="file-meta-separator">•</span>
        <span class="file-meta-item">
          <span class="meta-icon">📊</span>
          <span>${index + 1} of ${revisionFiles.length}</span>
        </span>
      </div>
    </div>
  `
  revisionControls.style.display = 'block'
}

reviseFilesBtn.addEventListener('click', async () => {
  try {
    const result = await window.fileManager.getAllFilesForRevision()
    if (result.success && result.files.length > 0) {
      revisionFiles = result.files
      currentRevisionIndex = 0
      displayRevisionList(result.files)
      showRevisionFile(0)
      const { openFile } = await import('./editor.js')
      await openFile(result.files[0].file_path)
      // Update workspace stats
      const workspaceCounts = {}
      for (const file of result.files) {
        workspaceCounts[file.workspacePath] = (workspaceCounts[file.workspacePath] || 0) + 1
      }
      for (const [workspacePath, count] of Object.entries(workspaceCounts)) {
        await window.fileManager.updateWorkspaceStats(workspacePath, count, count)
      }
    } else if (result.success && result.files.length === 0) {
      showToast('No files due for revision today! 🎉')
      revisionList.innerHTML = '<p>No files due for revision today! 🎉</p>'
    } else {
      showToast(`Error: ${result.error}`, true)
    }
  } catch (error) {
    console.error('Error getting revision files:', error)
  }
})

document.addEventListener('click', async (e) => {
  if (e.target.classList.contains('feedback-btn')) {
    const feedback = e.target.dataset.feedback
    const currentFile = revisionFiles[currentRevisionIndex]
    if (!currentFile) return
    try {
      const result = await window.fileManager.updateRevisionFeedback(
        currentFile.dbPath,
        currentFile.note_id,
        feedback
      )
      if (result.success) {
        revisionFiles.splice(currentRevisionIndex, 1)
        displayRevisionList(revisionFiles)
        // Update workspace stats
        const workspaceCounts = {}
        for (const file of revisionFiles) {
          workspaceCounts[file.workspacePath] = (workspaceCounts[file.workspacePath] || 0) + 1
        }
        for (const [workspacePath, count] of Object.entries(workspaceCounts)) {
          await window.fileManager.updateWorkspaceStats(workspacePath, count, count)
        }
        if (revisionFiles.length > 0) {
          if (currentRevisionIndex >= revisionFiles.length) {
            currentRevisionIndex = revisionFiles.length - 1
          }
          showRevisionFile(currentRevisionIndex)
          const { openFile } = await import('./editor.js')
          await openFile(revisionFiles[currentRevisionIndex].file_path)
        } else {
          showToast('All files reviewed! Great job! 🎉')
          revisionControls.style.display = 'none'
          revisionList.innerHTML = '<p>All files reviewed! 🎉</p>'
          const { hideToolbar } = await import('./toolbar.js')
          hideToolbar()
          const filePreview = document.getElementById('file-preview')
          filePreview.textContent = ''
        }
      } else {
        showToast(`Error: ${result.error}`, true)
      }
    } catch (error) {
      console.error('Error updating feedback:', error)
    }
  }
})
