// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { LitElement, html, css } from 'lit'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { TextLayer, setLayerDimensions } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { marked } from 'marked'
// Configure PDF.js worker for Electron
const workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).toString()
GlobalWorkerOptions.workerSrc = workerSrc

export class pdfOptions {
  constructor({
    pageStart = null,
    pageEnd = null,
    extractedPages = [],
    extractedLineRanges = new Map(),
  } = {}) {
    // Page range restriction - start page
    this.pageStart = pageStart
    // Page range restriction - end page
    this.pageEnd = pageEnd
    // Already extracted pages (whole page extracts) - Array<number>
    this.extractedPages = extractedPages
    // Already extracted line ranges (text extracts) - Map<pageNum, Array<{start, end, notePath}>>
    this.extractedLineRanges = extractedLineRanges
  }
}

// ============================================================================
// PdfToolbar Component
// ============================================================================
class PdfToolbar extends LitElement {
  static properties = {
    currentPage: { type: Number },
    totalPages: { type: Number },
    restrictedRange: { type: Object },
    scale: { type: Number },
    selectionMode: { type: String },
    selectedPages: { type: Array },
    selectedLineRange: { type: Object }, // { start, end } or null
  }

  static styles = css`
    :host {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.5rem 1rem;
      background: #2e3338;
      border-bottom: 1px solid #1a1d20;
      flex-shrink: 0;
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

    .page-info {
      color: #e0e0e0;
      font-size: 0.875rem;
    }

    .zoom-controls {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .zoom-controls span {
      color: #e0e0e0;
      font-size: 0.875rem;
      min-width: 3rem;
      text-align: center;
    }

    .selection-mode {
      display: flex;
      gap: 1rem;
      margin-left: auto;
    }

    .selection-mode label {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      color: #e0e0e0;
      font-size: 0.875rem;
      cursor: pointer;
    }

    .selected-pages-info {
      color: #3b82f6;
      font-size: 0.875rem;
      margin-left: 1rem;
    }
  `

  handlePrevPage() {
    this.dispatchEvent(new CustomEvent('page-prev'))
  }

  handleNextPage() {
    this.dispatchEvent(new CustomEvent('page-next'))
  }

  handleZoomIn() {
    this.dispatchEvent(new CustomEvent('zoom-in'))
  }

  handleZoomOut() {
    this.dispatchEvent(new CustomEvent('zoom-out'))
  }

  handleSelectionModeChange(e) {
    this.dispatchEvent(
      new CustomEvent('selection-mode-change', {
        detail: { mode: e.target.value },
      })
    )
  }

  handleOpenRangeDialog() {
    this.dispatchEvent(new CustomEvent('open-range-dialog'))
  }

  handleClearSelection() {
    this.dispatchEvent(new CustomEvent('clear-selection'))
  }

  handleClearLineSelection() {
    this.dispatchEvent(new CustomEvent('clear-line-selection'))
  }

  render() {
    const minPage = this.restrictedRange ? this.restrictedRange.start : 1
    const maxPage = this.restrictedRange ? this.restrictedRange.end : this.totalPages

    return html`
      <button @click=${this.handlePrevPage} ?disabled=${this.currentPage === minPage}>
        ← Prev
      </button>
      <span class="page-info">
        ${this.restrictedRange
          ? `Page ${this.currentPage} / ${this.restrictedRange.end} (of ${this.totalPages} total)`
          : `Page ${this.currentPage} / ${this.totalPages}`}
      </span>
      <button @click=${this.handleNextPage} ?disabled=${this.currentPage === maxPage}>
        Next →
      </button>

      <div class="zoom-controls">
        <button @click=${this.handleZoomOut} ?disabled=${this.scale <= 0.5}>-</button>
        <span>${Math.round(this.scale * 100)}%</span>
        <button @click=${this.handleZoomIn} ?disabled=${this.scale >= 3.0}>+</button>
      </div>

      <div class="selection-mode">
        <label>
          <input
            type="radio"
            name="mode"
            value="text"
            @change=${this.handleSelectionModeChange}
            ?checked=${this.selectionMode === 'text'}
          />
          Text Selection
        </label>
        <label>
          <input
            type="radio"
            name="mode"
            value="page"
            @change=${this.handleSelectionModeChange}
            ?checked=${this.selectionMode === 'page'}
          />
          Page Selection
        </label>
        ${this.selectionMode === 'text'
          ? html`
              ${this.selectedLineRange
                ? html`
                    <span class="selected-pages-info">
                      Selected: Lines ${this.selectedLineRange.start}-${this.selectedLineRange.end}
                    </span>
                    <button @click=${this.handleClearLineSelection}>Clear</button>
                  `
                : ''}
            `
          : ''}
        ${this.selectionMode === 'page'
          ? html`
              <button @click=${this.handleOpenRangeDialog}>Select Range</button>
              ${this.selectedPages.length > 0
                ? html`
                    <span class="selected-pages-info">
                      Selected: ${this.selectedPages.length} page(s)
                      (${Math.min(...this.selectedPages)}-${Math.max(...this.selectedPages)})
                    </span>
                    <button @click=${this.handleClearSelection}>Clear</button>
                  `
                : ''}
            `
          : ''}
      </div>
    `
  }
}

