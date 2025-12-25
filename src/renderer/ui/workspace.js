// SPDX-FileCopyrightText: 2025 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Sidebar UI logic extracted from renderer.js
// Handles workspace history, sidebar DOM, and related events

const workspaceHistoryList = document.getElementById('workspace-history-list')
const selectFolderBtn = document.getElementById('select-folder')

export async function loadRecentWorkspaces() {
  try {
    const workspaces = await window.fileManager.getRecentWorkspaces()
    displayWorkspaceHistory(workspaces)
  } catch (error) {
    console.error('Error loading recent workspaces:', error)
  }
}

export function displayWorkspaceHistory(workspaces) {
  workspaceHistoryList.innerHTML = ''
  if (!workspaces || workspaces.length === 0) return
  workspaces.forEach((workspace) => {
    const item = document.createElement('div')
    item.classList.add('workspace-item')
    const name = document.createElement('div')
    name.classList.add('workspace-name')
    name.textContent = workspace.folder_name
    name.title = workspace.folder_path
    const meta = document.createElement('div')
    meta.classList.add('workspace-meta')
    const lastOpened = new Date(workspace.last_opened)
    const timeAgo = getTimeAgo(lastOpened)
    meta.textContent = timeAgo
    const stats = document.createElement('div')
    stats.classList.add('workspace-stats')
    if (workspace.files_due_today > 0) {
      stats.textContent = `${workspace.files_due_today} due`
    }
    item.appendChild(name)
    item.appendChild(meta)
    if (workspace.files_due_today > 0) {
      item.appendChild(stats)
    }
    item.addEventListener('click', async () => {
      await openWorkspace(workspace.folder_path)
    })
    workspaceHistoryList.appendChild(item)
  })
}

export async function openWorkspace(folderPath) {
  try {
    window.currentRootPath = folderPath
    const dbResult = await window.fileManager.createDatabase(folderPath)
    if (dbResult.success) {
      console.log('Database ready at:', dbResult.path)
      window.currentWorkspaceLibraryId = dbResult.libraryId
      console.log('Workspace Library ID:', dbResult.libraryId)
    } else {
      console.warn('Database setup warning:', dbResult.error)
    }
    await window.fileManager.recordWorkspace(folderPath)
    console.log('Workspace recorded in central database')
    const tree = await window.fileManager.getDirectoryTree(folderPath)
    console.log('Directory tree received:', tree)
    const { renderTree } = await import('./fileTree.js')
    const treeContainer = document.getElementById('tree-container')
    renderTree(tree, treeContainer)
    await loadRecentWorkspaces()
  } catch (error) {
    console.error('Error opening workspace:', error)
    alert(`Error opening workspace: ${error.message}`)
  }
}

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000)
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w ago`
  return `${Math.floor(seconds / 2592000)}mo ago`
}

// Initialize select folder button event listener
if (selectFolderBtn) {
  selectFolderBtn.addEventListener('click', async () => {
    try {
      const folderPath = await window.fileManager.selectFolder()
      if (folderPath) {
        await openWorkspace(folderPath)
      }
    } catch (error) {
      console.error('Error selecting folder:', error)
      alert(`Error selecting folder: ${error.message}`)
    }
  })
}
