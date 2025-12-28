// SPDX-FileCopyrightText: 2025 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { LitElement, html, css } from 'lit'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'

// Configure PDF.js worker for Electron
const workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).toString()
GlobalWorkerOptions.workerSrc = workerSrc

export class PdfViewer extends LitElement {
  static properties = {
    pdfPath: { type: String },
    currentPage: { type: Number },
    totalPages: { type: Number },
    scale: { type: Number },
    selectionMode: { type: String }, // 'text' | 'page'
    selectedPages: { type: Array },
    isLoading: { type: Boolean },
    errorMessage: { type: String },
    showRangeDialog: { type: Boolean },
    rangeStart: { type: Number },
    rangeEnd: { type: Number },
    restrictedRange: { type: Object }, // { start: number, end: number } or null
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      background: #525659;
    }

    .pdf-toolbar {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.5rem 1rem;
      background: #2e3338;
      border-bottom: 1px solid #1a1d20;
      flex-shrink: 0;
    }

    .pdf-toolbar button {
      padding: 0.25rem 0.75rem;
      background: #3d4449;
      color: #e0e0e0;
      border: 1px solid #1a1d20;
      border-radius: 3px;
      cursor: pointer;
      font-size: 0.875rem;
    }

    .pdf-toolbar button:hover:not(:disabled) {
      background: #4a5055;
    }