// ============================================================================
// PdfCanvas Component
// ============================================================================
class PdfCanvas extends LitElement {
  static properties = {
    pdfDocument: { type: Object },
    currentPage: { type: Number },
    scale: { type: Number },
    isPageSelected: { type: Boolean },
    selectedLineRange: { type: Object }, // { start, end } or null
    extractedLineRanges: { type: Array }, // Array<{start, end, notePath}>
    lineToNotePath: { type: Object }, // Map of line number to note path
    isExtracted: { type: Boolean },
    selectionMode: { type: String },
  }

  static styles = css`
    :host {
      flex: 1;
      overflow: auto;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      padding: 2rem;
    }

    .pdf-page-container {
      display: inline-flex;
      position: relative;
      background: white;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      margin-bottom: 1rem;
      /* CSS variables required by PDF.js for proper scaling */
      --scale-factor: 1;
      --user-unit: 1;
      --total-scale-factor: calc(var(--scale-factor) * var(--user-unit));
      --scale-round-x: 1px;
      --scale-round-y: 1px;
    }

    .pdf-canvas {
      display: block;
    }

    .text-layer {
      position: absolute;
      left: 0;
      top: 0;
      right: 0;
      bottom: 0;
      overflow: hidden;
      line-height: 1;
      text-align: initial;
      opacity: 1;
      transform-origin: 0 0;
      caret-color: black;
    }

    .text-layer :is(span, br) {
      color: transparent;
      position: absolute;
      white-space: pre;
      cursor: text;
      transform-origin: 0% 0%;
    }

    .text-layer ::selection {
      background: rgba(59, 130, 246, 0.3);
    }

    .text-layer br::selection {
      background: transparent;
    }

    .page-selection-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(59, 130, 246, 0.2);
      border: 2px solid #3b82f6;
      pointer-events: none;
    }

    .extracted-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
    }

    .page-extracted {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(42, 174, 64, 0.2);
      border: 2px solid #4ade80;
    }

    .text-layer span.extracted-line {
      background-color: rgba(255, 255, 0, 0.3);
    }

    .text-layer span.extracted-line.clickable {
      cursor: pointer;
    }

    .text-layer span.extracted-line.clickable:hover {
      background-color: rgba(255, 255, 0, 0.5);
    }

    .text-layer span.selected-line {
      background-color: rgba(59, 130, 246, 0.3);
    }

    .text-layer span.selected-line.clickable {
      cursor: pointer;
    }

    .text-layer span.selected-line.clickable:hover {
      background-color: rgba(59, 130, 246, 0.5);
    }
  `

  constructor() {
    super()
    this.currentRenderTask = null
    this._renderScheduled = null
    this.textLayer = null
    this.isDragging = false
    this.dragStartLine = null
    this.dragEndLine = null
    this.dragMode = null // 'select' or 'unselect'
    this._globalMouseUpHandler = this._handleMouseUp.bind(this)
    this.extractedLineRanges = []
    this.lineToNotePath = new Map()
  }

  connectedCallback() {
    super.connectedCallback()
    // Add global mouseup handler to catch mouseup outside text layer
    document.addEventListener('mouseup', this._globalMouseUpHandler)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    // Remove global mouseup handler
    document.removeEventListener('mouseup', this._globalMouseUpHandler)

    // Cancel any scheduled render
    if (this._renderScheduled) {
      cancelAnimationFrame(this._renderScheduled)
      this._renderScheduled = null
    }

    // Cancel any pending render task
    if (this.currentRenderTask) {
      this.currentRenderTask.cancel()
      this.currentRenderTask = null
    }

    // Cancel text layer rendering
    if (this.textLayer) {
      this.textLayer.cancel()
      this.textLayer = null
    }
  }

  /**
   * Lit lifecycle: responds to property changes
   */
  updated(changedProperties) {
    super.updated(changedProperties)

    // Check if only highlighting-related properties changed
    const highlightOnlyProps = ['selectedLineRange', 'extractedLineRanges', 'lineToNotePath']
    const pageRenderProps = ['pdfDocument', 'currentPage', 'scale', 'selectionMode']

    const needsPageRender = Array.from(changedProperties.keys()).some((key) =>
      pageRenderProps.includes(key)
    )
    const needsHighlightUpdate = Array.from(changedProperties.keys()).some((key) =>
      highlightOnlyProps.includes(key)
    )

    if (needsPageRender) {
      // Cancel any previously scheduled render
      if (this._renderScheduled) {
        cancelAnimationFrame(this._renderScheduled)
      }

      // Schedule full page render using requestAnimationFrame
      this._renderScheduled = requestAnimationFrame(() => {
        this._renderScheduled = null
        this._renderPage()
      })
    } else if (needsHighlightUpdate && this.selectionMode === 'text') {
      // Only update highlighting without re-rendering the page
      this._applyHighlighting()
    }
  }

