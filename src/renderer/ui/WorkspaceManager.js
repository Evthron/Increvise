// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Workspace Manager Lit component
// Manages workspace history and workspace switching

import { LitElement, html, css } from 'lit'

export class WorkspaceManager extends LitElement {
  static properties = {
    workspaces: { type: Array, state: true },
    currentWorkspaceName: { type: String, state: true },
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      width: 100%;
      background-color: var(--bg-sidebar);
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

    .controls {
      padding: 8px;
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
    }

    .controls button:hover {
      background-color: #fafafa;
    }

    .controls button:active {
      background-color: #e5e5e5;
    }

    .workspace-dropdown {
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    sl-dropdown {
      width: 100%;
    }

    sl-button {
      width: 100%;
      overflow: hidden;
    }

    .open-folder-btn {
      width: 100%;
    }

    sl-menu-item::part(base) {
      font-size: 13px;
    }

    sl-menu-item::part(label) {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .workspace-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
    }

    .workspace-meta {
      font-size: 11px;
      color: var(--text-secondary);
    }

    .workspace-stats {
      font-size: 11px;
      color: var(--text-secondary);
    }

    .workspace-item-label {
      display: flex;
      flex-direction: column;
      gap: 2px;
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
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .workspace-item-main {
      min-width: 0;
      flex: 1;
    }

    .remove-btn {
      border: none;
      background: transparent;
      color: var(--text-secondary);
      font-size: 12px;
      cursor: pointer;
      padding: 4px 6px;
      border-radius: 4px;
      line-height: 1;
    }

    .remove-btn:hover {
      color: #b00020;
      background: rgba(176, 0, 32, 0.08);
    }

    .remove-btn:active {
      background: rgba(176, 0, 32, 0.14);
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

    .workspace-separator {
      height: 1px;
      background: var(--border-color);
      margin: 4px 0;
    }
  `

  constructor() {
    super()
    this.workspaces = []
    this.currentWorkspaceName = 'Select Workspace'
    this._fileManagerReady = false

    // Listen for fileManager ready event (mobile)
    if (typeof window !== 'undefined') {
      window.addEventListener('filemanager-ready', () => {
        this._fileManagerReady = true
        this.loadRecentWorkspaces()
      })

      // Listen for workspace changes
      window.addEventListener('workspace-changed', () => {
        this._updateCurrentWorkspaceName()
      })
    }
  }

  async connectedCallback() {
    super.connectedCallback()
    // Only load if fileManager is already available (desktop) or ready (mobile)
    if (window.fileManager) {
      this._fileManagerReady = true
      await this.loadRecentWorkspaces()
      this._updateCurrentWorkspaceName()
    }
  }

  render() {
    if (this.hasAttribute('mobile')) {
      return this._renderMobile()
    } else {
      return this._renderDesktop()
    }
  }

  _renderMobile() {
    return html`
      <div class="workspace-history-header">
        <h3>Recent Workspaces</h3>
      </div>
      <div class="controls">
        <button @click=${this._handleOpenFolder}>Open Folder</button>
      </div>
      <div id="workspace-history-list">
        <div
          class="workspace-item all-workspaces-item ${window.mode?.allWorkspace ? 'selected' : ''}"
          @click=${() => this._handleAllWorkspacesClick()}
        >
          All Workspaces
        </div>
        <div class="workspace-separator"></div>
        ${this.workspaces.map((workspace) => this._renderWorkspaceItem(workspace))}
      </div>
    `
  }

  _renderDesktop() {
    return html`
      <div class="workspace-history-header">
        <h3>Workspace</h3>
      </div>
      <div class="workspace-dropdown">
        <sl-dropdown>
          <sl-button slot="trigger" caret>${this.currentWorkspaceName}</sl-button>
          <sl-menu @sl-select=${this._handleMenuSelect}>
            <sl-menu-item value="all-workspaces" ?checked=${window.mode?.allWorkspace}>
              <div class="workspace-item-label">
                <span class="workspace-name">All Workspaces</span>
              </div>
            </sl-menu-item>
            <sl-divider></sl-divider>
            ${this.workspaces.map((workspace) => this._renderDropdownItem(workspace))}
          </sl-menu>
        </sl-dropdown>
        <sl-button class="open-folder-btn" @click=${this._handleOpenFolder}>
          Open Folder
        </sl-button>
      </div>
    `
  }

  _renderWorkspaceItem(workspace) {
    const isSelected =
      !window.mode?.allWorkspace && window.currentFile?.rootPath === workspace.folder_path
    const timeAgo = this._getTimeAgo(new Date(workspace.last_opened))

    return html`
      <div
        class="workspace-item ${isSelected ? 'selected' : ''}"
        @click=${() => this._handleSingleWorkspaceClick(workspace.folder_path)}
        title=${workspace.folder_path}
      >
        <div class="workspace-item-main">
          <div class="workspace-name">${workspace.folder_name}</div>
          <div class="workspace-meta">${timeAgo}</div>
          ${workspace.files_due_today > 0
            ? html`<div class="workspace-stats">${workspace.files_due_today} due</div>`
            : ''}
        </div>
        <button
          class="remove-btn"
          type="button"
          title="Remove workspace from history"
          @click=${(event) => this._handleRemoveWorkspace(event, workspace.folder_path)}
        >
          Remove
        </button>
      </div>
    `
  }

  _renderDropdownItem(workspace) {
    const isSelected =
      !window.mode?.allWorkspace && window.currentFile?.rootPath === workspace.folder_path

    return html`
      <sl-menu-item
        value=${workspace.folder_path}
        ?checked=${isSelected}
        title=${workspace.folder_path}
      >
        <div class="workspace-item-label">
          <span class="workspace-name">${workspace.folder_name}</span>
          <span class="workspace-meta">
            ${workspace.files_due_today > 0
              ? html` · <span class="workspace-stats">${workspace.files_due_today} due</span>`
              : ''}
          </span>
        </div>
        <sl-icon-button
          slot="suffix"
          name="trash"
          label="Remove workspace"
          @click=${(event) => this._handleRemoveWorkspace(event, workspace.folder_path)}
        ></sl-icon-button>
      </sl-menu-item>
    `
  }

  _updateCurrentWorkspaceName() {
    if (window.mode?.allWorkspace) {
      this.currentWorkspaceName = 'All Workspaces'
    } else {
      const currentPath = window.currentFile?.rootPath
      if (!currentPath) {
        this.currentWorkspaceName = 'Select Workspace'
      } else {
        const workspace = this.workspaces.find((ws) => ws.folder_path === currentPath)
        this.currentWorkspaceName = workspace ? workspace.folder_name : 'Select Workspace'
      }
    }
  }

  _handleMenuSelect(event) {
    const value = event.detail.item.value

    if (value === 'all-workspaces') {
      this._handleAllWorkspacesClick()
    } else {
      this._handleSingleWorkspaceClick(value)
    }
  }

  async loadRecentWorkspaces() {
    try {
      if (!window.fileManager) {
        console.warn('fileManager not yet initialized')
        return
      }
      const workspaces = await window.fileManager.getRecentWorkspaces()
      this.workspaces = workspaces || []
      this._updateCurrentWorkspaceName()
    } catch (error) {
      console.error('Error loading recent workspaces:', error)
    }
  }

  async _handleOpenFolder() {
    try {
      const folderPath = await window.fileManager.selectFolder()
      if (folderPath) {
        this._handleSingleWorkspaceClick(folderPath)
      }
    } catch (error) {
      console.error('Error selecting folder:', error)
      alert(`Error selecting folder: ${error.message}`)
    }
  }

  _handleAllWorkspacesClick() {
    // Dispatch event for switching to all workspaces mode
    this.dispatchEvent(
      new CustomEvent('workspace-selected', {
        detail: { isAllWorkspacesMode: true },
        bubbles: true,
        composed: true,
      })
    )
    this._updateCurrentWorkspaceName()
  }

  _handleSingleWorkspaceClick(folderPath) {
    // Dispatch event for opening a specific workspace
    this.dispatchEvent(
      new CustomEvent('workspace-selected', {
        detail: { folderPath, isAllWorkspacesMode: false },
        bubbles: true,
        composed: true,
      })
    )
    this._updateCurrentWorkspaceName()
  }

  async _handleRemoveWorkspace(event, folderPath) {
    event.stopPropagation()
    event.preventDefault()

    const workspace = this.workspaces.find((ws) => ws.folder_path === folderPath)
    const workspaceName = workspace?.folder_name || folderPath
    const confirmed = confirm(`Remove workspace "${workspaceName}" from history?`)
    if (!confirmed) {
      return
    }

    try {
      const result = await window.fileManager.removeWorkspace(folderPath)
      if (!result?.success) {
        alert(`Failed to remove workspace: ${result?.error || 'Unknown error'}`)
        return
      }

      this.workspaces = this.workspaces.filter((ws) => ws.folder_path !== folderPath)

      const removedCurrentWorkspace = window.currentFile?.rootPath === folderPath
      if (removedCurrentWorkspace || window.mode?.allWorkspace) {
        this._handleAllWorkspacesClick()
      } else {
        this._updateCurrentWorkspaceName()
      }
    } catch (error) {
      console.error('Error removing workspace:', error)
      alert(`Error removing workspace: ${error.message}`)
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

customElements.define('workspace-manager', WorkspaceManager)
