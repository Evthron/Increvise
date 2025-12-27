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

  const items = workspaceHistoryList.querySelectorAll('.workspace-item');
  items.forEach(item => {
    item.classList.remove('selected');
    if (window.currentRootPath === 'ALL' && item.classList.contains('all-workspaces-item')) {
      item.classList.add('selected');
    } else if (item.title === window.currentRootPath) { // Using title which has folder_path
      item.classList.add('selected');
    }
  });

}

export async function openWorkspace(folderPath) {
  try { 
    // Special case: "All Workspaces" combined view
    if (folderPath === 'ALL') {
      window.currentRootPath = 'ALL';
      const treeContainer = document.getElementById('tree-container');
      treeContainer.innerHTML = '';

      try {
        const workspaces = await window.fileManager.getRecentWorkspaces();
        const { renderTree } = await import('./fileTree.js');

        // Flatten all workspace trees into one array of nodes
        const combined = [];

        for (const ws of workspaces) {
          const tree = await window.fileManager.getRecentTree
          const treeData = await window.fileManager.getDirectoryTree(ws.folder_path);
          // Normalize: if a workspace returns an object with children, use children; if it's already an array, use it
          const nodes = Array.isArray(treeData)
            ? treeData
            : Array.isArray(treeData?.children)
              ? treeData.children
              : [];

          combined.push(...nodes);
        }

        // IMPORTANT: pass an array, not an object
        renderTree(combined, treeContainer);

        await loadRecentWorkspaces();
        return;
      } catch (error) {
        console.error('Error loading combined workspace view:', error);
        alert(`Error loading combined view: ${error.message}`);
      }
    }

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

    // window.dispatchEvent(new CustomEvent('workspace-changed', { detail: { path: folderPath } }))

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