  /**
   * Internal method: renders the current PDF page to canvas
   */
  async _renderPage() {
    if (!this.pdfDocument) {
      return
    }

    try {
      // Cancel any pending render
      if (this.currentRenderTask) {
        this.currentRenderTask.cancel()
        this.currentRenderTask = null
      }

      const page = await this.pdfDocument.getPage(this.currentPage)
      const viewport = page.getViewport({ scale: this.scale })

      // Access our own shadow DOM
      const canvas = this.shadowRoot.querySelector('.pdf-canvas')
      if (!canvas) {
        console.error('Canvas element not found in PdfCanvas shadow DOM')
        this.dispatchEvent(
          new CustomEvent('render-error', {
            detail: { error: 'Canvas not ready' },
          })
        )
        return
      }

      const context = canvas.getContext('2d')
      canvas.width = viewport.width
      canvas.height = viewport.height

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      }

      this.currentRenderTask = page.render(renderContext)
      await this.currentRenderTask.promise
      this.currentRenderTask = null

      // Render text layer for text selection (only in text mode)
      if (this.selectionMode === 'text') {
        await this._renderTextLayer(page, viewport)
      } else {
        // Clear text layer in page mode
        const textLayer = this.shadowRoot.querySelector('.text-layer')
        console.log('Clearing text layer for page selection mode')
        if (textLayer) {
          textLayer.innerHTML = ''
        }
      }

      page.cleanup()

      // Notify parent that render is complete
      this.dispatchEvent(new CustomEvent('render-complete'))
    } catch (error) {
      // Ignore cancellation errors
      if (error.name === 'RenderingCancelledException') {
        return
      }
      console.error('Error rendering page:', error)
      this.dispatchEvent(
        new CustomEvent('render-error', {
          detail: { error: error.message },
        })
      )
    }
  }

  /**
   * Render text layer for text selection
   */
  async _renderTextLayer(page, viewport) {
    const textLayerDiv = this.shadowRoot.querySelector('.text-layer')
    if (!textLayerDiv) return

    // Clear previous text layer
    textLayerDiv.innerHTML = ''

    // Set CSS variables for proper scaling
    // These variables are required by PDF.js for correct transform calculations
    const pageContainer = this.shadowRoot.querySelector('.pdf-page-container')
    if (pageContainer) {
      pageContainer.style.setProperty('--scale-factor', this.scale)
      pageContainer.style.setProperty('--user-unit', '1')
    }

    // Use setLayerDimensions to set proper dimensions with CSS variables
    setLayerDimensions(textLayerDiv, viewport)

    try {
      // Cancel previous text layer rendering
      if (this.textLayer) {
        this.textLayer.cancel()
        this.textLayer = null
      }

      const textContent = await page.getTextContent()

      // Need to stop rendering if the page doesn't have text content, otherwise the app's vertical dimension collapses
      if (textContent.items.length === 0) {
        console.warn('No text content available for this page')
        return
      }

      // Create new TextLayer instance
      this.textLayer = new TextLayer({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport: viewport,
      })

      // Render the text layer
      await this.textLayer.render()

      // After rendering, calculate line numbers and apply highlighting
      this._calculateLineNumbers()
      this._setupEventDelegation()
      this._applyHighlighting()
    } catch (error) {
      console.error('Error rendering text layer:', error)
    }
  }

  /**
   * Calculate line numbers only (called once when page loads)
   */
  _calculateLineNumbers() {
    const textLayerDiv = this.shadowRoot.querySelector('.text-layer')
    if (!textLayerDiv) return

    // Get all text spans and br elements
    const children = Array.from(textLayerDiv.children)
    let lineNumber = 1
    let currentLineSpans = []

    for (const child of children) {
      if (child.tagName === 'BR') {
        // Mark all spans in current line with their line number
        currentLineSpans.forEach((span) => {
          span.dataset.lineNumber = lineNumber
        })
        // Move to next line
        lineNumber++
        currentLineSpans = []
      } else if (child.tagName === 'SPAN') {
        currentLineSpans.push(child)
      }
    }

    // Handle last line (if no trailing <br>)
    if (currentLineSpans.length > 0) {
      currentLineSpans.forEach((span) => {
        span.dataset.lineNumber = lineNumber
      })
    }
  }

  /**
   * Setup event delegation for line interactions (called once when page loads)
   */
  _setupEventDelegation() {
    const textLayerDiv = this.shadowRoot.querySelector('.text-layer')
    if (!textLayerDiv) return

    // Check if already setup to avoid duplicate listeners
    if (textLayerDiv.dataset.eventDelegationSetup === 'true') return

    // Mark as setup
    textLayerDiv.dataset.eventDelegationSetup = 'true'

    // Disable text selection to prevent interference with line selection
    textLayerDiv.style.userSelect = 'none'

    // Use event delegation for all span events
    textLayerDiv.addEventListener('click', (e) => {
      const span = e.target.closest('span[data-line-number]')
      if (!span) return

      e.preventDefault()
      e.stopPropagation()

      const lineNumber = parseInt(span.dataset.lineNumber)
      this._handleLineClick(lineNumber)
    })

    textLayerDiv.addEventListener('mousedown', (e) => {
      const span = e.target.closest('span[data-line-number]')
      if (!span) return

      const lineNumber = parseInt(span.dataset.lineNumber)

      // Don't prevent default if this is a clickable extracted line
      const isExtractedLine = this._isLineExtracted(lineNumber)
      const hasNotePath = this.lineToNotePath.get(lineNumber)

      if (!(isExtractedLine && hasNotePath)) {
        e.preventDefault()
      }

      this._handleMouseDown(lineNumber)
    })

    textLayerDiv.addEventListener(
      'mouseenter',
      (e) => {
        const span = e.target.closest('span[data-line-number]')
        if (!span) return

        const lineNumber = parseInt(span.dataset.lineNumber)
        this._handleMouseEnter(lineNumber)
      },
      true
    ) // Use capture phase for mouseenter

    textLayerDiv.addEventListener('mouseup', () => {
      this._handleMouseUp()
    })
  }

  /**
   * Check if a line is within any extracted range
   * @param {number} lineNumber
   * @returns {boolean}
   */
  _isLineExtracted(lineNumber) {
    return this.extractedLineRanges.some(
      (range) => lineNumber >= range.start && lineNumber <= range.end
    )
  }

  /**
   * Apply highlighting to text layer (yellow=extracted, blue=selected)
   */
  _applyHighlighting() {
    const textLayerDiv = this.shadowRoot.querySelector('.text-layer')
    if (!textLayerDiv) return

    const spans = textLayerDiv.querySelectorAll('span[data-line-number]')

    spans.forEach((span) => {
      const lineNumber = parseInt(span.dataset.lineNumber)

      // Remove all previous highlighting classes
      span.classList.remove('extracted-line', 'selected-line', 'clickable')

      // Check if this line is extracted
      const isExtractedLine = this._isLineExtracted(lineNumber)

      // Apply highlighting if this line is extracted
      if (isExtractedLine) {
        span.classList.add('extracted-line')
        // Add clickable class if there's a note path for this line
        const notePath = this.lineToNotePath.get(lineNumber)
        if (notePath) {
          span.classList.add('clickable')
        }
      }

      // Apply selection highlighting if this line is in selected range
      const isInSelectedRange =
        this.selectedLineRange &&
        lineNumber >= this.selectedLineRange.start &&
        lineNumber <= this.selectedLineRange.end

      if (isInSelectedRange) {
        span.classList.add('selected-line')
      }
    })
  }

  /**
   * Handle mouse down - start drag selection
   */
  _handleMouseDown(lineNumber) {
    // Prevent selection on already-extracted lines (yellow highlights)
    if (this._isLineExtracted(lineNumber)) {
      return
    }

    // Check if clicking on a selected line
    const isInSelectedRange =
      this.selectedLineRange &&
      lineNumber >= this.selectedLineRange.start &&
      lineNumber <= this.selectedLineRange.end

    this.isDragging = true
    this.dragStartLine = lineNumber
    this.dragEndLine = lineNumber

    // Determine drag mode based on whether the line is in the selected range
    this.dragMode = isInSelectedRange ? 'unselect' : 'select'

    // If in select mode, clear the previous selection immediately
    if (this.dragMode === 'select') {
      this.dispatchEvent(
        new CustomEvent('clear-selection-immediate', {
          detail: { pageNum: this.currentPage },
        })
      )
    }

    // Update selection immediately
    this._updateDragSelection()
  }

  /**
   * Handle mouse enter - continue drag selection
   */
  _handleMouseEnter(lineNumber) {
    if (!this.isDragging) return

    // Skip if this line is extracted
    if (this._isLineExtracted(lineNumber)) return

    // Check if there are any extracted lines between dragStartLine and current lineNumber
    const minLine = Math.min(this.dragStartLine, lineNumber)
    const maxLine = Math.max(this.dragStartLine, lineNumber)

    // Check if any line in the range is extracted
    for (let line = minLine; line <= maxLine; line++) {
      if (this._isLineExtracted(line)) {
        // Found an extracted line in the path - don't extend selection
        return
      }
    }

    // Safe to extend selection
    this.dragEndLine = lineNumber
    this._updateDragSelection()
  }

  /**
   * Handle mouse up - end drag selection
   */
  _handleMouseUp() {
    if (this.isDragging) {
      this.isDragging = false
      // Finalize selection by dispatching to parent
      if (this.dragStartLine !== null && this.dragEndLine !== null) {
        const minLine = Math.min(this.dragStartLine, this.dragEndLine)
        const maxLine = Math.max(this.dragStartLine, this.dragEndLine)
        // Dispatch range selection event with mode
        this.dispatchEvent(
          new CustomEvent('line-range-select', {
            detail: {
              startLine: minLine,
              endLine: maxLine,
              pageNum: this.currentPage,
              mode: this.dragMode, // 'select' or 'unselect'
            },
          })
        )
      }
      this.dragStartLine = null
      this.dragEndLine = null
      this.dragMode = null
    }
  }

  /**
   * Update visual feedback during drag selection
   */
  _updateDragSelection() {
    if (this.dragStartLine === null || this.dragEndLine === null) return

    const minLine = Math.min(this.dragStartLine, this.dragEndLine)
    const maxLine = Math.max(this.dragStartLine, this.dragEndLine)

    const textLayerDiv = this.shadowRoot.querySelector('.text-layer')
    if (!textLayerDiv) return

    // Update visual feedback based on drag mode
    const spans = textLayerDiv.querySelectorAll('span')
    spans.forEach((span) => {
      const lineNum = parseInt(span.dataset.lineNumber)
      const isInDragRange = lineNum >= minLine && lineNum <= maxLine
      const isAlreadySelected =
        this.selectedLineRange &&
        lineNum >= this.selectedLineRange.start &&
        lineNum <= this.selectedLineRange.end

      if (this.dragMode === 'select') {
        // Selecting mode: show ONLY lines in drag range (clear old selection visually)
        if (isInDragRange) {
          span.classList.add('selected-line')
        } else {
          span.classList.remove('selected-line')
        }
      } else if (this.dragMode === 'unselect') {
        // Unselecting mode: hide selection for lines in drag range
        if (isInDragRange) {
          span.classList.remove('selected-line')
        } else if (isAlreadySelected) {
          span.classList.add('selected-line')
        } else {
          span.classList.remove('selected-line')
        }
      }
    })
  }

  /**
   * Handle line click - toggle line selection or jump to note
   */
  _handleLineClick(lineNumber) {
    console.log('_handleLineClick called:', {
      lineNumber,
      extractedLineRanges: this.extractedLineRanges,
      isExtracted: this._isLineExtracted(lineNumber),
      lineToNotePath: this.lineToNotePath,
      selectedLineRange: this.selectedLineRange,
    })

    // Check if this is an extracted line (yellow highlight)
    const isExtractedLine = this._isLineExtracted(lineNumber)

    if (isExtractedLine) {
      // Get the note path for this extracted line
      const notePath = this.lineToNotePath.get(lineNumber)
      console.log('Extracted line clicked, note path:', notePath)

      if (notePath) {
        // Jump to the note for this extracted line
        console.log('Dispatching jump-to-note event for extracted line:', notePath)
        this.dispatchEvent(
          new CustomEvent('jump-to-note', {
            detail: { notePath },
          })
        )
        return
      } else {
        console.log('No note path found for extracted line, ignoring click')
        return
      }
    }

    console.log('Dispatching line-click event for selection')
    // Normal line selection toggle
    this.dispatchEvent(
      new CustomEvent('line-click', {
        detail: { lineNumber, pageNum: this.currentPage },
      })
    )
  }

  handlePageClick() {
    this.dispatchEvent(new CustomEvent('page-click'))
  }

  render() {
    return html`
      <div class="pdf-page-container" @click=${this.handlePageClick}>
        <canvas class="pdf-canvas"></canvas>
        <div class="text-layer"></div>
        ${this.isPageSelected ? html`<div class="page-selection-overlay"></div>` : ''}
        ${this.isExtracted
          ? html`
              <div class="extracted-overlay">
                <div class="page-extracted"></div>
              </div>
            `
          : ''}
      </div>
    `
  }
}

