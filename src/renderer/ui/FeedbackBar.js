// SPDX-FileCopyrightText: 2025 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

/* global setTimeout, customElements */

// Feedback Bar Lit component
// Manages revision workflow state and feedback controls

import { LitElement, html, css } from 'lit'
import './QueueMenu.js'

export class FeedbackBar extends LitElement {
  static properties = {
    revisionFiles: { type: Array, state: true },
    currentIndex: { type: Number, state: true },
    isRevisionMode: { type: Boolean, state: true },
    currentQueue: { type: String, state: true },
    showQueueMenu: { type: Boolean, state: true },
  }

  static styles = css`
    :host {
      display: none;
      flex-direction: column;
      border-top: 1px solid var(--border-color);
      background-color: var(--toolbar-bg);
      padding: 16px;
      flex-shrink: 0;
      max-height: 200px;
      overflow-y: auto;
    }

    :host([visible]) {
      display: flex;
    }

    #current-file-name {
      font-size: 13px;
      color: var(--text-primary);
      margin-bottom: 12px;
      padding: 12px;
      background-color: var(--bg-primary);
      border-radius: 6px;
      border: 1px solid var(--border-color);
    }

    .current-file-header {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .current-file-title {
      font-weight: 600;
      font-size: 14px;
      color: var(--text-primary);
    }

    .current-file-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      font-size: 12px;
      color: var(--text-secondary);
    }

    .file-meta-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .meta-icon {
      font-size: 13px;
    }

    .file-meta-separator {
      color: var(--border-color);
    }

    .rank-control {
      display: flex;
      align-items: center;
      gap: 4px;
      background-color: var(--bg-secondary);
      padding: 2px 6px;
      border-radius: 4px;
    }

    .rank-btn {
      width: 20px;
      height: 20px;
      padding: 0;
      border: 1px solid var(--border-color);
      background-color: var(--bg-primary);
      border-radius: 3px;
      cursor: pointer;
      font-size: 14px;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
    }

    .rank-btn:hover {
      background-color: var(--accent-color);
      color: white;
      border-color: var(--accent-color);
    }

    .rank-input {
      width: 45px;
      padding: 2px 4px;
      border: 1px solid var(--border-color);
      border-radius: 3px;
      font-size: 12px;
      text-align: center;
      background-color: var(--bg-primary);
    }

    .rank-input::-webkit-inner-spin-button,
    .rank-input::-webkit-outer-spin-button {
      opacity: 1;
    }

    .queue-control {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background-color: var(--bg-secondary);
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      transition: background-color 0.15s ease;
    }

    .queue-control:hover {
      background-color: #e8e8e8;
    }

    .queue-label {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .queue-value {
      font-size: 12px;
      font-weight: 500;
      color: var(--text-primary);
      padding: 2px 6px;
      border-radius: 3px;
      background-color: var(--bg-primary);
      border: 1px solid var(--border-color);
    }

    .queue-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .queue-badge.new {
      background-color: #e3f2fd;
      color: #1976d2;
    }

    .queue-badge.processing {
      background-color: #fff3e0;
      color: #f57c00;
    }

    .queue-badge.intermediate {
      background-color: #f3e5f5;
      color: #7b1fa2;
    }

    .queue-badge.spaced-casual {
      background-color: #e8f5e9;
      color: #388e3c;
    }

    .queue-badge.spaced-standard {
      background-color: #e1f5fe;
      color: #0277bd;
    }

    .queue-badge.spaced-strict {
      background-color: #fce4ec;
      color: #c2185b;
    }

    .queue-badge.archived {
      background-color: #f5f5f5;
      color: #757575;
    }

    .feedback-buttons {
      display: flex;
      gap: 8px;
      margin: 10px;
    }

    .feedback-btn {
      flex: 1;
      padding: 10px 16px;
      font-size: 13px;
      font-weight: 600;
      border-radius: 6px;
      border: none;
      text-align: center;
      transition: all 0.2s ease;
      cursor: pointer;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      position: relative;
      overflow: hidden;
      color: white;
    }

    .feedback-btn::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      width: 0;
      height: 0;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.3);
      transform: translate(-50%, -50%);
      transition:
        width 0.3s,
        height 0.3s;
    }

    .feedback-btn:active::before {
      width: 100px;
      height: 100px;
    }

    .feedback-btn:active {
      transform: scale(0.95);
    }

    .feedback-btn.again {
      background: linear-gradient(135deg, #ff3b30 0%, #d32f2f 100%);
    }

    .feedback-btn.again:hover {
      background: linear-gradient(135deg, #e62e24 0%, #b71c1c 100%);
      box-shadow: 0 4px 8px rgba(255, 59, 48, 0.3);
      transform: translateY(-1px);
    }

    .feedback-btn.hard {
      background: linear-gradient(135deg, #ff9500 0%, #f57c00 100%);
    }

    .feedback-btn.hard:hover {
      background: linear-gradient(135deg, #e68600 0%, #ef6c00 100%);
      box-shadow: 0 4px 8px rgba(255, 149, 0, 0.3);
      transform: translateY(-1px);
    }

    .feedback-btn.medium {
      background: linear-gradient(135deg, #007aff 0%, #0051d5 100%);
    }

    .feedback-btn.medium:hover {
      background: linear-gradient(135deg, #0051d5 0%, #0040a8 100%);
      box-shadow: 0 4px 8px rgba(0, 122, 255, 0.3);
      transform: translateY(-1px);
    }

    .feedback-btn.easy {
      background: linear-gradient(135deg, #34c759 0%, #2db34a 100%);
    }

    .feedback-btn.easy:hover {
      background: linear-gradient(135deg, #2db34a 0%, #28a745 100%);
      box-shadow: 0 4px 8px rgba(52, 199, 89, 0.3);
      transform: translateY(-1px);
    }
  `

