// SPDX-FileCopyrightText: 2025 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { RevisionList } from './revisionList.js'

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
  // Clear existing list
  workspaceHistoryList.innerHTML = ''

  // "All Workspaces" option - always shown at the top
  const allWorkspacesItem = document.createElement('div')
  allWorkspacesItem.classList.add('workspace-item', 'all-workspaces-item') // optional extra class for styling
  allWorkspacesItem.textContent = 'All Workspaces'
  allWorkspacesItem.title = 'Revise files from all recent workspaces in one combined queue'
  allWorkspacesItem.addEventListener('click', async () => {
    await openWorkspace('ALL') // Special value to indicate combined mode
  })
  workspaceHistoryList.appendChild(allWorkspacesItem)

  // Separator (optional, for visual distinction)
  const separator = document.createElement('div')
  separator.classList.add('workspace-separator') // you can style this in CSS, e.g. a thin line
  workspaceHistoryList.appendChild(separator)

  // if no workspaces then do nothing
  if (!workspaces || workspaces.length === 0) return

  // List each workspace, for each workspace:
  workspaces.forEach((workspace) => {
    // Create the row container and apply a common CSS class for consistency
    const item = document.createElement('div')
    item.classList.add('workspace-item')
    // Create, populate the name element with full path
    const name = document.createElement('div')
    name.classList.add('workspace-name')
    name.textContent = workspace.folder_name
    name.title = workspace.folder_path
    // Create, populate the metadata element with "last opened" time to help find recent folders
    const meta = document.createElement('div')
    meta.classList.add('workspace-meta')
    const lastOpened = new Date(workspace.last_opened)
    const timeAgo = getTimeAgo(lastOpened)
    meta.textContent = timeAgo
    // Create, populate the stats element with number of files due today
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

  const items = workspaceHistoryList.querySelectorAll('.workspace-item')
  items.forEach((item) => {
    item.classList.remove('selected')
    if (window.currentRootPath === 'ALL' && item.classList.contains('all-workspaces-item')) {
      item.classList.add('selected')
    } else if (item.title === window.currentRootPath) {
      // Using title which has folder_path
      item.classList.add('selected')
    }
  })
}

export async function openWorkspace(folderPath) {
  try {
    // Initial Setup and Mode Detection
    window.currentRootPath = folderPath
    window.isAllWorkspacesMode = folderPath === 'ALL'
    window.dispatchEvent(
      new CustomEvent('workspace-mode-changed', {
        detail: { isAll: window.isAllWorkspacesMode, path: folderPath },
      })
    )

    // Special case: "All Workspaces" combined view
    if (folderPath === 'ALL') {
      window.currentRootPath = 'ALL'
      const treeContainer = document.getElementById('tree-container')
      treeContainer.innerHTML = ''

      try {
        // fetch all recent workspaces, import renderTree function
        const workspaces = await window.fileManager.getRecentWorkspaces()
        const { renderTree } = await import('./fileTree.js')

        // Flatten all workspace trees into one array of nodes
        const combined = []

        // Loop through each workspace and get its directory tree
        for (const ws of workspaces) {
          const tree = await window.fileManager.getRecentTree
          const treeData = await window.fileManager.getDirectoryTree(ws.folder_path)
          // Normalize data: if a workspace returns an object with children, use children; if it's already an array, use it
          const nodes = Array.isArray(treeData)
            ? treeData
            : Array.isArray(treeData?.children)
              ? treeData.children
              : []

          // combine them into one array containing all nodes
          combined.push(...nodes)
        }

        // IMPORTANT: pass an array, not an object
        // anyways disable interactive adding in ALL mode aka no adding files from combined view
        renderTree(combined, treeContainer, { disable: true })

        // Disable all "add to revision" buttons in this ALL mode
        // select all buttons with class 'add-file-btn' or data-action="add-file"
        // then disable them e.g. style.display = 'none' so invisible to users;
        const addButtons = treeContainer.querySelectorAll('.add-file-btn, [data-action="add-file"]')

        addButtons.forEach((btn) => {
          btn.style.display = 'none' // invisible to users
          btn.removeAttribute('onclick') // defensive if inline handlers exist
        })

        // Load recent workspaces and all files for revision across workspaces
        await loadRecentWorkspaces()
        const revisionList = document.querySelector('revision-list')

        // if there is no stuff then just return
        if (!revisionList) return

        // fetch all files for revision from all workspaces, if successful then throw them to middle col aka the "Files for Revision"
        const result = await window.fileManager.getAllFilesForRevision(() => centralDbPath)
        if (result.success) {
          revisionList.files = result.files
        }

        // lastly return cuz below is going to be single workplace mode
        return
      } catch (error) {
        console.error('Error loading combined workspace view:', error)
        alert(`Error loading combined view: ${error.message}`)
      }
    }

    // single workspace mode, database and tree setup
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

    // re-enable add buttons in single workspace mode when they were previously disabled in ALL mode
    // similar logic as before like loop each of them but now we unhide and re-enable them
    const addButtons = treeContainer.querySelectorAll('.add-file-btn, [data-action="add-file"]')
    addButtons.forEach((btn) => {
      btn.style.display = '' // unhide
      btn.disabled = false // allow clicking
      btn.classList.remove('disabled') // remove any disabled styling
      btn.removeAttribute('aria-disabled') // clean up ARIA state
      btn.title = 'Add file to revision queue' // restore tooltip
    })

    // Load recent workspaces and all files for revision across workspaces
    // yes just same stuff as before
    await loadRecentWorkspaces()
    // update revision list with files from the specific workspace
    const revisionList = document.querySelector('revision-list')
    if (!revisionList) return
    const result = await window.fileManager.getFilesForRevision(folderPath)
    if (result.success) {
      revisionList.files = result.files
    }
  } catch (error) {
    console.error('Error opening workspace:', error)
    alert(`Error opening workspace: ${error.message}`)
  }

  // global add button guard for ALL workspaces mode
  if (!window.__addGuardRegistered) {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.add-file-btn, [data-action="add-file"]')
      if (!btn) return
      if (window.isAllWorkspacesMode) {
        e.preventDefault()
        const toast = document.getElementById('toast')
        toast.textContent = 'Cannot add files in All Workspaces view'
        toast.classList.add('show')
        setTimeout(() => toast.classList.remove('show'), 1800)
      }
    })
    window.__addGuardRegistered = true
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