// ============================================================================
// PageRangeDialog Component
// ============================================================================
class PageRangeDialog extends LitElement {
  static properties = {
    pdfDocument: { type: Object },
    currentPage: { type: Number },
    totalPages: { type: Number },
    scale: { type: Number },
    isLoading: { type: Boolean },
    errorMessage: { type: String },
    selectionMode: { type: String },
    selectedPages: { type: Array },
    selectedLineRange: { type: Object },
    showRangeDialog: { type: Boolean },
    rangeStart: { type: Number },
    rangeEnd: { type: Number },
    restrictedRange: { type: Object },
    extractedPages: { type: Array },
    extractedLineRanges: { type: Object },
  }

  static styles = css`
    .dialog-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .dialog-content {
      background: #2e3338;
      border: 1px solid #1a1d20;
      border-radius: 8px;
      padding: 1.5rem;
      min-width: 300px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    }

    .dialog-title {
      color: #e0e0e0;
      font-size: 1.125rem;
      font-weight: 600;
      margin-bottom: 1rem;
    }

    .dialog-form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .form-row {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .form-row label {
      color: #b0b0b0;
      font-size: 0.875rem;
    }

    .form-row input {
      padding: 0.5rem;
      background: #3d4449;
      color: #e0e0e0;
      border: 1px solid #1a1d20;
      border-radius: 4px;
      font-size: 0.875rem;
    }

    .form-row input:focus {
      outline: none;
      border-color: #3b82f6;
    }

    .dialog-actions {
      display: flex;
      gap: 0.5rem;
      justify-content: flex-end;
      margin-top: 1rem;
    }

    .dialog-actions button {
      padding: 0.5rem 1rem;
      border: 1px solid #1a1d20;
      border-radius: 4px;
      font-size: 0.875rem;
      cursor: pointer;
    }

    .btn-cancel {
      background: #3d4449;
      color: #e0e0e0;
    }

    .btn-confirm {
      background: #3b82f6;
      color: white;
    }

    .dialog-actions button:hover {
      opacity: 0.9;
    }
  `