  constructor() {
    super()
    this.revisionFiles = []
    this.currentIndex = 0
    this.isRevisionMode = false
    this.currentQueue = null
    this.showQueueMenu = false
    this.queueMenuPosition = { top: 0, left: 0 }
  }

  connectedCallback() {
    super.connectedCallback()
    // Listen for file selection from revision list
    document.addEventListener('file-selected', this._handleFileSelected.bind(this))
    // Listen for queue selection from menu
    document.addEventListener('queue-selected', this._handleQueueSelected.bind(this))
    // Close queue menu when clicking outside
    this._clickOutsideHandler = (e) => {
      if (
        this.showQueueMenu &&
        !e.target.closest('.queue-control') &&
        !e.target.closest('queue-menu')
      ) {
        this.showQueueMenu = false
        this.requestUpdate()
      }
    }
    document.addEventListener('click', this._clickOutsideHandler)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    document.removeEventListener('file-selected', this._handleFileSelected.bind(this))
    document.removeEventListener('queue-selected', this._handleQueueSelected.bind(this))
    if (this._clickOutsideHandler) {
      document.removeEventListener('click', this._clickOutsideHandler)
    }
  }

  async _handleFileSelected(e) {
    const { index } = e.detail
    await this.openRevisionFile(index)
  }

  // Public API: Start revision workflow
  async startRevisionWorkflow(files) {
    if (!files || files.length === 0) {
      console.log('No files to review')
      return
    }

    this.revisionFiles = files
    this.currentIndex = 0
    this.isRevisionMode = true

    console.log('Starting revision workflow with', files.length, 'files')

    // Update the revision list component
    const revisionListElement = document.querySelector('revision-list')
    if (revisionListElement) {
      revisionListElement.files = files
      revisionListElement.currentIndex = 0
    }

    // Update workspace stats
    const workspaceCounts = {}
    for (const file of files) {
      if (file.workspacePath) {
        workspaceCounts[file.workspacePath] = (workspaceCounts[file.workspacePath] || 0) + 1
      }
    }
    for (const [workspacePath, count] of Object.entries(workspaceCounts)) {
      await window.fileManager.updateWorkspaceStats(workspacePath, count, count)
    }

    // Automatically open the first file
    await this.openRevisionFile(0)
  }

  // Public API: Stop revision workflow
  stopRevisionWorkflow() {
    console.log('Stopping revision workflow')

    this.revisionFiles = []
    this.currentIndex = 0
    this.isRevisionMode = false
  }

  // Public API: Check if in revision mode
  isInRevisionMode() {
    return this.isRevisionMode
  }

  // Public API: Check if a file is in the queue and show feedback
  checkAndShowFeedbackIfInQueue(filePath) {
    if (!this.isRevisionMode) return

    // Find if the file is in the current revision queue
    const fileIndex = this.revisionFiles.findIndex((f) => f.file_path === filePath)

    if (fileIndex !== -1) {
      // File is in queue, update index and show feedback
      console.log('File is in revision queue at index:', fileIndex)
      this.currentIndex = fileIndex

      // Update revision list component
      const revisionListElement = document.querySelector('revision-list')
      if (revisionListElement) {
        revisionListElement.currentIndex = fileIndex
      }

      this.requestUpdate()
    }
  }

