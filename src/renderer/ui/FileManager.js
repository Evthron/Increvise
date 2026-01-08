// SPDX-FileCopyrightText: 2025 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

/* global CustomEvent, setTimeout, customElements */

// File Manager Lit component
// Manages workspace history, file tree, and folder selection

import { LitElement, html, css } from 'lit'

export class FileManager extends LitElement {
  static properties = {
    workspaces: { type: Array, state: true },
    currentRootPath: { type: String, state: true },
    isAllWorkspacesMode: { type: Boolean, state: true },
    treeData: { type: Array, state: true },
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      background-color: var(--bg-sidebar);
    }

    .sidebar-header {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color);
      background-color: var(--toolbar-bg);
    }

    .sidebar-header h3 {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--text-secondary);
      letter-spacing: 0.5px;
      margin: 0;
    }

    .sidebar-content {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }

    .controls {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .controls button {
      font-family: var(--font-family);
      font-size: 13px;
      font-weight: 400;
      padding: 6px 12px;
      border: 1px solid var(--border-color);
      border-radius: 5px;
      cursor: pointer;
      background: var(--bg-primary);
      color: var(--text-primary);
      text-align: left;
      transition: background-color 0.15s ease;
    }

    .controls button:hover {
      background-color: #fafafa;
    }

    .controls button:active {
      background-color: #e5e5e5;
    }

    .workspace-history {
      border-top: 1px solid var(--border-color);
      background-color: var(--bg-sidebar);
      flex-shrink: 0;
      max-height: 250px;
      display: flex;
      flex-direction: column;
    }

    .workspace-history-header {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color);
      background-color: var(--toolbar-bg);
    }

    .workspace-history-header h3 {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--text-secondary);
      letter-spacing: 0.5px;
      margin: 0;
    }

    #workspace-history-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }

    .workspace-item {
      padding: 8px 12px;
      margin-bottom: 6px;
      background-color: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: 5px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .workspace-item:hover {
      background-color: #fafafa;
      border-color: var(--accent-color);
    }

    .workspace-item.selected {
      background-color: rgba(0, 122, 255, 0.1);
      border-color: var(--accent-color);
    }

    .workspace-item.all-workspaces-item {
      font-weight: 600;
      background-color: var(--bg-primary);
    }

    .workspace-name {
      font-size: 12px;
      font-weight: 500;
      color: var(--text-primary);
      margin-bottom: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .workspace-meta {
      font-size: 10px;
      color: var(--text-secondary);
      display: flex;
      justify-content: space-between;
      margin-top: 4px;
    }

    .workspace-stats {
      font-size: 10px;
      color: var(--text-secondary);
    }

    .workspace-separator {
      height: 1px;
      background: var(--border-color);
      margin: 4px 0;
    }
  `

  constructor() {
    super()
    this.workspaces = []
    this.currentRootPath = null
    this.isAllWorkspacesMode = false
    this.treeData = []
  }

  async connectedCallback() {
    super.connectedCallback()
    await this._loadRecentWorkspaces()
  }

  render() {
    return html`
      <div class="sidebar-header">
        <h3>File Manager</h3>
      </div>
      <div class="sidebar-content">
        <div class="controls">
          <button @click=${this._handleSelectFolder}>Open Folder</button>
        </div>
        <file-tree .treeData=${this.treeData} .disabled=${this.isAllWorkspacesMode}></file-tree>
      </div>
      <div class="workspace-history">
        <div class="workspace-history-header">
          <h3>Recent Workspaces</h3>
        </div>
        ${this._renderWorkspaceHistory()}
      </div>
    `
  }

  _renderWorkspaceHistory() {
    return html`
      <div id="workspace-history-list">
        <div
          class="workspace-item all-workspaces-item ${this.currentRootPath === 'ALL'
    ? 'selected'
    : ''}"
          @click=${() => this._handleWorkspaceClick('ALL')}
        >
          All Workspaces
        </div>
        <div class="workspace-separator"></div>
        ${this.workspaces.map((workspace) => this._renderWorkspaceItem(workspace))}
      </div>
    `
  }

  _renderWorkspaceItem(workspace) {
    const isSelected = this.currentRootPath === workspace.folder_path
    const timeAgo = this._getTimeAgo(new Date(workspace.last_opened))

    return html`
      <div
        class="workspace-item ${isSelected ? 'selected' : ''}"
        @click=${() => this._handleWorkspaceClick(workspace.folder_path)}
        title=${workspace.folder_path}
      >
        <div class="workspace-name">${workspace.folder_name}</div>
        <div class="workspace-meta">${timeAgo}</div>
        ${workspace.files_due_today > 0
    ? html`<div class="workspace-stats">${workspace.files_due_today} due</div>`
    : ''}
      </div>
    `
  }

  async _loadRecentWorkspaces() {
    try {
      const workspaces = await window.fileManager.getRecentWorkspaces()
      this.workspaces = workspaces || []
    } catch (error) {
      console.error('Error loading recent workspaces:', error)
    }
  }

  async _handleSelectFolder() {
    try {
      const folderPath = await window.fileManager.selectFolder()
      if (folderPath) {
        await this.openWorkspace(folderPath)
      }
    } catch (error) {
      console.error('Error selecting folder:', error)
      alert(`Error selecting folder: ${error.message}`)
    }
  }

  async _handleWorkspaceClick(folderPath) {
    await this.openWorkspace(folderPath)
  }

  async openWorkspace(folderPath) {
    try {
      // Stop current revision workflow before switching workspace
      const { stopRevisionWorkflow } = await import('./feedbackButtons.js')
      stopRevisionWorkflow()

      // Update state
      this.currentRootPath = folderPath
      this.isAllWorkspacesMode = folderPath === 'ALL'

      // Update global window properties for backward compatibility
      window.currentRootPath = folderPath
      window.isAllWorkspacesMode = this.isAllWorkspacesMode

      // Dispatch event
      window.dispatchEvent(
        new CustomEvent('workspace-mode-changed', {
          detail: { isAll: this.isAllWorkspacesMode, path: folderPath },
        })
      )

      // Special case: "All Workspaces" combined view
      if (folderPath === 'ALL') {
        await this._openAllWorkspaces()
        return
      }

      // Single workspace mode
      await this._openSingleWorkspace(folderPath)
    } catch (error) {
      console.error('Error opening workspace:', error)
      alert(`Error opening workspace: ${error.message}`)
    }

    // Register add button guard for ALL workspaces mode
    this._registerAddButtonGuard()
  }

  async refreshCurrentWorkspace() {
    if (!this.currentRootPath) {
      console.warn('No workspace is currently open')
      return
    }

    try {
      if (this.isAllWorkspacesMode) {
        await this._openAllWorkspaces()
      } else {
        // Refresh the directory tree for single workspace
        const tree = await window.fileManager.getDirectoryTree(
          this.currentRootPath,
          window.currentWorkspaceLibraryId
        )
        this.treeData = tree
      }
    } catch (error) {
      console.error('Error refreshing workspace:', error)
    }
  }

  async _openAllWorkspaces() {
    try {
      const workspaces = await window.fileManager.getRecentWorkspaces()
      const combined = []

      // Loop through each workspace and get its directory tree
      for (const ws of workspaces) {
        const treeData = await window.fileManager.getDirectoryTree(ws.folder_path, ws.library_id)
        const nodes = Array.isArray(treeData)
          ? treeData
          : Array.isArray(treeData?.children)
            ? treeData.children
            : []
        combined.push(...nodes)
      }

      this.treeData = combined

      // Load recent workspaces and all files for revision across workspaces
      await this._loadRecentWorkspaces()
      const revisionList = document.querySelector('revision-list')

      if (revisionList) {
        const result = await window.fileManager.getAllFilesForRevision()
        if (result.success) {
          revisionList.files = result.files

          // Auto-start revision workflow if files are available
          if (result.files.length > 0) {
            const { startRevisionWorkflow } = await import('./feedbackButtons.js')
            await startRevisionWorkflow(result.files)
          }
        }
      }
    } catch (error) {
      console.error('Error loading combined workspace view:', error)
      alert(`Error loading combined view: ${error.message}`)
    }
  }

  async _openSingleWorkspace(folderPath) {
    // Database and tree setup
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

    const tree = await window.fileManager.getDirectoryTree(
      folderPath,
      window.currentWorkspaceLibraryId
    )
    console.log('Directory tree received:', tree)
    this.treeData = tree

    // Load recent workspaces and update revision list
    await this._loadRecentWorkspaces()
    const revisionList = document.querySelector('revision-list')

    if (revisionList) {
      const result = await window.fileManager.getFilesForRevision(folderPath)
      if (result.success) {
        revisionList.files = result.files

        // Auto-start revision workflow if files are available
        if (result.files.length > 0) {
          const { startRevisionWorkflow } = await import('./feedbackButtons.js')
          await startRevisionWorkflow(result.files)
        }
      }
    }
  }

  _registerAddButtonGuard() {
    if (!window.__addGuardRegistered) {
      document.addEventListener('click', (e) => {
        const btn = e.target.closest('.add-file-btn, [data-action="add-file"]')
        if (!btn) return
        if (window.isAllWorkspacesMode) {
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

  _getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000)
    if (seconds < 60) return 'Just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
    if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w ago`
    return `${Math.floor(seconds / 2592000)}mo ago`
  }
}

customElements.define('file-manager', FileManager)