    .pdf-toolbar button:disabled {
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

    .pdf-viewer-content {
      flex: 1;
      overflow: auto;
      display: flex;
      justify-content: center;
      padding: 2rem;
    }

    .pdf-page-container {
      display: inline-flex;
      position: relative;
      background: white;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      margin-bottom: 1rem;
    }

    .pdf-canvas {
      display: block;
      max-width: 100%;
      height: auto;
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

    /* Page Range Dialog Styles */
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

    .dialog-actions .btn-cancel {
      background: #3d4449;
      color: #e0e0e0;
    }

    .dialog-actions .btn-confirm {
      background: #3b82f6;
      color: white;
    }

    .dialog-actions button:hover {
      opacity: 0.9;
    }

    .selected-pages-info {
      color: #3b82f6;
      font-size: 0.875rem;
      margin-left: 1rem;
    }
  `

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
    this.currentRenderTask = null // Track current render task to prevent concurrent rendering
    this._renderScheduled = null // Track scheduled render frame
  }

  /**
   * Load a PDF file with optional configuration
   * @param {string} filePath - Path to the PDF file
   * @param {Object} options - Configuration options
   * @param {Array<number>} options.pageRange - [startPage, endPage] to restrict viewing
   * @param {number} options.initialPage - Page to display initially
   * @param {Array<number>} options.selectedPages - Pages to highlight
   * @param {Array<Object>} options.extractedRanges - Already extracted page ranges to lock
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

      // Cancel any pending render
      if (this.currentRenderTask) {
        this.currentRenderTask.cancel()
        this.currentRenderTask = null
      }

      // Load PDF document
      const loadingTask = getDocument(filePath)
      this.pdfDocument = await loadingTask.promise
      this.totalPages = this.pdfDocument.numPages

      // Apply options (this will update reactive properties and trigger render)
      this.applyOptions(options)

      // Set loading to false - this triggers render() which creates the canvas
      // The actual page rendering will happen in updated() lifecycle
      this.isLoading = false
    } catch (error) {
      console.error('Error loading PDF:', error)
      this.errorMessage = `Failed to load PDF: ${error.message}`
      this.isLoading = false
    }
  }

  /**
   * Apply PDF viewing options
   * @param {Object} options - Configuration options
   */
  applyOptions(options) {
    // Clear previous state
    this.restrictedRange = null
    this.selectedPages = []

    // Apply page range restriction
    if (options.pageRange && Array.isArray(options.pageRange) && options.pageRange.length === 2) {
      const [startPage, endPage] = options.pageRange
      if (startPage >= 1 && endPage <= this.totalPages && startPage <= endPage) {
        this.restrictedRange = { start: startPage, end: endPage }
      }
    }

    // Set initial page (respecting restrictions)
    if (options.initialPage) {
      const minPage = this.restrictedRange ? this.restrictedRange.start : 1
      const maxPage = this.restrictedRange ? this.restrictedRange.end : this.totalPages
      this.currentPage =
        options.initialPage >= minPage && options.initialPage <= maxPage
          ? options.initialPage
          : minPage
    } else {
      this.currentPage = this.restrictedRange ? this.restrictedRange.start : 1
    }

    // Set selected pages (for highlighting)
    if (options.selectedPages && Array.isArray(options.selectedPages)) {
      if (options.selectedPages.length === 2) {
        // Interpret as range [start, end]
        const [start, end] = options.selectedPages
        this.selectedPages = []
        for (let i = start; i <= end; i++) {
          if (i >= 1 && i <= this.totalPages) {
            this.selectedPages.push(i)
          }
        }
      } else {
        // Interpret as individual page numbers
        this.selectedPages = options.selectedPages.filter((p) => p >= 1 && p <= this.totalPages)
      }
    }

    // Set extracted ranges (for locking)
    if (options.extractedRanges && Array.isArray(options.extractedRanges)) {
      this.extractedRanges = options.extractedRanges
    }
  }

  async renderCurrentPage() {
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

      // Wait for component to update
      await this.updateComplete

      const canvas = this.shadowRoot.querySelector('.pdf-canvas')
      if (!canvas) {
        console.error('Canvas element not found in shadow DOM')
        this.errorMessage = 'Failed to render PDF: Canvas not ready'
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
      page.cleanup()
    } catch (error) {
      // Ignore cancellation errors
      if (error.name === 'RenderingCancelledException') {
        return
      }
      console.error('Error rendering page:', error)
      this.errorMessage = `Failed to render page: ${error.message}`
    }
  }

  async nextPage() {
    const maxPage = this.restrictedRange ? this.restrictedRange.end : this.totalPages
    if (this.currentPage < maxPage) {
      this.currentPage++
      // Rendering will be triggered by updated() lifecycle
    }
  }

  async prevPage() {
    const minPage = this.restrictedRange ? this.restrictedRange.start : 1
    if (this.currentPage > minPage) {
      this.currentPage--
      // Rendering will be triggered by updated() lifecycle
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
      // Rendering will be triggered by updated() lifecycle
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
        // Rendering will be triggered by updated() lifecycle
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

  async zoomIn() {
    if (this.scale < 3.0) {
      this.scale += 0.25
      // Rendering will be triggered by updated() lifecycle
    }
  }

  async zoomOut() {
    if (this.scale > 0.5) {
      this.scale -= 0.25
      // Rendering will be triggered by updated() lifecycle
    }
  }

  setSelectionMode(event) {
    this.selectionMode = event.target.value
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
    const value = parseInt(e.target.value)
    if (value >= 1 && value <= this.totalPages) {
      this.rangeStart = value
      if (this.rangeStart > this.rangeEnd) {
        this.rangeEnd = this.rangeStart
      }
    }
  }

  handleRangeEndChange(e) {
    const value = parseInt(e.target.value)
    if (value >= 1 && value <= this.totalPages) {
      this.rangeEnd = value
      if (this.rangeEnd < this.rangeStart) {
        this.rangeStart = this.rangeEnd
      }
    }
  }

  confirmRangeSelection() {
    // Create array of page numbers from rangeStart to rangeEnd
    this.selectedPages = []
    for (let i = this.rangeStart; i <= this.rangeEnd; i++) {
      this.selectedPages.push(i)
    }
    this.showRangeDialog = false
    this.requestUpdate()
  }

  clearPageSelection() {
    this.selectedPages = []
    this.requestUpdate()
  }

  lockExtractedRanges(ranges) {
    this.extractedRanges = ranges
    this.requestUpdate()
  }

  isPageExtracted() {
    return this.extractedRanges.some(
      (range) =>
        range.extract_type === 'pdf-page' &&
        parseInt(range.range_start) <= this.currentPage &&
        parseInt(range.range_end) >= this.currentPage
    )
  }

  /**
   * Lit lifecycle: called after component updates
   * This is where we trigger page rendering when the canvas is ready
   */
  updated(changedProperties) {
    super.updated(changedProperties)

    // Check if we need to render
    const shouldRender =
      (changedProperties.has('isLoading') && !this.isLoading && this.pdfDocument) ||
      (changedProperties.has('currentPage') && !this.isLoading && this.pdfDocument) ||
      (changedProperties.has('scale') && !this.isLoading && this.pdfDocument)

    if (shouldRender) {
      // Cancel any previously scheduled render
      if (this._renderScheduled) {
        cancelAnimationFrame(this._renderScheduled)
      }

      // Schedule new render
      this._renderScheduled = requestAnimationFrame(() => {
        this._renderScheduled = null
        this.renderCurrentPage()
      })
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

    const isPageSelected = this.selectedPages.includes(this.currentPage)
    const isExtracted = this.isPageExtracted()
    const minPage = this.restrictedRange ? this.restrictedRange.start : 1
    const maxPage = this.restrictedRange ? this.restrictedRange.end : this.totalPages

    return html`
      <div class="pdf-toolbar">
        <button @click="${this.prevPage}" ?disabled="${this.currentPage === minPage}">
          ← Prev
        </button>
        <span class="page-info">
          ${this.restrictedRange
            ? `Page ${this.currentPage} / ${this.restrictedRange.end} (of ${this.totalPages} total)`
            : `Page ${this.currentPage} / ${this.totalPages}`}
        </span>
        <button @click="${this.nextPage}" ?disabled="${this.currentPage === maxPage}">
          Next →
        </button>

        <div class="zoom-controls">
          <button @click="${this.zoomOut}" ?disabled="${this.scale <= 0.5}">-</button>
          <span>${Math.round(this.scale * 100)}%</span>
          <button @click="${this.zoomIn}" ?disabled="${this.scale >= 3.0}">+</button>
        </div>

        <div class="selection-mode">
          <label>
            <input
              type="radio"
              name="mode"
              value="text"
              @change="${this.setSelectionMode}"
              ?checked="${this.selectionMode === 'text'}"
            />
            Text Selection
          </label>
          <label>
            <input
              type="radio"
              name="mode"
              value="page"
              @change="${this.setSelectionMode}"
              ?checked="${this.selectionMode === 'page'}"
            />
            Page Selection
          </label>
          ${this.selectionMode === 'page'
            ? html`
                <button @click="${this.openRangeDialog}">Select Range</button>
                ${this.selectedPages.length > 0
                  ? html`<span class="selected-pages-info">
                        Selected: ${this.selectedPages.length} page(s)
                        ${this.selectedPages.length > 0
                          ? `(${Math.min(...this.selectedPages)}-${Math.max(...this.selectedPages)})`
                          : ''}
                      </span>
                      <button @click="${this.clearPageSelection}">Clear</button>`
                  : ''}
              `
            : ''}
        </div>
      </div>

      <div class="pdf-viewer-content">
        <div class="pdf-page-container" @click="${this.handlePageClick}">
          <canvas class="pdf-canvas"></canvas>
          ${isPageSelected ? html`<div class="page-selection-overlay"></div>` : ''}
          ${isExtracted
            ? html`<div class="extracted-overlay">
                <div class="page-extracted"></div>
              </div>`
            : ''}
        </div>
      </div>

      ${this.showRangeDialog
        ? html`
            <div class="dialog-overlay" @click="${this.closeRangeDialog}">
              <div class="dialog-content" @click="${(e) => e.stopPropagation()}">
                <div class="dialog-title">Select Page Range</div>
                <div class="dialog-form">
                  <div class="form-row">
                    <label>From Page:</label>
                    <input
                      type="number"
                      min="1"
                      max="${this.totalPages}"
                      .value="${this.rangeStart}"
                      @input="${this.handleRangeStartChange}"
                    />
                  </div>
                  <div class="form-row">
                    <label>To Page:</label>
                    <input
                      type="number"
                      min="1"
                      max="${this.totalPages}"
                      .value="${this.rangeEnd}"
                      @input="${this.handleRangeEndChange}"
                    />
                  </div>
                  <div class="dialog-actions">
                    <button class="btn-cancel" @click="${this.closeRangeDialog}">Cancel</button>
                    <button class="btn-confirm" @click="${this.confirmRangeSelection}">
                      Confirm
                    </button>
                  </div>
                </div>
              </div>
            </div>
          `
        : ''}
    `
  }
}

// Register custom element
customElements.define('pdf-viewer', PdfViewer)
