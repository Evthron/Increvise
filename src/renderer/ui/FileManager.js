// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// File Manager Lit component
// Manages workspace history, file tree, and folder selection

import { LitElement, html, css } from 'lit'

export class FileManager extends LitElement {
  static properties = {
    treeData: { type: Array, state: true },
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      background-color: var(--bg-sidebar);
      overflow-y: auto;
    }

    .headline-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--text-secondary);
      letter-spacing: 0.5px;
      margin: 0;
    }
  `

  constructor() {
    super()
    this.treeData = []
    // Detect if running on mobile (Capacitor)
    this.isMobile = typeof window !== 'undefined' && window.Capacitor !== undefined

    // Listen for tree refresh events
    this._handleTreeRefresh = this._handleTreeRefresh.bind(this)

    // Listen for file system changes
    this._handleFileSystemChange = this._handleFileSystemChange.bind(this)
  }

  async connectedCallback() {
    super.connectedCallback()
    // Listen for workspace selection events from WorkspaceManager
    window.addEventListener('workspace-selected', this._handleWorkspaceSelected)
  }

  _handleWorkspaceSelected = async (event) => {
    const { folderPath, isAllWorkspacesMode } = event.detail

    if (isAllWorkspacesMode) {
      await this._openAllWorkspaces()
    } else if (this.isMobile) {
      await this._mobileOpenSingleWorkspace(folderPath)
    } else {
      await this._openSingleWorkspace(folderPath)
    }

    // Add event listener for tree refresh
    this.addEventListener('tree-refresh-needed', this._handleTreeRefresh)

    // Add listener for file system changes
    window.fileManager.onWorkspaceFilesChanged(this._handleFileSystemChange)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    window.removeEventListener('workspace-selected', this._handleWorkspaceSelected)
    this.removeEventListener('tree-refresh-needed', this._handleTreeRefresh)

    // Remove file system change listener
    window.fileManager.removeWorkspaceFilesChangedListener(this._handleFileSystemChange)

    // Stop all watchers
    window.fileManager.stopAllWatchers()
  }

  async _handleTreeRefresh() {
    await this.refreshCurrentWorkspace()
  }

  async _handleFileSystemChange(data) {
    console.log('[FileManager] File system change detected:', data)

    // Auto-refresh the tree after a file system change
    await this.refreshCurrentWorkspace()
  }

  render() {
    return html`
      <file-tree .treeData="${this.treeData}" .disabled="${window.mode.allWorkspace}"></file-tree>
    `
  }

  async refreshCurrentWorkspace() {
    if (!window.mode.allWorkspace && !window.currentFile.rootPath) {
      console.warn('No workspace is currently open')
      return
    }

    try {
      if (window.mode.allWorkspace) {
        await this._openAllWorkspaces()
      } else {
        // Refresh the directory tree for single workspace
        const result = await window.fileManager.getDirectoryTree(
          window.currentFile.rootPath,
          window.currentWorkspace.libraryId
        )

        if (!result.success) {
          console.error('Failed to refresh directory tree:', result.error)
          alert(`Failed to refresh dir：${result.error}`)
          return
        }

        this.treeData = result.data

        // Also refresh the revision list
        const revisionList = document.querySelector('revision-list')
        if (revisionList) {
          await revisionList.refreshFileList()
        }
      }
    } catch (error) {
      console.error('Error refreshing workspace:', error)
    }
  }

  async _openAllWorkspaces() {
    // Stop current revision workflow before switching workspace
    window.mode.revision = false

    window.currentFile.rootPath = null
    window.mode.allWorkspace = true

    try {
      const workspaces = await window.fileManager.getRecentWorkspaces()
      const combined = []

      // Loop through each workspace and get its directory tree
      for (const ws of workspaces) {
        try {
          const result = await window.fileManager.getDirectoryTree(ws.folder_path, ws.library_id)

          if (!result.success) {
            console.error(`Failed to load workspace ${ws.folder_path}:`, result.error)
            continue // Skip this workspace but continue with others
          }

          const nodes = Array.isArray(result.data)
            ? result.data
            : Array.isArray(result.data?.children)
              ? result.data.children
              : []
          combined.push(...nodes)
        } catch (error) {
          console.error(`Failed to load workspace ${ws.folder_path}:`, error)
          continue
        }
      }
      this.treeData = combined

      const revisionList = document.querySelector('revision-list')

      if (revisionList) {
        // Use refreshFileList to respect the current view mode
        await revisionList.refreshFileList()
      }
    } catch (error) {
      console.error('Error loading combined workspace view:', error)
      alert(`Error loading combined view: ${error.message}`)
    }

    // Register add button guard for ALL workspaces mode
    this._registerAddButtonGuard()
  }

  async _openSingleWorkspace(folderPath) {
    // Stop current revision workflow before switching workspace
    window.mode.revision = false

    // Update global window properties
    window.currentFile.rootPath = folderPath
    window.mode.allWorkspace = false

    // Stop watching previous workspace
    await window.fileManager.stopAllWatchers()

    // Database and tree setup
    const dbResult = await window.fileManager.createDatabase(folderPath)
    if (dbResult.success) {
      console.log('Database ready at:', dbResult.path)
      window.currentWorkspace.libraryId = dbResult.libraryId
      console.log('Workspace Library ID:', dbResult.libraryId)
    } else {
      console.warn('Database setup warning:', dbResult.error)
    }

    await window.fileManager.recordWorkspace(folderPath)
    console.log('Workspace recorded in central database')

    try {
      const result = await window.fileManager.getDirectoryTree(
        folderPath,
        window.currentWorkspace.libraryId
      )

      if (!result.success) {
        console.error('Failed to load directory tree:', result.error)
        alert(`Failed to load directory tree: ${result.error}`)
        this.treeData = []
      } else {
        console.log('Directory tree received:', result.data)
        this.treeData = result.data
      }
    } catch (error) {
      console.error('Error fetching directory tree:', error)
      alert(`Error fetching directory tree:：${error.message}`)
      this.treeData = []
    }

    const revisionList = document.querySelector('revision-list')

    if (revisionList) {
      // Use refreshFileList to respect the current view mode
      await revisionList.refreshFileList()
    }

    this._registerAddButtonGuard()
  }

  async _mobileOpenSingleWorkspace(folderPath) {
    // Stop current revision workflow before switching workspace
    window.mode.revision = false

    // Update global window properties
    window.currentFile.rootPath = folderPath
    window.mode.allWorkspace = false

    // Database and tree setup
    // On mobile, skip createDatabase as workspace DB is already opened during import
    // On mobile, folderPath is actually the DB name
    // Extract library_id from the workspace DB
    try {
      const db = await import('../../adapters/sqlite-adapter.js')
      const library = await db.getOne(folderPath, 'SELECT library_id FROM library LIMIT 1')
      if (library) {
        window.currentWorkspace.libraryId = library.library_id
        console.log('Mobile Workspace Library ID:', library.library_id)
      } else {
        console.error('No library found in workspace DB:', folderPath)
      }
    } catch (error) {
      console.error('Error getting library ID from workspace:', error)
    }

    await window.fileManager.recordWorkspace(folderPath)
    console.log('Workspace recorded in central database')

    // On mobile, skip directory tree loading (read-only mode)
    // Mobile: no directory tree, just empty array
    this.treeData = []
    console.log('[Mobile] Skipped directory tree loading (read-only mode)')

    // Refresh workspace list in WorkspaceManager (sibling)
    const workspaceManager = document.querySelector('workspace-manager')
    if (workspaceManager) {
      await workspaceManager.loadRecentWorkspaces()
    }

    const revisionList = document.querySelector('revision-list')

    if (revisionList) {
      // Use refreshFileList to respect the current view mode
      await revisionList.refreshFileList()
    }

    this._registerAddButtonGuard()

    // Start watching this workspace for file changes
    console.log('[FileManager] Starting file watcher for:', folderPath)
    const watchResult = await window.fileManager.startWatchingWorkspace(folderPath)
    if (watchResult.success) {
      console.log('[FileManager] File watcher active')
    } else {
      console.error('[FileManager] Failed to start file watcher:', watchResult.error)
    }
  }

  _registerAddButtonGuard() {
    if (!window.__addGuardRegistered) {
      document.addEventListener('click', (e) => {
        const btn = e.target.closest('.add-file-btn, [data-action="add-file"]')
        if (!btn) return
        if (window.mode.allWorkspace) {
          e.preventDefault()
          this._showToast('Cannot add files in All Workspaces view')
        }
      })
      window.__addGuardRegistered = true
    }
  }

  _showToast(message) {
    const toast = document.getElementById('toast')
    if (toast) {
      toast.textContent = message
      toast.classList.add('show')
      setTimeout(() => toast.classList.remove('show'), 1800)
    }
  }
}

customElements.define('file-manager', FileManager)