  handleClose() {
    this.dispatchEvent(new CustomEvent('close'))
  }

  handleConfirm() {
    this.dispatchEvent(
      new CustomEvent('confirm', {
        detail: { rangeStart: this.rangeStart, rangeEnd: this.rangeEnd },
      })
    )
  }

  handleRangeStartChange(e) {
    this.dispatchEvent(
      new CustomEvent('range-start-change', {
        detail: { value: parseInt(e.target.value) },
      })
    )
  }

  handleRangeEndChange(e) {
    this.dispatchEvent(
      new CustomEvent('range-end-change', {
        detail: { value: parseInt(e.target.value) },
      })
    )
  }

  render() {
    if (!this.show) return html``

    return html`
      <div class="dialog-overlay" @click=${this.handleClose}>
        <div class="dialog-content" @click=${(e) => e.stopPropagation()}>
          <div class="dialog-title">Select Page Range</div>
          <div class="dialog-form">
            <div class="form-row">
              <label>From Page:</label>
              <input
                type="number"
                min="1"
                max="${this.totalPages}"
                .value="${this.rangeStart}"
                @input=${this.handleRangeStartChange}
              />
            </div>
            <div class="form-row">
              <label>To Page:</label>
              <input
                type="number"
                min="1"
                max="${this.totalPages}"
                .value="${this.rangeEnd}"
                @input=${this.handleRangeEndChange}
              />
            </div>
            <div class="dialog-actions">
              <button class="btn-cancel" @click=${this.handleClose}>Cancel</button>
              <button class="btn-confirm" @click=${this.handleConfirm}>Confirm</button>
            </div>
          </div>
        </div>
      </div>
    `
  }
}

