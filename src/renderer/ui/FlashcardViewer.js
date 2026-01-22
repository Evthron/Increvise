// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

/* global customElements */

// Flashcard Viewer Web Component
// Displays flashcards with cloze deletion

import { LitElement, html, css } from 'lit'

export class FlashcardViewer extends LitElement {
  static properties = {
    parentContent: { type: String, state: true },
    answerText: { type: String, state: true },
    charStart: { type: Number, state: true },
    charEnd: { type: Number, state: true },
    showAnswer: { type: Boolean, state: true },
    isLoading: { type: Boolean, state: true },
  }

  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      overflow: auto;
      background: var(--editor-bg, #fff);
      padding: 2rem;
    }

    .flashcard-container {
      max-width: 800px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 2rem;
    }

    .question-section {
      background: var(--bg-primary, #fff);
      border: 2px solid var(--border-color, #ddd);
      border-radius: 8px;
      padding: 2rem;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    .question-label {
      font-size: 0.875rem;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--text-muted, #666);
      margin-bottom: 1rem;
      letter-spacing: 0.5px;
    }

    .question-content {
      font-size: 1.125rem;
      line-height: 1.8;
      color: var(--text-primary, #333);
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    .cloze-blank {
      display: inline-block;
      min-width: 100px;
      padding: 0 0.5rem;
      border-bottom: 2px solid var(--accent-color, #007aff);
      color: transparent;
      background: linear-gradient(to right, rgba(0, 122, 255, 0.1), rgba(0, 122, 255, 0.05));
      user-select: none;
    }

    .answer-section {
      background: var(--bg-primary, #fff);
      border: 2px solid var(--border-color, #ddd);
      border-radius: 8px;
      padding: 2rem;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    .answer-label {
      font-size: 0.875rem;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--text-muted, #666);
      margin-bottom: 1rem;
      letter-spacing: 0.5px;
    }

    .answer-content {
      font-size: 1.125rem;
      line-height: 1.8;
      color: var(--text-primary, #333);
      white-space: pre-wrap;
      word-wrap: break-word;
      padding: 1rem;
      background: rgba(52, 199, 89, 0.1);
      border-left: 4px solid #34c759;
      border-radius: 4px;
    }

    .answer-hidden {
      text-align: center;
      padding: 2rem;
    }

    .show-answer-btn {
      padding: 1rem 2rem;
      font-size: 1rem;
      font-weight: 600;
      background: linear-gradient(135deg, #007aff 0%, #0051d5 100%);
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0, 122, 255, 0.3);
      transition: all 0.2s ease;
    }

    .show-answer-btn:hover {
      background: linear-gradient(135deg, #0051d5 0%, #0040a8 100%);
      box-shadow: 0 4px 12px rgba(0, 122, 255, 0.4);
      transform: translateY(-1px);
    }

    .show-answer-btn:active {
      transform: translateY(0);
    }

    .loading {
      text-align: center;
      padding: 4rem;
      color: var(--text-muted, #666);
      font-size: 1rem;
    }

    .error {
      text-align: center;
      padding: 2rem;
      color: #d32f2f;
      background: #ffebee;
      border-radius: 8px;
      margin: 2rem 0;
    }
  `

  constructor() {
    super()
    this.parentContent = ''
    this.answerText = ''
    this.charStart = 0
    this.charEnd = 0
    this.showAnswer = false
    this.isLoading = false
  }

  /**
   * Load flashcard content from parent file and database
   * @param {string} flashcardPath - Path to flashcard file
   * @param {Object} extractInfo - Extract info from database
   */
  async loadFlashcard(flashcardPath, extractInfo) {
    console.log('[FlashcardViewer] loadFlashcard called:', {
      flashcardPath,
      extractInfo,
    })

    this.isLoading = true
    this.showAnswer = false
    this.requestUpdate()

    try {
      const { parentPath, rangeStart, rangeEnd } = extractInfo

      // Convert character positions
      this.charStart = parseInt(rangeStart)
      this.charEnd = parseInt(rangeEnd)

      console.log('[FlashcardViewer] Character positions:', {
        charStart: this.charStart,
        charEnd: this.charEnd,
      })

      // Construct absolute parent path
      let absoluteParentPath = parentPath
      if (!parentPath.startsWith('/') && window.currentRootPath) {
        absoluteParentPath = `${window.currentRootPath}/${parentPath}`
      }

      console.log('[FlashcardViewer] Reading parent file:', absoluteParentPath)

      // Read parent file content
      const result = await window.fileManager.readFile(absoluteParentPath)
      if (!result.success) {
        throw new Error(`Failed to read parent file: ${result.error}`)
      }

      this.parentContent = result.content

      console.log('[FlashcardViewer] Parent content loaded:', {
        contentLength: this.parentContent.length,
        contentPreview: this.parentContent.substring(0, 100) + '...',
      })

      // Extract answer text from parent content
      this.answerText = this.parentContent.substring(this.charStart, this.charEnd)

      console.log('[FlashcardViewer] Answer extracted:', {
        answerLength: this.answerText.length,
        answerPreview: this.answerText.substring(0, 50) + '...',
      })

      this.isLoading = false
      this.requestUpdate()

      console.log('[FlashcardViewer] ✓ Flashcard loaded successfully')
    } catch (error) {
      console.error('[FlashcardViewer] ✗ Error loading flashcard:', error)
      this.isLoading = false
      this.parentContent = ''
      this.answerText = `Error loading flashcard: ${error.message}`
      this.requestUpdate()
    }
  }

  /**
   * Toggle answer visibility
   */
  _toggleAnswer() {
    this.showAnswer = !this.showAnswer
  }

  /**
   * Render the question with cloze deletion
   */
  _renderQuestion() {
    if (!this.parentContent) return ''

    const before = this.parentContent.substring(0, this.charStart)
    const after = this.parentContent.substring(this.charEnd)

    // Create blank placeholder
    const blank = '_'.repeat(Math.max(10, Math.floor(this.answerText.length / 3)))

    return html`${before}<span class="cloze-blank">${blank}</span>${after}`
  }

  render() {
    if (this.isLoading) {
      return html`<div class="loading">Loading flashcard...</div>`
    }

    if (!this.parentContent) {
      return html`<div class="error">Failed to load flashcard content</div>`
    }

    return html`
      <div class="flashcard-container">
        <div class="question-section">
          <div class="question-label">Question (Cloze Deletion)</div>
          <div class="question-content">${this._renderQuestion()}</div>
        </div>

        <div class="answer-section">
          <div class="answer-label">Answer</div>
          ${this.showAnswer
            ? html`<div class="answer-content">${this.answerText}</div>`
            : html`
                <div class="answer-hidden">
                  <button class="show-answer-btn" @click=${this._toggleAnswer}>Show Answer</button>
                </div>
              `}
        </div>
      </div>
    `
  }
}

customElements.define('flashcard-viewer', FlashcardViewer)
