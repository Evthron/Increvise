// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Feedback Bar Lit component
// Manages revision workflow state and feedback controls

import { LitElement, html, css } from 'lit'
import './QueueMenu.js'

export class FeedbackFileHeader extends LitElement {
  static properties = {
    fileName: { type: String },
    workspaceName: { type: String },
  }

  static styles = css`
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
  `

  render() {
    return html`
      <div class="current-file-header">
        <div class="current-file-title">${this.fileName}</div>
        <div class="current-file-meta">
          <span class="file-meta-item">
            <span class="meta-icon">📁</span>
            <span>${this.workspaceName}</span>
          </span>
          <slot></slot>
        </div>
      </div>
    `
  }
}
customElements.define('feedback-file-header', FeedbackFileHeader)

export class FeedbackRankControl extends LitElement {
  static properties = {
    rank: { type: Number },
  }

  static styles = css`
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
    .meta-icon {
      font-size: 13px;
    }
  `

  render() {
    return html`
      <span class="rank-control" title="Priority rank (1-100)">
        <span class="meta-icon">⭐</span>
        <button
          class="rank-btn rank-decrease"
          @click=${() =>
            this.dispatchEvent(new CustomEvent('rank-change', { detail: this.rank - 1 }))}
          title="Decrease rank"
        >
          −
        </button>
        <input
          type="number"
          class="rank-input"
          .value=${this.rank}
          min="1"
          max="100"
          @change=${(e) =>
            this.dispatchEvent(
              new CustomEvent('rank-change', { detail: parseInt(e.target.value) })
            )}
          @click=${(e) => e.stopPropagation()}
          title="Enter rank (1-100)"
        />
        <button
          class="rank-btn rank-increase"
          @click=${() =>
            this.dispatchEvent(new CustomEvent('rank-change', { detail: this.rank + 1 }))}
          title="Increase rank"
        >
          +
        </button>
      </span>
    `
  }
}
customElements.define('feedback-rank-control', FeedbackRankControl)

export class FeedbackIntervalControl extends LitElement {
  static properties = {
    intervalInfo: { type: Object },
  }

  static styles = css`
    .interval-control {
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
    .meta-icon {
      font-size: 13px;
    }
  `

  render() {
    if (!this.intervalInfo) return html``

    return html`
      <span class="interval-control" title="Review interval">
        <span class="meta-icon">⏱️</span>
        ${this.intervalInfo.type === 'spaced'
          ? html`
              <span class="interval-display">
                <span title="Current interval">${this.intervalInfo.interval}d</span>
                <span class="interval-separator">|</span>
                <span title="Easiness factor">EF:${this.intervalInfo.easiness}</span>
                <span class="interval-separator">|</span>
                <span title="Review count">×${this.intervalInfo.reviewCount}</span>
              </span>
            `
          : html`
              <button
                class="rank-btn rank-decrease"
                @click=${() =>
                  this.dispatchEvent(
                    new CustomEvent('interval-change', { detail: this.intervalInfo.value - 1 })
                  )}
                title="Decrease interval"
              >
                −
              </button>
              <input
                type="number"
                class="rank-input"
                .value=${this.intervalInfo.value}
                min="1"
                max="365"
                @change=${(e) =>
                  this.dispatchEvent(
                    new CustomEvent('interval-change', { detail: parseInt(e.target.value) })
                  )}
                @click=${(e) => e.stopPropagation()}
                title="Enter interval in days"
              />
              <button
                class="rank-btn rank-increase"
                @click=${() =>
                  this.dispatchEvent(
                    new CustomEvent('interval-change', { detail: this.intervalInfo.value + 1 })
                  )}
                title="Increase interval"
              >
                +
              </button>
              <span class="interval-unit">${this.intervalInfo.unit}</span>
            `}
      </span>
    `
  }
}
customElements.define('feedback-interval-control', FeedbackIntervalControl)

export class FeedbackQueueControl extends LitElement {
  static properties = {
    currentQueue: { type: String },
  }

  static styles = css`
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
    .meta-icon {
      font-size: 13px;
    }
  `

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

  render() {
    return html`
      <sl-dropdown
        @sl-select=${(e) =>
          this.dispatchEvent(new CustomEvent('queue-select', { detail: e.detail }))}
      >
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
    `
  }
}
customElements.define('feedback-queue-control', FeedbackQueueControl)

export class ProcessingFeedbackBar extends LitElement {
  static properties = {
    disabled: { type: Boolean },
  }

  static styles = css`
    :host {
      display: block;
      width: 100%;
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

    .feedback-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
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

    .feedback-btn.skip {
      background: linear-gradient(135deg, #ff9500 0%, #f57c00 100%);
    }

    .feedback-btn.skip:hover:not(:disabled) {
      background: linear-gradient(135deg, #e68600 0%, #ef6c00 100%);
      box-shadow: 0 4px 8px rgba(255, 149, 0, 0.3);
      transform: translateY(-1px);
    }

    .feedback-btn.viewed {
      background: linear-gradient(135deg, #34c759 0%, #2db34a 100%);
    }

    .feedback-btn.viewed:hover:not(:disabled) {
      background: linear-gradient(135deg, #2db34a 0%, #28a745 100%);
      box-shadow: 0 4px 8px rgba(52, 199, 89, 0.3);
      transform: translateY(-1px);
    }

    .button-label {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }

    .button-main {
      font-size: 14px;
      font-weight: 700;
    }

    .button-sub {
      font-size: 11px;
      opacity: 0.9;
      font-weight: 400;
    }
  `