// ============================================================================
// PdfViewer Main Component
// ============================================================================
export class PdfViewer extends LitElement {
  static properties = {
    currentPage: { type: Number },
    totalPages: { type: Number },
    scale: { type: Number },
    selectionMode: { type: String },
    selectedPages: { type: Array },
    selectedLineRange: { type: Object }, // { start: number, end: number } or null
    isLoading: { type: Boolean },
    errorMessage: { type: String },
    showRangeDialog: { type: Boolean },
    rangeStart: { type: Number },
    rangeEnd: { type: Number },
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
    this.pdfPath = '' // Internal state only
    this.currentPage = 1
    this.totalPages = 0
    this.scale = 1.5
    this.selectionMode = 'text'
    this.selectedPages = []
    this.selectedLineRange = null // { start, end } or null
    this.isLoading = false
    this.errorMessage = ''
    this.pdfDocument = null
    this.extractedPages = []
    this.extractedLineRanges = new Map()
    this.showRangeDialog = false
    this.rangeStart = 1
    this.rangeEnd = 1
  }

  /**
   * Load a PDF file with optional configuration
   * @param {string} filePath - Path to the PDF file
   * @param {pdfOptions} options - Configuration options
   */
  async loadPdf(filePath, options = {}) {
    try {
      this.isLoading = true
      this.errorMessage = ''
      this.pdfPath = filePath

      // Clean up previous document
      if (this.pdfDocument) {
        await this.pdfDocument.destroy()
      }

      // Load PDF document from buffer (fixes Windows file path issues)
      const pdfResult = await window.fileManager.readPdfFile(filePath)
      if (!pdfResult.success) {
        throw new Error(pdfResult.error || 'Failed to read PDF file')
      }

      // Convert array back to Uint8Array for PDF.js
      const uint8Array = new Uint8Array(pdfResult.data)
      const loadingTask = getDocument({ data: uint8Array })
      this.pdfDocument = await loadingTask.promise
      this.totalPages = this.pdfDocument.numPages

      // Apply options
      this.applyOptions(options)

      // Set loading to false - this triggers render()
      this.isLoading = false
    } catch (error) {
      console.error('Error loading PDF:', error)
      this.errorMessage = `Failed to load PDF: ${error.message}`
      this.isLoading = false
    }
  }

  /**
   * Apply PDF viewing options
   * @param {pdfOptions} options
   */
  applyOptions(options) {
    console.log('applyOptions called with:', options)
    // Clear previous state
    this.restrictedRange = null
    this.selectedPages = []
    this.selectedLineRange = null

    // Apply page range restriction using pageStart and pageEnd
    if (options.pageStart && options.pageEnd) {
      const startPage = options.pageStart
      const endPage = options.pageEnd
      if (startPage >= 1 && endPage <= this.totalPages && startPage <= endPage) {
        this.restrictedRange = { start: startPage, end: endPage }
      }
    }

    // Set current page: if restricted, start from pageStart, otherwise start from page 1
    this.currentPage = this.restrictedRange ? this.restrictedRange.start : 1

    // Set extracted page ranges and line ranges
    this.extractedPages = options.extractedPages || new Set()
    this.extractedLineRanges = options.extractedLineRanges || new Map()
  }

  nextPage() {
    const maxPage = this.restrictedRange ? this.restrictedRange.end : this.totalPages
    if (this.currentPage < maxPage) {
      this.currentPage++
      this.clearLineSelection()
    }
  }

  prevPage() {
    const minPage = this.restrictedRange ? this.restrictedRange.start : 1
    if (this.currentPage > minPage) {
      this.currentPage--
      this.clearLineSelection()
    }
  }

