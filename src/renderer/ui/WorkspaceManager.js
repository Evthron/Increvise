// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Workspace Manager Lit component
// Manages workspace history and workspace switching

import { LitElement, html, css } from 'lit'

export class WorkspaceManager extends LitElement {
  static properties = {
    workspaces: { type: Array, state: true },
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
    this._fileManagerReady = false

    // Listen for fileManager ready event (mobile)
    if (typeof window !== 'undefined') {
      window.addEventListener('filemanager-ready', () => {
        this._fileManagerReady = true
        this.loadRecentWorkspaces()
      })
    }
  }

  async connectedCallback() {
    super.connectedCallback()
    // Only load if fileManager is already available (desktop) or ready (mobile)
    if (window.fileManager) {
      this._fileManagerReady = true
      await this.loadRecentWorkspaces()
    }
  }

  render() {
    return html`
      <div class="workspace-history-header">
        <h3>Recent Workspaces</h3>
      </div>
      <div class="controls">
        <button @click=${this._handleOpenFolder}>Open Folder</button>
      </div>
      <div id="workspace-history-list">
        <div
          class="workspace-item all-workspaces-item ${window.mode.allWorkspace ? 'selected' : ''}"
          @click=${() => this._handleAllWorkspacesClick()}
        >
          All Workspaces
        </div>
        <div class="workspace-separator"></div>
        ${this.workspaces.map((workspace) => this._renderWorkspaceItem(workspace))}
      </div>
    `
  }

  _renderWorkspaceItem(workspace) {
    const isSelected =
      !window.mode.allWorkspace && window.currentFile.rootPath === workspace.folder_path
    const timeAgo = this._getTimeAgo(new Date(workspace.last_opened))

    return html`
      <div
        class="workspace-item ${isSelected ? 'selected' : ''}"
        @click=${() => this._handleSingleWorkspaceClick(workspace.folder_path)}
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

  async loadRecentWorkspaces() {
    try {
      if (!window.fileManager) {
        console.warn('fileManager not yet initialized')
        return
      }
      const workspaces = await window.fileManager.getRecentWorkspaces()
      this.workspaces = workspaces || []
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
