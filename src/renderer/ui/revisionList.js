// SPDX-FileCopyrightText: 2025 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Revision list and review controls as a Lit component
// Handles revision file listing, review navigation, and feedback

import { LitElement, html, css } from 'lit'

export class RevisionList extends LitElement {
  static properties = {
    files: { type: Array },
    currentIndex: { type: Number },
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }

    .revision-list-header {
      padding: 16px;
      background: linear-gradient(to bottom, var(--bg-primary), var(--bg-secondary));
      border-bottom: 1px solid var(--border-color);
      flex-shrink: 0;
    }

    .revision-count {
      font-size: 24px;
      font-weight: 700;
      color: var(--accent-color);
      margin-bottom: 4px;
    }

    .revision-subtitle {
      font-size: 12px;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px 24px;
      text-align: center;
      flex: 1;
    }

    .empty-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }

    .empty-text {
      font-size: 18px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 8px;
    }

    .empty-subtext {
      font-size: 13px;
      color: var(--text-secondary);
    }

    .revision-list-container {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }

    .workspace-group {
      margin-bottom: 16px;
    }

    .workspace-group-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background-color: var(--bg-secondary);
      border-radius: 6px;
      margin-bottom: 6px;
      font-size: 11px;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .workspace-icon {
      font-size: 14px;
    }

    .workspace-group-name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .workspace-file-count {
      background-color: var(--accent-color);
      color: white;
      padding: 2px 6px;
      border-radius: 10px;
      font-size: 10px;
      font-weight: 700;
      min-width: 20px;
      text-align: center;
    }

    .revision-item {
      background-color: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 10px 12px;
      margin-bottom: 6px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .revision-item:hover {
      background-color: var(--bg-secondary);
      border-color: var(--accent-color);
      transform: translateX(2px);
    }

    .revision-item.active {
      background-color: rgba(0, 122, 255, 0.08);
      border-color: var(--accent-color);
      box-shadow: 0 0 0 1px rgba(0, 122, 255, 0.1);
    }

    .revision-item-main {
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }

    .revision-item-icon {
      font-size: 16px;
      flex-shrink: 0;
      margin-top: 2px;
    }

    .revision-item-content {
      flex: 1;
      min-width: 0;
    }

    .revision-item-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
      margin-bottom: 6px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .revision-item-meta {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 11px;
      color: var(--text-secondary);
    }

    .revision-meta-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .meta-icon {
      font-size: 12px;
    }

    .meta-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      display: inline-block;
    }
  `

  constructor() {
    super()
    this.files = []
    this.currentIndex = 0
  }

  getDifficultyColor(difficulty) {
    if (difficulty > 0.6) return '#ff3b30'
    if (difficulty > 0.3) return '#ff9500'
    return '#34c759'
  }

  getDifficultyLabel(difficulty) {
    if (difficulty > 0.6) return 'Hard'
    if (difficulty > 0.3) return 'Medium'
    return 'Easy'
  }

  groupFilesByWorkspace() {
    const grouped = {}
    this.files.forEach((file) => {
      const workspace = file.workspacePath || 'Unknown'
      if (!grouped[workspace]) grouped[workspace] = []
      grouped[workspace].push(file)
    })
    return grouped
  }

  async handleFileClick(file, globalIndex) {
    this.currentIndex = globalIndex
    this.requestUpdate()

    // Import and call openFile
    const { openFile } = await import('./editor.js')
    await openFile(file.file_path)
  }

  renderEmptyState() {
    return html`
      <div class="empty-state">
        <div class="empty-subtext">Select a file to start revision</div>
      </div>
    `
  }

  renderFileItem(file, globalIndex) {
    const fileName = file.file_path.split('/').pop()
    const filePath = file.file_path
    const difficultyColor = this.getDifficultyColor(file.difficulty)
    const difficultyLabel = this.getDifficultyLabel(file.difficulty)
    const isActive = globalIndex === this.currentIndex

    // Handler for forget button
    const handleForget = async (e) => {
      e.stopPropagation()
      // Confirm with user
      if (!confirm('Forget this file? This will erase its revision data but keep the file entry.')) return
      
      const result = await window.fileManager.forgetFile(filePath, file.library_id)
      if (result && result.success) {
        // Apply reset values from backend response
        Object.assign(file, result.resetValues)
        this.requestUpdate()
      } else {
        alert('Failed to forget file: ' + (result?.error || 'Unknown error'))
      }
    }

    return html`
      <div
        class="revision-item ${isActive ? 'active' : ''}"
        @click=${() => this.handleFileClick(file, globalIndex)}
        title="${filePath}"
      >
        <div class="revision-item-main">
          <div class="revision-item-icon">📄</div>
          <div class="revision-item-content">
            <div class="revision-item-name">${fileName}</div>
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
          <button
            class="forget-file-btn"
            title="Forget this file (erase revision data)"
            @click=${handleForget}
            style="color: #888; background: transparent; border: 1px solid #666; border-radius: 3px; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; margin-left: 8px; cursor: pointer; font-size: 14px; font-weight: bold; transition: all 0.15s ease;"
            onmouseover="this.style.background='#555'; this.style.color='#fff'"
            onmouseout="this.style.background='transparent'; this.style.color='#888'"
          >
            ✕
          </button>
        </div>
      </div>
    `
  }

  renderWorkspaceGroup(workspace, workspaceFiles) {
    const workspaceName = workspace.split('/').pop()

    return html`
      <div class="workspace-group">
        <div class="workspace-group-header">
          <span class="workspace-icon">📁</span>
          <span class="workspace-group-name">${workspaceName}</span>
          <span class="workspace-file-count">${workspaceFiles.length}</span>
        </div>
        ${workspaceFiles.map((file) => {
          const globalIndex = this.files.indexOf(file)
          return this.renderFileItem(file, globalIndex)
        })}
      </div>
    `
  }

  render() {
    const groupedFiles = this.groupFilesByWorkspace()

    return html`
      <div class="revision-list-header">
        <div class="revision-count">
          ${this.files.length} file${this.files.length !== 1 ? 's' : ''}
        </div>
        <div class="revision-subtitle">Due for review</div>
      </div>

      ${this.files.length === 0
        ? this.renderEmptyState()
        : html`
            <div class="revision-list-container">
              ${Object.entries(groupedFiles).map(([workspace, workspaceFiles]) =>
                this.renderWorkspaceGroup(workspace, workspaceFiles)
              )}
            </div>
          `}
    `
  }
}

customElements.define('revision-list', RevisionList)