  constructor() {
    super()
    this.disabled = false
  }

  _handleSkip() {
    if (this.disabled) return
    this.dispatchEvent(
      new CustomEvent('processing-feedback', {
        detail: { feedback: 'skip' },
        bubbles: true,
        composed: true,
      })
    )
  }

  _handleViewed() {
    if (this.disabled) return
    this.dispatchEvent(
      new CustomEvent('processing-feedback', {
        detail: { feedback: 'viewed' },
        bubbles: true,
        composed: true,
      })
    )
  }

  render() {
    return html`
      <div class="feedback-buttons">
        <button
          class="feedback-btn skip"
          @click=${this._handleSkip}
          ?disabled=${this.disabled}
          title="Skip this file, review again tomorrow"
        >
          <div class="button-label">
            <span class="button-main">Skip</span>
          </div>
        </button>
        <button
          class="feedback-btn viewed"
          @click=${this._handleViewed}
          ?disabled=${this.disabled}
          title="Mark as viewed, review in rotation cycle"
        >
          <div class="button-label">
            <span class="button-main">Viewed</span>
          </div>
        </button>
      </div>
    `
  }
}

customElements.define('processing-feedback-bar', ProcessingFeedbackBar)

export class FeedbackButtons extends LitElement {
  static properties = {
    currentQueue: { type: String },
  }

  static styles = css`
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

  render() {
    if (this.currentQueue === 'processing' || this.currentQueue === 'new') {
      return html`<processing-feedback-bar></processing-feedback-bar>`
    }

    if (this.currentQueue === 'intermediate') {
      return html`
        <div class="feedback-buttons">
          <button
            class="feedback-btn decrease"
            @click=${() => this.dispatchEvent(new CustomEvent('feedback', { detail: 'decrease' }))}
            title="Review more frequently (interval ÷1.5)"
          >
            More Often
          </button>
          <button
            class="feedback-btn maintain"
            @click=${() => this.dispatchEvent(new CustomEvent('feedback', { detail: 'maintain' }))}
            title="Keep same review interval"
          >
            Same
          </button>
          <button
            class="feedback-btn increase"
            @click=${() => this.dispatchEvent(new CustomEvent('feedback', { detail: 'increase' }))}
            title="Review less frequently (interval ×1.5)"
          >
            Less Often
          </button>
        </div>
      `
    }

    return html`
      <div class="feedback-buttons">
        <button
          class="feedback-btn again"
          @click=${() => this.dispatchEvent(new CustomEvent('feedback', { detail: 'again' }))}
        >
          Again
        </button>
        <button
          class="feedback-btn hard"
          @click=${() => this.dispatchEvent(new CustomEvent('feedback', { detail: 'hard' }))}
        >
          Hard
        </button>
        <button
          class="feedback-btn good"
          @click=${() => this.dispatchEvent(new CustomEvent('feedback', { detail: 'good' }))}
        >
          Good
        </button>
        <button
          class="feedback-btn easy"
          @click=${() => this.dispatchEvent(new CustomEvent('feedback', { detail: 'easy' }))}
        >
          Easy
        </button>
      </div>
    `
  }
}
customElements.define('feedback-buttons', FeedbackButtons)

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

    .file-meta-separator {
      color: var(--border-color);
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

  async _handleFeedback(feedback) {
    if (!this.file) {
      console.error('No file loaded')
      return
    }

    try {
      const result = await window.fileManager.updateRevisionFeedback(
        this.file.dbPath,
        this.file.library_id,
        this.file.relative_path,
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
    } else {
      return {
        type: 'spaced',
        interval: file.interval || 1,
        easiness: file.easiness ? file.easiness.toFixed(2) : '2.50',
        reviewCount: file.review_count || 0,
        label: 'SR',
        unit: 'days',
      }
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
    const intervalInfo = this._getIntervalInfo(this.file)

    this.setAttribute('visible', '')

    return html`
      <div id="current-file-name">
        <feedback-file-header .fileName=${fileName} .workspaceName=${workspaceName}>
          <span class="file-meta-separator">•</span>
          <feedback-rank-control
            .rank=${rank}
            @rank-change=${(e) => this._handleRankChange(e.detail)}
          ></feedback-rank-control>
          <span class="file-meta-separator">•</span>
          <feedback-interval-control
            .intervalInfo=${intervalInfo}
            @interval-change=${(e) => this._handleIntervalChange(e.detail)}
          ></feedback-interval-control>
          <span class="file-meta-separator">•</span>
          <feedback-queue-control
            .currentQueue=${this.currentQueue}
            @queue-select=${this._handleDropdownSelect}
          ></feedback-queue-control>
        </feedback-file-header>
      </div>
      <feedback-buttons
        .currentQueue=${this.currentQueue}
        @feedback=${(e) => this._handleFeedback(e.detail)}
      ></feedback-buttons>
    `
  }
}

customElements.define('feedback-bar', FeedbackBar)