  // Internal: Open a revision file
  async openRevisionFile(index) {
    if (index >= this.revisionFiles.length || index < 0) return

    const file = this.revisionFiles[index]
    this.currentIndex = index

    // Set the current file's library ID before opening
    window.currentFileLibraryId = file.library_id
    console.log('Opening revision file from library:', file.library_id)

    // Load the current file's queue
    await this._loadCurrentQueue()

    // Update revision list component
    const revisionListElement = document.querySelector('revision-list')
    if (revisionListElement) {
      revisionListElement.currentIndex = index
    }

    // Trigger render
    this.requestUpdate()

    // Open the file in editor
    const editorPanel = document.querySelector('editor-panel')
    if (editorPanel) {
      await editorPanel.openFile(file.file_path)
    }
  }

  async _handleFeedback(feedback) {
    const currentFile = this.revisionFiles[this.currentIndex]
    if (!currentFile) return

    try {
      const result = await window.fileManager.updateRevisionFeedback(
        currentFile.dbPath,
        currentFile.library_id,
        currentFile.relative_path,
        feedback
      )

      if (result.success) {
        // Remove the reviewed file
        this.revisionFiles = [
          ...this.revisionFiles.slice(0, this.currentIndex),
          ...this.revisionFiles.slice(this.currentIndex + 1),
        ]

        // Update the revision list component
        const revisionListElement = document.querySelector('revision-list')
        if (revisionListElement) {
          revisionListElement.files = this.revisionFiles
        }

        // Update workspace stats
        const workspaceCounts = {}
        for (const file of this.revisionFiles) {
          workspaceCounts[file.workspacePath] = (workspaceCounts[file.workspacePath] || 0) + 1
        }
        for (const [workspacePath, count] of Object.entries(workspaceCounts)) {
          await window.fileManager.updateWorkspaceStats(workspacePath, count, count)
        }

        if (this.revisionFiles.length > 0) {
          // Adjust index if needed
          if (this.currentIndex >= this.revisionFiles.length) {
            this.currentIndex = this.revisionFiles.length - 1
          }

          // Update component index and open next file
          if (revisionListElement) {
            revisionListElement.currentIndex = this.currentIndex
          }

          await this.openRevisionFile(this.currentIndex)
        } else {
          // All files reviewed
          this._showToast('All files reviewed! Great job! 🎉')
          this.isRevisionMode = false
          const { hideToolbar } = await import('./toolbar.js')
          hideToolbar()
          const filePreview = document.getElementById('file-preview')
          if (filePreview) {
            filePreview.textContent = ''
          }
        }
      } else {
        this._showToast(`Error: ${result.error}`, true)
      }
    } catch (error) {
      console.error('Error updating feedback:', error)
      this._showToast('Error updating feedback', true)
    }
  }

  async _handleRankChange(newRank) {
    const file = this.revisionFiles[this.currentIndex]
    if (!file) return

    const clampedRank = Math.max(1, Math.min(100, Math.round(newRank)))

    try {
      const result = await window.fileManager.updateFileRank(
        file.file_path,
        file.library_id,
        clampedRank
      )

      if (result && result.success) {
        file.rank = clampedRank

        // Re-sort files by rank within the same day
        this.revisionFiles.sort((a, b) => {
          const dateA = new Date(a.due_time)
          const dateB = new Date(b.due_time)
          if (dateA.toDateString() === dateB.toDateString()) {
            return (a.rank || 70) - (b.rank || 70)
          }
          return dateA - dateB
        })

        // Update the revision list component
        const revisionListElement = document.querySelector('revision-list')
        if (revisionListElement) {
          revisionListElement.files = this.revisionFiles
          revisionListElement.currentIndex = this.revisionFiles.indexOf(file)
        }

        // Update current index
        this.currentIndex = this.revisionFiles.indexOf(file)

        this.requestUpdate()
        this._showToast(`Rank updated to ${clampedRank}`)
      } else {
        this._showToast('Failed to update rank', true)
      }
    } catch (error) {
      console.error('Error updating rank:', error)
      this._showToast('Error updating rank', true)
    }
  }

  async _loadCurrentQueue() {
    const file = this.revisionFiles[this.currentIndex]
    if (!file) return

    try {
      const result = await window.fileManager.getFileQueue(file.file_path, file.library_id)
      if (result && result.queueName) {
        this.currentQueue = result.queueName
      }
    } catch (error) {
      console.error('Error loading current queue:', error)
    }
  }

  _toggleQueueMenu(e) {
    e.stopPropagation()

    if (this.showQueueMenu) {
      // Close menu
      this.showQueueMenu = false
    } else {
      // Open menu and calculate position
      this.showQueueMenu = true

      // Get the position of the queue control button
      const target = e.currentTarget
      const rect = target.getBoundingClientRect()

      // Menu dimensions (approximate)
      const menuWidth = 240
      const menuHeight = 350 // Approximate height with 7 items

      // Calculate position (menu appears above the button)
      let left = rect.left
      let top = rect.top - menuHeight - 70 // 16px gap above button (increased from 8px)

      // Adjust if menu would go off screen
      if (left + menuWidth > window.innerWidth) {
        left = window.innerWidth - menuWidth - 16
      }
      if (left < 16) {
        left = 16
      }
      if (top < 70) {
        // If not enough space above, show below instead
        top = rect.bottom + 70
      }

      this.queueMenuPosition = { top, left }
    }

    this.requestUpdate()
  }

