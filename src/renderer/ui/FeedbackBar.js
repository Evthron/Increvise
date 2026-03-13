// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Feedback Bar Lit component
// Manages revision workflow state and feedback controls

import { LitElement, html, css } from 'lit'
import './QueueMenu.js'
import './ProcessingFeedbackBar.js'

export class FeedbackBar extends LitElement {
  static properties = {
    currentQueue: { type: String, state: true },
    file: { type: Object, state: true },
    rank: { type: Number, state: true },
    intervalInfo: { type: Object, state: true },
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

    .interval-control {
      display: flex;
      align-items: center;
      gap: 4px;
      background-color: var(--bg-secondary);
      padding: 2px 6px;
      border-radius: 4px;
    }

    .interval-display {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      color: var(--text-primary);
    }

    .interval-separator {
      color: var(--border-color);
      font-size: 10px;
    }

    .interval-unit {
      font-size: 10px;
      color: var(--text-secondary);
      margin-left: 2px;
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
      padding: 0px 8px;
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

    .feedback-btn.good {
      background: linear-gradient(135deg, #007aff 0%, #0051d5 100%);
    }

    .feedback-btn.good:hover {
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

    .feedback-btn.decrease {
      background: linear-gradient(135deg, #ff3b30 0%, #d32f2f 100%);
    }

    .feedback-btn.decrease:hover {
      background: linear-gradient(135deg, #e62e24 0%, #b71c1c 100%);
      box-shadow: 0 4px 8px rgba(255, 59, 48, 0.3);
      transform: translateY(-1px);
    }

    .feedback-btn.maintain {
      background: linear-gradient(135deg, #007aff 0%, #0051d5 100%);
    }

    .feedback-btn.maintain:hover {
      background: linear-gradient(135deg, #0051d5 0%, #0040a8 100%);
      box-shadow: 0 4px 8px rgba(0, 122, 255, 0.3);
      transform: translateY(-1px);
    }

    .feedback-btn.increase {
      background: linear-gradient(135deg, #34c759 0%, #2db34a 100%);
    }

    .feedback-btn.increase:hover {
      background: linear-gradient(135deg, #2db34a 0%, #28a745 100%);
      box-shadow: 0 4px 8px rgba(52, 199, 89, 0.3);
      transform: translateY(-1px);
    }
  `

  constructor() {
    super()
    this.currentQueue = null
    this.file = null
    this.rank = null
    this.intervalInfo = null
  }

  connectedCallback() {
    super.connectedCallback()
    // Listen for processing queue feedback
    document.addEventListener('processing-feedback', this._handleProcessingFeedback.bind(this))
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    document.removeEventListener('processing-feedback', this._handleProcessingFeedback.bind(this))
    if (this._clickOutsideHandler) {
      document.removeEventListener('click', this._clickOutsideHandler)
    }
  }

  async reloadFile(file) {
    this.file = file
    this.currentQueue = file.queue_name
  }

  async _handleProcessingFeedback(e) {
    const { feedback } = e.detail
    await this._handleFeedback(feedback)
  }

  async _handleFeedback(currentFile, feedback) {
    try {
      const result = await window.fileManager.updateRevisionFeedback(
        currentFile.dbPath,
        currentFile.library_id,
        currentFile.relative_path,
        feedback
      )

      if (result.success) {
        // Notify revision list to refresh its data
        const revisionListElement = document.querySelector('revision-list')
        if (revisionListElement) {
          await revisionListElement.refreshFileList()
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
    const clampedRank = Math.max(1, Math.min(100, Math.round(newRank)))

    try {
      const result = await window.fileManager.updateFileRank(
        this.file.file_path,
        this.file.library_id,
        clampedRank
      )

      if (result && result.success) {
        this.file.rank = clampedRank

        const revisionListElement = document.querySelector('revision-list')
        if (revisionListElement) {
          await revisionListElement.refreshFileList()
        }
        // Re-sort files by rank within the same day

        // Update current index
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
    try {
      const result = await window.fileManager.getFileQueue(
        this.file.file_path,
        this.file.library_id
      )
      if (result && result.queueName) {
        this.currentQueue = result.queueName
      }
    } catch (error) {
      console.error('Error loading current queue:', error)
    }
  }

  _getIntervalInfo(file) {
    const queue = this.currentQueue

    if (queue === 'processing') {
      return {
        type: 'rotation',
        value: file.rotation_interval || 3,
        label: 'Rotation',
        unit: 'days',
      }
    } else if (queue === 'intermediate') {
      return {
        type: 'intermediate',
        value: file.intermediate_interval || 7,
        label: 'Interval',
        unit: 'days',
      }
    } else if (queue && queue.startsWith('spaced-')) {
      return {
        type: 'spaced',
        interval: file.interval || 1,
        easiness: file.easiness ? file.easiness.toFixed(2) : '2.50',
        reviewCount: file.review_count || 0,
        label: 'SR',
        unit: 'days',
      }
    } else {
      return null
    }
  }

  async _handleIntervalChange(newInterval) {
    const clampedInterval = Math.max(1, Math.min(365, Math.round(newInterval)))

    try {
      let result
      if (this.currentQueue === 'intermediate') {
        result = await window.fileManager.updateIntermediateInterval(
          this.file.file_path,
          this.file.library_id,
          clampedInterval
        )
      } else if (this.currentQueue === 'processing') {
        result = await window.fileManager.updateRotationInterval(
          this.file.file_path,
          this.file.library_id,
          clampedInterval
        )
      }

      if (result && result.success) {
        // Update local data
        if (this.currentQueue === 'intermediate') {
          this.file.intermediate_interval = clampedInterval
        } else if (this.currentQueue === 'processing') {
          this.file.rotation_interval = clampedInterval
        }

        this.requestUpdate()
        this._showToast(`Interval updated to ${clampedInterval} days`)
      } else {
        this._showToast('Failed to update interval', true)
      }
    } catch (error) {
      console.error('Error updating interval:', error)
      this._showToast('Error updating interval', true)
    }
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
  async _handleDropdownSelect(event) {
    const newQueue = event.detail.item.value
    if (!newQueue || newQueue === this.currentQueue) {
      return
    }

    try {
      const result = await window.fileManager.moveFileToQueue(
        this.file.file_path,
        this.file.library_id,
        newQueue
      )

      if (result && result.success) {
        this.currentQueue = newQueue
        this.requestUpdate()
      } else {
        this._showToast(`Failed to move to ${newQueue} queue`, true)
      }
    } catch (error) {
      console.error('Error changing queue:', error)
      this._showToast('Error changing queue', true)
    }
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
    if (!window.mode.revision || !this.file) {
      return html``
    }

    const fileName = this.file.file_path.split('/').pop()
    const workspaceName = this.file.workspacePath
      ? this.file.workspacePath.split('/').pop()
      : 'Unknown'
    const rank = Math.round(this.file.rank || 70)

    // Get interval info based on queue
    const intervalInfo = this._getIntervalInfo(this.file)

    // Calculate order number within the same day

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
            ${intervalInfo
              ? html`
                  <span class="file-meta-separator">•</span>
                  <span class="file-meta-item interval-control" title="Review interval">
                    <span class="meta-icon">⏱️</span>
                    ${intervalInfo.type === 'spaced'
                      ? html`
                          <span class="interval-display">
                            <span title="Current interval">${intervalInfo.interval}d</span>
                            <span class="interval-separator">|</span>
                            <span title="Easiness factor">EF:${intervalInfo.easiness}</span>
                            <span class="interval-separator">|</span>
                            <span title="Review count">×${intervalInfo.reviewCount}</span>
                          </span>
                        `
                      : html`
                          <button
                            class="rank-btn rank-decrease"
                            @click=${() => this._handleIntervalChange(intervalInfo.value - 1)}
                            title="Decrease interval"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            class="rank-input"
                            .value=${intervalInfo.value}
                            min="1"
                            max="365"
                            @change=${(e) => this._handleIntervalChange(parseInt(e.target.value))}
                            @click=${(e) => e.stopPropagation()}
                            title="Enter interval in days"
                          />
                          <button
                            class="rank-btn rank-increase"
                            @click=${() => this._handleIntervalChange(intervalInfo.value + 1)}
                            title="Increase interval"
                          >
                            +
                          </button>
                          <span class="interval-unit">${intervalInfo.unit}</span>
                        `}
                  </span>
                `
              : ''}
            ${this.currentQueue
              ? html`
                  <span class="file-meta-separator">•</span>
                  <div>
                    <sl-dropdown @sl-select=${this._handleDropdownSelect}>
                      <sl-button slot="trigger" caret size="small">
                        <span class="meta-icon">📂</span>
                        <span class="queue-badge ${this.currentQueue}"
                          >${this._getQueueDisplayName(this.currentQueue)}</span
                        >
                      </sl-button>
                      <sl-menu>
                        <queue-menu .currentQueue=${this.currentQueue}></queue-menu>
                      </sl-menu>
                    </sl-dropdown>
                  </div>
                `
              : ''}
          </div>
        </div>
      </div>
      ${this.currentQueue === 'processing' || this.currentQueue === 'new'
        ? html`<processing-feedback-bar></processing-feedback-bar>`
        : this.currentQueue === 'intermediate'
          ? html`
              <div class="feedback-buttons">
                <button
                  class="feedback-btn decrease"
                  @click=${() => this._handleFeedback('decrease')}
                  title="Review more frequently (interval ÷1.5)"
                >
                  More Often
                </button>
                <button
                  class="feedback-btn maintain"
                  @click=${() => this._handleFeedback('maintain')}
                  title="Keep same review interval"
                >
                  Same
                </button>
                <button
                  class="feedback-btn increase"
                  @click=${() => this._handleFeedback('increase')}
                  title="Review less frequently (interval ×1.5)"
                >
                  Less Often
                </button>
              </div>
            `
          : html`
              <div class="feedback-buttons">
                <button class="feedback-btn again" @click=${() => this._handleFeedback('again')}>
                  Again
                </button>
                <button class="feedback-btn hard" @click=${() => this._handleFeedback('hard')}>
                  Hard
                </button>
                <button class="feedback-btn good" @click=${() => this._handleFeedback('good')}>
                  Good
                </button>
                <button class="feedback-btn easy" @click=${() => this._handleFeedback('easy')}>
                  Easy
                </button>
              </div>
            `}
    `
  }
}

customElements.define('feedback-bar', FeedbackBar)
