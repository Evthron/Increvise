// SPDX-FileCopyrightText: 2025 The Increvise Project Contributors
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
  constructor({ pageStart = null, pageEnd = null, extractedRanges = [] } = {}) {
    // Page range restriction - start page
    this.pageStart = pageStart
    // Page range restriction - end page
    this.pageEnd = pageEnd
    // Already extracted page ranges to lock
    this.extractedRanges = extractedRanges
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
  `

  constructor() {
    super()
    this.currentRenderTask = null
    this._renderScheduled = null
    this.textLayer = null
  }

  /**
   * Lit lifecycle: responds to property changes
   */
  updated(changedProperties) {
    super.updated(changedProperties)

    // Cancel any previously scheduled render
    if (this._renderScheduled) {
      cancelAnimationFrame(this._renderScheduled)
    }

    // Schedule render using requestAnimationFrame
    this._renderScheduled = requestAnimationFrame(() => {
      this._renderScheduled = null
      this._renderPage()
    })
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
    } catch (error) {
      console.error('Error rendering text layer:', error)
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback()

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

    // Cancel text layer
    if (this.textLayer) {
      this.textLayer.cancel()
      this.textLayer = null
    }
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
    show: { type: Boolean },
    rangeStart: { type: Number },
    rangeEnd: { type: Number },
    totalPages: { type: Number },
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
    pdfPath: { type: String },
    currentPage: { type: Number },
    totalPages: { type: Number },
    scale: { type: Number },
    selectionMode: { type: String },
    selectedPages: { type: Array },
    isLoading: { type: Boolean },
    errorMessage: { type: String },
    showRangeDialog: { type: Boolean },
    rangeStart: { type: Number },
    rangeEnd: { type: Number },
    restrictedRange: { type: Object },
    contentType: { type: String },
    content: { type: String },
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

  resetView() {
    this.contentType = ''
    this.content = ''
    this.pdfDoc = null
    const canvas = this.shadowRoot?.querySelector('#pdf-canvas')
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    const htmlContainer = this.shadowRoot?.querySelector('#html-container')
    if (htmlContainer) htmlContainer.innerHTML = ''
  }

  constructor() {
    super()
    this.pdfPath = ''
    this.currentPage = 1
    this.totalPages = 0
    this.scale = 1.5
    this.selectionMode = 'text'
    this.selectedPages = []
    this.isLoading = false
    this.errorMessage = ''
    this.pdfDocument = null
    this.extractedRanges = []
    this.showRangeDialog = false
    this.rangeStart = 1
    this.rangeEnd = 1
    this.contentType = 'pdf'
    this.content = ''
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
    // Clear previous state
    this.restrictedRange = null
    this.selectedPages = []

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

    // Set extracted ranges (for locking)
    this.extractedRanges = options.extractedRanges
  }

  nextPage() {
    const maxPage = this.restrictedRange ? this.restrictedRange.end : this.totalPages
    if (this.currentPage < maxPage) {
      this.currentPage++
    }
  }

  prevPage() {
    const minPage = this.restrictedRange ? this.restrictedRange.start : 1
    if (this.currentPage > minPage) {
      this.currentPage--
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

      this.requestUpdate()
    }
  }

  /**
   * Clear page restriction (show all pages)
   */
  clearPageRestriction() {
    this.restrictedRange = null
    this.requestUpdate()
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
    this.requestUpdate()
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
    this.requestUpdate()
  }

  clearPageSelection() {
    this.selectedPages = []
    this.requestUpdate()
  }

  /**
   * Get selected text from PDF
   * @returns {Object|null} - {text, pageNum} or null if no selection
   */
  getSelectedText() {
    // Get the text layer from PdfCanvas component
    const pdfCanvas = this.shadowRoot.querySelector('pdf-canvas')
    if (!pdfCanvas) return null

    const textLayer = pdfCanvas.shadowRoot?.querySelector('.text-layer')
    if (!textLayer) return null

    // Get selected text from window selection
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) return null

    const selectedText = selection.toString().trim()
    if (!selectedText) return null

    return {
      text: selectedText,
      pageNum: this.currentPage,
    }
  }

  lockExtractedRanges(ranges) {
    this.extractedRanges = ranges
    this.requestUpdate()
  }

  isPageExtracted() {
    return this.extractedRanges.some(
      (range) =>
        (range.extract_type === 'pdf-page' || range.extract_type === 'pdf-text') &&
        parseInt(range.range_start) <= this.currentPage &&
        parseInt(range.range_end) >= this.currentPage
    )
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
        @page-next=${this.nextPage}
        @page-prev=${this.prevPage}
        @zoom-in=${this.zoomIn}
        @zoom-out=${this.zoomOut}
        @selection-mode-change=${this.handleSelectionModeChange}
        @open-range-dialog=${this.openRangeDialog}
        @clear-selection=${this.clearPageSelection}
      ></pdf-toolbar>

      <pdf-canvas
        .pdfDocument=${this.pdfDocument}
        .currentPage=${this.currentPage}
        .scale=${this.scale}
        .isPageSelected=${this.selectedPages.includes(this.currentPage)}
        .isExtracted=${this.isPageExtracted()}
        .selectionMode=${this.selectionMode}
        @page-click=${this.handlePageClick}
        @render-error=${this.handleRenderError}
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
