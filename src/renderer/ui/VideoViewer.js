// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { LitElement, html, css } from 'lit'

export class videoOptions {
  constructor({ timeStart = null, timeEnd = null, extractedRanges = [] } = {}) {
    // Time range restriction - start time in seconds
    this.timeStart = timeStart
    // Time range restriction - end time in seconds
    this.timeEnd = timeEnd
    // Already extracted time ranges - Array<{start: number, end: number, notePath: string}>
    this.extractedRanges = extractedRanges
  }
}

// ============================================================================
// VideoToolbar Component
// ============================================================================
class VideoToolbar extends LitElement {
  static properties = {
    currentTime: { type: Number },
    duration: { type: Number },
    isPlaying: { type: Boolean },
    volume: { type: Number },
    playbackRate: { type: Number },
    startTime: { type: String },
    endTime: { type: String },
    restrictedRange: { type: Object },
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: #2e3338;
      border-bottom: 1px solid #1a1d20;
      flex-shrink: 0;
    }

    .toolbar-row {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    button {
      padding: 0.25rem 0.75rem;
      background: #3d4449;
      color: #e0e0e0;
      border: 1px solid #1a1d20;
      border-radius: 3px;
      cursor: pointer;
      font-size: 0.875rem;
    }

    button:hover:not(:disabled) {
      background: #4a5055;
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .time-display {
      color: #e0e0e0;
      font-size: 0.875rem;
      min-width: 100px;
    }

    .progress-container {
      flex: 1;
      height: 8px;
      background: #1a1d20;
      border-radius: 4px;
      position: relative;
      cursor: pointer;
    }

    .progress-bar {
      height: 100%;
      background: #3b82f6;
      border-radius: 4px;
      transition: width 0.1s;
    }

    .extracted-marker {
      position: absolute;
      height: 100%;
      background: rgba(74, 222, 128, 0.5);
      border-left: 2px solid #4ade80;
      border-right: 2px solid #4ade80;
    }

    .volume-slider,
    .playback-select {
      background: #3d4449;
      color: #e0e0e0;
      border: 1px solid #1a1d20;
      border-radius: 3px;
      padding: 0.25rem;
    }

    .time-input-group {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .time-input-group label {
      color: #b0b0b0;
      font-size: 0.875rem;
    }

    .time-input {
      width: 80px;
      padding: 0.25rem 0.5rem;
      background: #3d4449;
      color: #e0e0e0;
      border: 1px solid #1a1d20;
      border-radius: 3px;
      font-size: 0.875rem;
    }
  `

  handlePlayPause() {
    this.dispatchEvent(new CustomEvent('play-pause'))
  }

  handleProgressClick(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const percent = (e.clientX - rect.left) / rect.width
    this.dispatchEvent(new CustomEvent('seek', { detail: { percent } }))
  }

  handleVolumeChange(e) {
    this.dispatchEvent(new CustomEvent('volume-change', { detail: { volume: e.target.value } }))
  }

  handlePlaybackRateChange(e) {
    this.dispatchEvent(
      new CustomEvent('playback-rate-change', { detail: { rate: parseFloat(e.target.value) } })
    )
  }

  handleRecordStart() {
    this.dispatchEvent(new CustomEvent('record-start'))
  }

  handleRecordEnd() {
    this.dispatchEvent(new CustomEvent('record-end'))
  }

  handleStartTimeChange(e) {
    this.dispatchEvent(new CustomEvent('start-time-change', { detail: { value: e.target.value } }))
  }

  handleEndTimeChange(e) {
    this.dispatchEvent(new CustomEvent('end-time-change', { detail: { value: e.target.value } }))
  }

  formatTime(seconds) {
    if (!isFinite(seconds)) return '00:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  render() {
    const progress = this.duration ? (this.currentTime / this.duration) * 100 : 0

    return html`
      <div class="toolbar-row">
        <button @click=${this.handlePlayPause}>${this.isPlaying ? '⏸️' : '▶️'}</button>
        <span class="time-display"
          >${this.formatTime(this.currentTime)} / ${this.formatTime(this.duration)}</span
        >
        <div class="progress-container" @click=${this.handleProgressClick}>
          ${this.restrictedRange
            ? ''
            : this.extractedRanges?.map(
                (range) => html`
                  <div
                    class="extracted-marker"
                    style="left: ${(range.start / this.duration) * 100}%; width: ${((range.end -
                      range.start) /
                      this.duration) *
                    100}%"
                  ></div>
                `
              )}
          <div class="progress-bar" style="width: ${progress}%"></div>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          .value=${this.volume}
          @input=${this.handleVolumeChange}
          class="volume-slider"
          title="Volume"
        />
        <select
          class="playback-select"
          .value=${this.playbackRate}
          @change=${this.handlePlaybackRateChange}
        >
          <option value="0.5">0.5x</option>
          <option value="0.75">0.75x</option>
          <option value="1">1x</option>
          <option value="1.25">1.25x</option>
          <option value="1.5">1.5x</option>
          <option value="2">2x</option>
        </select>
      </div>

      <div class="toolbar-row">
        <div class="time-input-group">
          <label>Start:</label>
          <input
            type="text"
            class="time-input"
            placeholder="00:00:00"
            .value=${this.startTime}
            @input=${this.handleStartTimeChange}
          />
          <button @click=${this.handleRecordStart}>Start</button>
        </div>
        <div class="time-input-group">
          <label>End:</label>
          <input
            type="text"
            class="time-input"
            placeholder="00:00:00"
            .value=${this.endTime}
            @input=${this.handleEndTimeChange}
          />
          <button @click=${this.handleRecordEnd}>End</button>
        </div>
      </div>
    `
  }
}

// ============================================================================
// VideoPlayer Component
// ============================================================================
class VideoPlayer extends LitElement {
  static properties = {
    videoPath: { type: String },
    restrictedRange: { type: Object },
  }

  static styles = css`
    :host {
      flex: 1;
      overflow: auto;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 2rem;
      background: #525659;
    }

    video {
      max-width: 100%;
      max-height: 100%;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }
  `

  firstUpdated() {
    this.videoElement = this.shadowRoot.querySelector('video')
    if (this.videoElement) {
      this.videoElement.addEventListener('loadedmetadata', () => {
        this.handleMetadataLoaded()
      })
      this.videoElement.addEventListener('timeupdate', () => {
        this.handleTimeUpdate()
      })
      this.videoElement.addEventListener('ended', () => {
        this.dispatchEvent(new CustomEvent('video-ended'))
      })
    }
  }

  handleMetadataLoaded() {
    // If we have a restricted range, seek to the start
    if (
      this.restrictedRange &&
      this.restrictedRange.start !== null &&
      this.restrictedRange.start !== undefined
    ) {
      console.log('Video metadata loaded, seeking to:', this.restrictedRange.start)
      this.videoElement.currentTime = this.restrictedRange.start
    }
    this.dispatchEvent(new CustomEvent('metadata-loaded'))
  }

  handleTimeUpdate() {
    if (!this.videoElement) return

    const currentTime = this.videoElement.currentTime
    this.dispatchEvent(new CustomEvent('time-update', { detail: { currentTime } }))

    // Check if we've reached the end of the restricted range
    if (this.restrictedRange && this.restrictedRange.end !== null) {
      // currentTime is already the actual time in the video
      if (currentTime >= this.restrictedRange.end) {
        this.videoElement.pause()
        this.dispatchEvent(new CustomEvent('range-ended'))
      }
    }
  }

  play() {
    this.videoElement?.play()
  }

  pause() {
    this.videoElement?.pause()
  }

  seek(time) {
    if (this.videoElement) {
      this.videoElement.currentTime = time
    }
  }

  setVolume(volume) {
    if (this.videoElement) {
      this.videoElement.volume = volume
    }
  }

  setPlaybackRate(rate) {
    if (this.videoElement) {
      this.videoElement.playbackRate = rate
    }
  }

  getCurrentTime() {
    return this.videoElement?.currentTime || 0
  }

  getDuration() {
    return this.videoElement?.duration || 0
  }

  isPaused() {
    return this.videoElement?.paused ?? true
  }

  render() {
    return html`<video src=${this.videoPath} controls></video>`
  }
}

// ============================================================================
// VideoViewer Main Component
// ============================================================================
export class VideoViewer extends LitElement {
  static properties = {
    currentTime: { type: Number },
    duration: { type: Number },
    isPlaying: { type: Boolean },
    volume: { type: Number },
    playbackRate: { type: Number },
    startTime: { type: String },
    endTime: { type: String },
    isLoading: { type: Boolean },
    errorMessage: { type: String },
    restrictedRange: { type: Object },
    extractedRanges: { type: Array },
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      background: #525659;
    }

    .loading-message,
    .error-message {
      color: #e0e0e0;
      text-align: center;
      padding: 2rem;
    }

    .error-message {
      color: #ff6b6b;
    }
  `

  constructor() {
    super()
    this.videoPath = ''
    this.currentTime = 0
    this.duration = 0
    this.isPlaying = false
    this.volume = 1
    this.playbackRate = 1
    this.startTime = ''
    this.endTime = ''
    this.isLoading = false
    this.errorMessage = ''
    this.restrictedRange = null
    this.extractedRanges = []
  }

  /**
   * Load a video file with optional configuration
   * @param {string} filePath - Path to the video file
   * @param {videoOptions} options - Configuration options
   */
  async loadVideo(filePath, options = {}) {
    try {
      this.isLoading = true
      this.errorMessage = ''
      this.videoPath = filePath

      // Apply options
      this.applyOptions(options)

      // Wait for video to load
      await this.updateComplete

      this.isLoading = false
    } catch (error) {
      console.error('Error loading video:', error)
      this.errorMessage = `Failed to load video: ${error.message}`
      this.isLoading = false
    }
  }

  applyOptions(options) {
    this.restrictedRange = null
    this.extractedRanges = []

    if (
      options.timeStart !== null &&
      options.timeStart !== undefined &&
      options.timeEnd !== null &&
      options.timeEnd !== undefined
    ) {
      this.restrictedRange = { start: options.timeStart, end: options.timeEnd }
      console.log('Applied restricted range:', this.restrictedRange)
    }

    this.extractedRanges = options.extractedRanges || []
  }

  handleMetadataLoaded() {
    const player = this.shadowRoot.querySelector('video-player')
    if (player) {
      this.duration = this.restrictedRange
        ? this.restrictedRange.end - this.restrictedRange.start
        : player.getDuration()
    }
  }

  handleTimeUpdate(e) {
    const actualTime = e.detail.currentTime
    // If we have a restricted range, display relative time (from 0)
    // Otherwise display actual time
    this.currentTime = this.restrictedRange
      ? Math.max(0, actualTime - this.restrictedRange.start)
      : actualTime

    const player = this.shadowRoot.querySelector('video-player')
    if (player) {
      this.isPlaying = !player.isPaused()
    }
  }

  handlePlayPause() {
    const player = this.shadowRoot.querySelector('video-player')
    if (player) {
      if (player.isPaused()) {
        player.play()
      } else {
        player.pause()
      }
    }
  }

  handleSeek(e) {
    const player = this.shadowRoot.querySelector('video-player')
    if (player) {
      const targetTime = e.detail.percent * this.duration
      const actualTime = this.restrictedRange ? this.restrictedRange.start + targetTime : targetTime
      player.seek(actualTime)
    }
  }

  handleVolumeChange(e) {
    this.volume = parseFloat(e.detail.volume)
    const player = this.shadowRoot.querySelector('video-player')
    if (player) {
      player.setVolume(this.volume)
    }
  }

  handlePlaybackRateChange(e) {
    this.playbackRate = e.detail.rate
    const player = this.shadowRoot.querySelector('video-player')
    if (player) {
      player.setPlaybackRate(this.playbackRate)
    }
  }

  handleRecordStart() {
    const player = this.shadowRoot.querySelector('video-player')
    if (player) {
      const time = player.getCurrentTime()
      this.startTime = this.formatTimeInput(time)
    }
  }

  handleRecordEnd() {
    const player = this.shadowRoot.querySelector('video-player')
    if (player) {
      const time = player.getCurrentTime()
      this.endTime = this.formatTimeInput(time)
    }
  }

  handleStartTimeChange(e) {
    this.startTime = e.detail.value
  }

  handleEndTimeChange(e) {
    this.endTime = e.detail.value
  }

  formatTimeInput(seconds) {
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  parseTimeInput(timeString) {
    const parts = timeString.split(':').map((p) => parseInt(p) || 0)
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2]
    } else if (parts.length === 2) {
      return parts[0] * 60 + parts[1]
    }
    return 0
  }

  getSelectedTimeRange() {
    const start = this.parseTimeInput(this.startTime)
    const end = this.parseTimeInput(this.endTime)

    if (start >= end || end === 0) {
      return null
    }

    return { start, end }
  }

  getCurrentVideoPath() {
    return this.videoPath
  }

  resetView() {
    this.videoPath = ''
    this.currentTime = 0
    this.duration = 0
    this.isPlaying = false
    this.startTime = ''
    this.endTime = ''
    this.restrictedRange = null
    this.extractedRanges = []
  }

  render() {
    if (this.isLoading) {
      return html`<div class="loading-message">Loading video...</div>`
    }

    if (this.errorMessage) {
      return html`<div class="error-message">${this.errorMessage}</div>`
    }

    if (!this.videoPath) {
      return html`<div class="loading-message">No video loaded</div>`
    }

    return html`
      <video-toolbar
        .currentTime=${this.currentTime}
        .duration=${this.duration}
        .isPlaying=${this.isPlaying}
        .volume=${this.volume}
        .playbackRate=${this.playbackRate}
        .startTime=${this.startTime}
        .endTime=${this.endTime}
        .restrictedRange=${this.restrictedRange}
        .extractedRanges=${this.extractedRanges}
        @play-pause=${this.handlePlayPause}
        @seek=${this.handleSeek}
        @volume-change=${this.handleVolumeChange}
        @playback-rate-change=${this.handlePlaybackRateChange}
        @record-start=${this.handleRecordStart}
        @record-end=${this.handleRecordEnd}
        @start-time-change=${this.handleStartTimeChange}
        @end-time-change=${this.handleEndTimeChange}
      ></video-toolbar>

      <video-player
        .videoPath=${this.videoPath}
        .restrictedRange=${this.restrictedRange}
        @metadata-loaded=${this.handleMetadataLoaded}
        @time-update=${this.handleTimeUpdate}
        @range-ended=${() => (this.isPlaying = false)}
      ></video-player>
    `
  }
}

// Register custom elements
customElements.define('video-toolbar', VideoToolbar)
customElements.define('video-player', VideoPlayer)
customElements.define('video-viewer', VideoViewer)