  _getQueueDisplayName(queueName) {
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

  async _handleQueueSelected(e) {
    const newQueue = e.detail.queueName
    const file = this.revisionFiles[this.currentIndex]

    if (!file || newQueue === this.currentQueue) {
      this.showQueueMenu = false
      this.requestUpdate()
      return
    }

    try {
      const result = await window.fileManager.moveFileToQueue(
        file.file_path,
        file.library_id,
        newQueue
      )

      if (result && result.success) {
        this.currentQueue = newQueue
        this.showQueueMenu = false
        this._showToast(`Moved to ${this._getQueueDisplayName(newQueue)} queue`)
      } else {
        this._showToast(`Failed to move to ${newQueue} queue`, true)
      }
    } catch (error) {
      console.error('Error changing queue:', error)
      this._showToast('Error changing queue', true)
    }

    this.requestUpdate()
  }

  _showToast(message, isError = false) {
    const toast = document.getElementById('toast')
    if (!toast) return
    toast.textContent = message
    toast.classList.toggle('error', isError)
    toast.classList.add('show')
    setTimeout(() => {
      toast.classList.remove('show')
    }, 3000)
  }

  render() {
    if (!this.isRevisionMode || this.revisionFiles.length === 0) {
      return html``
    }

    const file = this.revisionFiles[this.currentIndex]
    if (!file) return html``

    const fileName = file.file_path.split('/').pop()
    const workspaceName = file.workspacePath ? file.workspacePath.split('/').pop() : 'Unknown'
    const rank = Math.round(file.rank || 70)

    // Calculate order number within the same day
    const dueDate = new Date(file.due_time).toDateString()
    const sameDayFiles = this.revisionFiles.filter(
      (f) => new Date(f.due_time).toDateString() === dueDate
    )
    sameDayFiles.sort((a, b) => (a.rank || 70) - (b.rank || 70))
    const orderNumber = sameDayFiles.indexOf(file) + 1

    // Set visibility attribute
    this.setAttribute('visible', '')

    return html`
      <div id="current-file-name">
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
              <span>${this.currentIndex + 1} of ${this.revisionFiles.length}</span>
            </span>
            <span class="file-meta-separator">•</span>
            <span class="file-meta-item" title="Order within today's revisions">
              <span class="meta-icon">🔢</span>
              <span>Order #${orderNumber}</span>
            </span>
            <span class="file-meta-separator">•</span>
            <span class="file-meta-item rank-control" title="Priority rank (1-100)">
              <span class="meta-icon">⭐</span>
              <button
                class="rank-btn rank-decrease"
                @click=${() => this._handleRankChange(rank - 1)}
                title="Decrease rank"
              >
                −
              </button>
              <input
                type="number"
                class="rank-input"
                .value=${rank}
                min="1"
                max="100"
                @change=${(e) => this._handleRankChange(parseInt(e.target.value))}
                @click=${(e) => e.stopPropagation()}
                title="Enter rank (1-100)"
              />
              <button
                class="rank-btn rank-increase"
                @click=${() => this._handleRankChange(rank + 1)}
                title="Increase rank"
              >
                +
              </button>
            </span>
            ${this.currentQueue
              ? html`
                  <span class="file-meta-separator">•</span>
                  <div class="queue-control" @click=${this._toggleQueueMenu}>
                    <span class="meta-icon">📂</span>
                    <span class="queue-badge ${this.currentQueue}"
                      >${this._getQueueDisplayName(this.currentQueue)}</span
                    >
                  </div>
                `
              : ''}
          </div>
        </div>
      </div>
      <div class="feedback-buttons">
        <button class="feedback-btn again" @click=${() => this._handleFeedback('again')}>
          Again
        </button>
        <button class="feedback-btn hard" @click=${() => this._handleFeedback('hard')}>Hard</button>
        <button class="feedback-btn medium" @click=${() => this._handleFeedback('medium')}>
          Medium
        </button>
        <button class="feedback-btn easy" @click=${() => this._handleFeedback('easy')}>Easy</button>
      </div>
      <queue-menu
        .currentQueue=${this.currentQueue}
        .position=${this.queueMenuPosition}
        .visible=${this.showQueueMenu}
      ></queue-menu>
    `
  }
}

customElements.define('feedback-bar', FeedbackBar)