  /**
   * Jump to a specific page
   * @param {number} pageNum - Page number (1-indexed)
   */
  goToPage(pageNum) {
    const minPage = this.restrictedRange ? this.restrictedRange.start : 1
    const maxPage = this.restrictedRange ? this.restrictedRange.end : this.totalPages

    if (pageNum >= minPage && pageNum <= maxPage) {
      this.currentPage = pageNum
      this.clearLineSelection()
    }
  }

  /**
   * Set page restriction for PDF extracts
   * @param {number} startPage - First page to show (1-indexed)
   * @param {number} endPage - Last page to show (1-indexed)
   */
  setPageRestriction(startPage, endPage) {
    if (startPage >= 1 && endPage <= this.totalPages && startPage <= endPage) {
      this.restrictedRange = { start: startPage, end: endPage }

      // If current page is outside range, jump to start
      if (this.currentPage < startPage || this.currentPage > endPage) {
        this.currentPage = startPage
      }
    }
  }

  /**
   * Clear page restriction (show all pages)
   */
  clearPageRestriction() {
    this.restrictedRange = null
  }

  /**
   * Select specific pages (for highlighting)
   * @param {Array<number>} pages - Array of page numbers or [start, end] range
   */
  selectPages(pages) {
    if (pages.length === 2) {
      // Interpret as a range [start, end]
      const [start, end] = pages
      this.selectedPages = []
      for (let i = start; i <= end; i++) {
        if (i >= 1 && i <= this.totalPages) {
          this.selectedPages.push(i)
        }
      }
    } else {
      // Interpret as individual page numbers
      this.selectedPages = pages.filter((p) => p >= 1 && p <= this.totalPages)
    }
  }

  zoomIn() {
    if (this.scale < 3.0) {
      this.scale += 0.25
    }
  }

  zoomOut() {
    if (this.scale > 0.5) {
      this.scale -= 0.25
    }
  }

  handleSelectionModeChange(e) {
    this.selectionMode = e.detail.mode
  }

  handlePageClick() {
    if (this.selectionMode === 'page') {
      const pageIndex = this.selectedPages.indexOf(this.currentPage)
      if (pageIndex >= 0) {
        this.selectedPages = this.selectedPages.filter((p) => p !== this.currentPage)
      } else {
        this.selectedPages = [...this.selectedPages, this.currentPage]
      }
    }
  }

  getSelectedPages() {
    return this.selectedPages.length > 0 ? this.selectedPages : []
  }

  /**
   * Get the current PDF file path
   * @returns {string} The absolute path to the currently loaded PDF
   */
  getCurrentPdfPath() {
    return this.pdfPath
  }

  openRangeDialog() {
    this.rangeStart = this.currentPage
    this.rangeEnd = Math.min(this.currentPage + 1, this.totalPages)
    this.showRangeDialog = true
  }

  closeRangeDialog() {
    this.showRangeDialog = false
  }

  handleRangeStartChange(e) {
    const value = e.detail.value
    if (value >= 1 && value <= this.totalPages) {
      this.rangeStart = value
      if (this.rangeStart > this.rangeEnd) {
        this.rangeEnd = this.rangeStart
      }
    }
  }

  handleRangeEndChange(e) {
    const value = e.detail.value
    if (value >= 1 && value <= this.totalPages) {
      this.rangeEnd = value
      if (this.rangeEnd < this.rangeStart) {
        this.rangeStart = this.rangeEnd
      }
    }
  }

  handleRangeConfirm(e) {
    const { rangeStart, rangeEnd } = e.detail
    // Create array of page numbers from rangeStart to rangeEnd
    this.selectedPages = []
    for (let i = rangeStart; i <= rangeEnd; i++) {
      this.selectedPages.push(i)
    }
    this.showRangeDialog = false
  }

  handleTextSpanClick(e) {
    // Deprecated - replaced by handleLineClick
  }

  /**
   * Handle jump to note - forward the event to parent (editor.js)
   */
  handleJumpToNote(e) {
    console.log('PdfViewer.handleJumpToNote called:', e.detail)
    const { notePath } = e.detail
    // Dispatch a custom event that editor.js will listen to
    const jumpEvent = new CustomEvent('pdf-jump-to-note', {
      detail: { notePath },
      bubbles: true,
      composed: true,
    })
    console.log('Dispatching pdf-jump-to-note event:', notePath)
    this.dispatchEvent(jumpEvent)
  }

  /**
   * Handle line click from PdfCanvas
   */
  handleLineClick(e) {
    const { lineNumber } = e.detail

    // Simply set the range to just this one line (toggle if already selected)
    if (
      this.selectedLineRange &&
      this.selectedLineRange.start === lineNumber &&
      this.selectedLineRange.end === lineNumber
    ) {
      // Clicking the same single line again - clear selection
      this.selectedLineRange = null
    } else {
      // Select just this line
      this.selectedLineRange = { start: lineNumber, end: lineNumber }
    }
  }

  /**
   * Handle immediate clear of selection when starting a new drag in select mode
   */
  handleClearSelectionImmediate() {
    this.selectedLineRange = null
  }

  /**
   * Handle line range selection (drag) from PdfCanvas
   */
  handleLineRangeSelect(e) {
    const { startLine, endLine, mode } = e.detail

    if (mode === 'unselect') {
      // Clear selection when dragging on selected lines
      this.selectedLineRange = null
    } else {
      // Set the range to the dragged lines
      this.selectedLineRange = { start: startLine, end: endLine }
    }
  }

