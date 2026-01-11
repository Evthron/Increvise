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
    selectedQueueFilter: { type: String, state: true },
    showAllFiles: { type: Boolean, state: true },
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

    .queue-filter-bar {
      display: flex;
      gap: 6px;
      padding: 12px 16px;
      background-color: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
      overflow-x: auto;
      flex-shrink: 0;
    }

    .queue-filter-btn {
      padding: 6px 12px;
      font-size: 11px;
      font-weight: 600;
      border: 1px solid var(--border-color);
      border-radius: 16px;
      background-color: var(--bg-primary);
      color: var(--text-secondary);
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .queue-filter-btn:hover {
      background-color: var(--bg-secondary);
      border-color: var(--accent-color);
    }

    .queue-filter-btn.active {
      background-color: var(--accent-color);
      color: white;
      border-color: var(--accent-color);
    }

    .queue-badge-inline {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 6px;
      border-radius: 10px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .queue-badge-inline.new {
      background-color: #e3f2fd;
      color: #1976d2;
    }

    .queue-badge-inline.processing {
      background-color: #fff3e0;
      color: #f57c00;
    }

    .queue-badge-inline.intermediate {
      background-color: #f3e5f5;
      color: #7b1fa2;
    }

    .queue-badge-inline.spaced-casual {
      background-color: #e8f5e9;
      color: #388e3c;
    }

    .queue-badge-inline.spaced-standard {
      background-color: #e1f5fe;
      color: #0277bd;
    }

    .queue-badge-inline.spaced-strict {
      background-color: #fce4ec;
      color: #c2185b;
    }

    .queue-badge-inline.archived {
      background-color: #f5f5f5;
      color: #757575;
    }

    .view-toggle-bar {
      display: flex;
      gap: 6px;
      padding: 8px 16px;
      background-color: var(--bg-primary);
      border-bottom: 1px solid var(--border-color);
      flex-shrink: 0;
      align-items: center;
    }

    .view-toggle-label {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-right: 8px;
    }

    .view-toggle-btn {
      padding: 6px 12px;
      font-size: 11px;
      font-weight: 600;
      border: 1px solid var(--border-color);
      border-radius: 16px;
      background-color: var(--bg-primary);
      color: var(--text-secondary);
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
    }

    .view-toggle-btn:hover {
      background-color: var(--bg-secondary);
      border-color: var(--accent-color);
    }

    .view-toggle-btn.active {
      background-color: var(--accent-color);
      color: white;
      border-color: var(--accent-color);
    }
  `

  constructor() {
    super()
    this.files = []
    this.currentIndex = 0
    this.selectedQueueFilter = 'all'
    this.showAllFiles = false
  }

  connectedCallback() {
    super.connectedCallback()

    // Listen for file-added-to-queue event
    window.addEventListener('file-added-to-queue', this._handleFileAddedToQueue.bind(this))

    // Listen for queue-changed event
    window.addEventListener('queue-changed', this._handleQueueChanged.bind(this))
  }

  disconnectedCallback() {
    super.disconnectedCallback()

    // Clean up event listeners
    window.removeEventListener('file-added-to-queue', this._handleFileAddedToQueue.bind(this))
    window.removeEventListener('queue-changed', this._handleQueueChanged.bind(this))
  }

  async _handleFileAddedToQueue(event) {
    console.log('RevisionList: File added to queue, refreshing...', event.detail)
    await this.refreshFileList()
  }

  async _handleQueueChanged(event) {
    console.log('RevisionList: Queue changed, refreshing...', event.detail)
    await this.refreshFileList()
  }

  async refreshFileList() {
    try {
      console.log('Refreshing file list, showAllFiles:', this.showAllFiles)
      // Check if we're in All Workspaces mode or single workspace mode
      const fileManager = document.querySelector('file-manager')
      if (!fileManager) return

      let result
      if (fileManager.isAllWorkspacesMode) {
        console.log('Using All Workspaces mode')
        // Use showAllFiles to determine which API to call
        if (this.showAllFiles) {
          console.log('Calling getAllFilesIncludingFuture()')
          result = await window.fileManager.getAllFilesIncludingFuture()
        } else {
          console.log('Calling getAllFilesForRevision()')
          result = await window.fileManager.getAllFilesForRevision()
        }
      } else if (fileManager.currentRootPath) {
        console.log('Using single workspace mode:', fileManager.currentRootPath)
        // Single workspace mode - also check showAllFiles
        if (this.showAllFiles) {
          console.log('Calling getFilesIncludingFuture()')
          result = await window.fileManager.getFilesIncludingFuture(fileManager.currentRootPath)
        } else {
          console.log('Calling getFilesForRevision()')
          result = await window.fileManager.getFilesForRevision(fileManager.currentRootPath)
        }
      } else {
        return
      }

      if (result && result.success) {
        console.log('Files received:', result.files.length)
        this.files = result.files
        this.requestUpdate()
      }
    } catch (error) {
      console.error('Error refreshing file list:', error)
    }
  }

  groupFilesByWorkspace() {
    const grouped = {}
    const filteredFiles = this.getFilteredFiles()
    filteredFiles.forEach((file) => {
      const workspace = file.workspacePath || 'Unknown'
      if (!grouped[workspace]) grouped[workspace] = []
      grouped[workspace].push(file)
    })
    return grouped
  }

  getFilteredFiles() {
    let filtered = this.files

    // First filter by due date if in "Due Today" mode
    if (!this.showAllFiles) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      filtered = this.files.filter((file) => {
        const dueDate = new Date(file.due_time)
        dueDate.setHours(0, 0, 0, 0)
        return dueDate <= today
      })
    }

    // Then filter by queue if not "all"
    if (this.selectedQueueFilter === 'all') {
      return filtered
    }

    return filtered.filter((file) => {
      if (this.selectedQueueFilter === 'spaced') {
        return (
          file.queue_name === 'spaced-casual' ||
          file.queue_name === 'spaced-standard' ||
          file.queue_name === 'spaced-strict'
        )
      }
      return file.queue_name === this.selectedQueueFilter
    })
  }

  getQueueDisplayName(queueName) {
    const names = {
      new: 'New',
      processing: 'Processing',
      intermediate: 'Intermediate',
      'spaced-casual': 'Casual',
      'spaced-standard': 'Standard',
      'spaced-strict': 'Strict',
      archived: 'Archived',
    }
    return names[queueName] || queueName
  }

  handleQueueFilterChange(filter) {
    this.selectedQueueFilter = filter

    // Reset to first file after filtering
    const filteredFiles = this.getFilteredFiles()
    if (filteredFiles.length > 0) {
      this.currentIndex = this.files.indexOf(filteredFiles[0])
    }

    this.requestUpdate()
  }

  async handleViewToggle(showAll) {
    console.log('View toggle:', showAll ? 'All Files' : 'Due Today')
    this.showAllFiles = showAll
    await this.refreshFileList()
    console.log('Files loaded:', this.files.length)
  }

  _renderViewToggleBar() {
    return html`
      <div class="view-toggle-bar">
        <span class="view-toggle-label">Show:</span>
        <button
          class="view-toggle-btn ${!this.showAllFiles ? 'active' : ''}"
          @click=${() => this.handleViewToggle(false)}
        >
          📅 Due Today
        </button>
        <button
          class="view-toggle-btn ${this.showAllFiles ? 'active' : ''}"
          @click=${() => this.handleViewToggle(true)}
        >
          📋 All Files
        </button>
      </div>
    `
  }

  _renderQueueFilterBar() {
    const filters = [
      { id: 'all', label: 'All', icon: '📋' },
      { id: 'new', label: 'New', icon: '📥' },
      { id: 'processing', label: 'Processing', icon: '🔄' },
      { id: 'intermediate', label: 'Intermediate', icon: '📊' },
      { id: 'spaced', label: 'Spaced', icon: '🧠' },
      { id: 'spaced-casual', label: 'Casual', icon: '🟢' },
      { id: 'spaced-standard', label: 'Standard', icon: '🔵' },
      { id: 'spaced-strict', label: 'Strict', icon: '🔴' },
      { id: 'archived', label: 'Archived', icon: '📦' },
    ]

    return html`
      <div class="queue-filter-bar">
        ${filters.map(
          (filter) => html`
            <button
              class="queue-filter-btn ${this.selectedQueueFilter === filter.id ? 'active' : ''}"
              @click=${() => this.handleQueueFilterChange(filter.id)}
            >
              <span>${filter.icon}</span>
              <span>${filter.label}</span>
            </button>
          `
        )}
      </div>
    `
  }

  async handleFileClick(file, globalIndex) {
    this.currentIndex = globalIndex
    this.requestUpdate()

    // Get feedback bar and check if revision mode is active
    const feedbackBar = document.querySelector('feedback-bar')

    // If feedback bar exists and revision mode is NOT active, start it
    if (feedbackBar && !feedbackBar.isInRevisionMode()) {
      const filteredFiles = this.getFilteredFiles()
      if (filteredFiles.length > 0) {
        console.log('Auto-starting revision workflow from file click')
        await feedbackBar.startRevisionWorkflow(filteredFiles)
      }
    }

    // Dispatch a custom event so feedback bar updates
    this.dispatchEvent(
      new CustomEvent('file-selected', {
        detail: { index: globalIndex },
        bubbles: true,
        composed: true,
      })
    )

    // Get editor panel and call openFile
    const editorPanel = document.querySelector('editor-panel')
    if (editorPanel) {
      await editorPanel.openFile(file.file_path)
    }
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
    const isActive = globalIndex === this.currentIndex

    // Calculate if file is due in the future
    const dueDate = new Date(file.due_time)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    dueDate.setHours(0, 0, 0, 0)
    const daysDiff = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24))
    const isDueFuture = daysDiff > 0

    // Handler for forget button
    const handleForget = async (e) => {
      e.stopPropagation()
      // Confirm with user
      if (!confirm('Forget this file? This will erase its revision data but keep the file entry.'))
        return

      const result = await window.fileManager.forgetFile(filePath, file.library_id)
      if (result && result.success) {
        // Apply reset values from backend response
        Object.assign(file, result.resetValues)
        this.requestUpdate()

        // Dispatch event so FeedbackBar can update its copy
        this.dispatchEvent(
          new CustomEvent('file-forgotten', {
            detail: { file, resetValues: result.resetValues },
            bubbles: true,
            composed: true,
          })
        )
      } else {
        alert('Failed to forget file: ' + (result?.error || 'Unknown error'))
        console.error('Failed to forget file:', result?.error || 'Unknown error')
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
              <span class="revision-meta-item"> </span>
              ${isDueFuture
                ? html`
                    <span class="revision-meta-item" style="color: #ff9500;">
                      <span class="meta-icon">📅</span>
                      <span>in ${daysDiff} day${daysDiff !== 1 ? 's' : ''}</span>
                    </span>
                  `
                : ''}
              ${file.queue_name
                ? html`
                    <span class="queue-badge-inline ${file.queue_name}">
                      ${this.getQueueDisplayName(file.queue_name)}
                    </span>
                  `
                : ''}
            </div>
          </div>
          <button
            class="forget-file-btn"
            title="Forget this file (erase revision data)"
            @click=${handleForget}
            style="color: #888; background: transparent; border: 1px solid #666; border-radius: 3px; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; margin-left: 8px; cursor: pointer; font-size: 12px; transition: all 0.15s ease;"
            onmouseover="this.style.background='#555'; this.style.color='#fff'"
            onmouseout="this.style.background='transparent'; this.style.color='#888'"
          >
            ↻
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
    const filteredCount = this.getFilteredFiles().length

    return html`
      <div class="revision-list-header">
        <div class="revision-count">${filteredCount} file${filteredCount !== 1 ? 's' : ''}</div>
        <div class="revision-subtitle">
          ${this.showAllFiles ? 'All files in queues' : 'Due for review'}
        </div>
      </div>

      ${this._renderViewToggleBar()} ${this._renderQueueFilterBar()}
      ${filteredCount === 0
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