  clearPageSelection() {
    this.selectedPages = []
  }

  clearLineSelection() {
    this.selectedLineRange = null
  }

  /**
   * Get selected text with line numbers
   */
  getSelectedTextWithLines() {
    if (!this.selectedLineRange) {
      return null
    }

    const pdfCanvas = this.shadowRoot.querySelector('pdf-canvas')
    if (!pdfCanvas) return null

    const textLayerDiv = pdfCanvas.shadowRoot?.querySelector('.text-layer')
    if (!textLayerDiv) return null

    // Get all spans for selected line range
    const spans = textLayerDiv.querySelectorAll('span')
    const textParts = []

    for (const span of spans) {
      const lineNum = parseInt(span.dataset.lineNumber)
      if (lineNum >= this.selectedLineRange.start && lineNum <= this.selectedLineRange.end) {
        textParts.push(span.textContent)
      }
    }

    return {
      text: textParts.join(''),
      pageNum: this.currentPage,
      lineStart: this.selectedLineRange.start,
      lineEnd: this.selectedLineRange.end,
    }
  }

  /**
   * Get extracted line ranges for current page
   * @returns {Array<{start: number, end: number, notePath: string}>}
   */
  _getExtractedLineRangesForCurrentPage() {
    return this.extractedLineRanges.get(this.currentPage) || []
  }

  /**
   * Get mapping of line numbers to note paths for current page
   * @returns {Map<number, string>}
   */
  _getLineToNotePathForCurrentPage() {
    const ranges = this._getExtractedLineRangesForCurrentPage()
    const lineToPath = new Map()

    ranges.forEach((range) => {
      // Map all lines from start to end to the note path
      for (let line = range.start; line <= range.end; line++) {
        lineToPath.set(line, range.notePath)
      }
    })

    return lineToPath
  }

  /**
   * Check if current page is fully extracted
   * @returns {boolean}
   */
  _isCurrentPageExtracted() {
    return this.extractedPages?.has(this.currentPage)
  }

  handleRenderError(e) {
    this.errorMessage = `Failed to render PDF: ${e.detail.error}`
  }

  disconnectedCallback() {
    super.disconnectedCallback()

    // Destroy PDF document
    if (this.pdfDocument) {
      this.pdfDocument.destroy()
    }
  }

  render() {
    if (this.isLoading) {
      return html`<div class="loading-message">Loading PDF...</div>`
    }

    if (this.errorMessage) {
      return html`<div class="error-message">${this.errorMessage}</div>`
    }

    if (!this.pdfDocument) {
      return html`<div class="loading-message">No PDF loaded</div>`
    }

    return html`
      <pdf-toolbar
        .currentPage=${this.currentPage}
        .totalPages=${this.totalPages}
        .restrictedRange=${this.restrictedRange}
        .scale=${this.scale}
        .selectionMode=${this.selectionMode}
        .selectedPages=${this.selectedPages}
        .selectedLineRange=${this.selectedLineRange}
        @page-next=${this.nextPage}
        @page-prev=${this.prevPage}
        @zoom-in=${this.zoomIn}
        @zoom-out=${this.zoomOut}
        @selection-mode-change=${this.handleSelectionModeChange}
        @open-range-dialog=${this.openRangeDialog}
        @clear-selection=${this.clearPageSelection}
        @clear-line-selection=${this.clearLineSelection}
      ></pdf-toolbar>

      <pdf-canvas
        .pdfDocument=${this.pdfDocument}
        .currentPage=${this.currentPage}
        .scale=${this.scale}
        .isPageSelected=${this.selectedPages.includes(this.currentPage)}
        .isExtracted=${this._isCurrentPageExtracted()}
        .extractedLineRanges=${this._getExtractedLineRangesForCurrentPage()}
        .lineToNotePath=${this._getLineToNotePathForCurrentPage()}
        .selectedLineRange=${this.selectedLineRange}
        .selectionMode=${this.selectionMode}
        @page-click=${this.handlePageClick}
        @render-error=${this.handleRenderError}
        @line-click=${this.handleLineClick}
        @line-range-select=${this.handleLineRangeSelect}
        @clear-selection-immediate=${this.handleClearSelectionImmediate}
        @jump-to-note=${this.handleJumpToNote}
      ></pdf-canvas>

      <page-range-dialog
        .show=${this.showRangeDialog}
        .rangeStart=${this.rangeStart}
        .rangeEnd=${this.rangeEnd}
        .totalPages=${this.totalPages}
        @close=${this.closeRangeDialog}
        @confirm=${this.handleRangeConfirm}
        @range-start-change=${this.handleRangeStartChange}
        @range-end-change=${this.handleRangeEndChange}
      ></page-range-dialog>
    `
  }
}

// Register custom elements
customElements.define('pdf-toolbar', PdfToolbar)
customElements.define('pdf-canvas', PdfCanvas)
customElements.define('page-range-dialog', PageRangeDialog)
customElements.define('pdf-viewer', PdfViewer)
