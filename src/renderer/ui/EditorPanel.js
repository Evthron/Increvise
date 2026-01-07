// SPDX-FileCopyrightText: 2025 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

/* global setTimeout, customElements */

// Editor Panel Lit component
// Manages file editor, preview, and related events

import { LitElement, html, css } from 'lit'
import { pdfOptions } from './pdfViewer.js'

/**
 * Convert database extractedRanges to pdfViewer-ready format
 * @param {Array} ranges - Raw ranges from database (getChildRanges result)
 * @returns {{extractedPageRanges: Array<number>, extractedLineRanges: Map<number, Array>}}
 */
function processExtractedRanges(ranges) {
  const extractedPageRanges = []
  const extractedLineRanges = new Map()

  for (const range of ranges) {
    // Handle pdf-page extracts (whole page extracts)
    if (range.extract_type === 'pdf-page') {
      const startPage = parseInt(range.pageNum || range.start)
      const endPage = parseInt(range.pageNum || range.end)

      // Add all pages in the range
      for (let page = startPage; page <= endPage; page++) {
        if (!extractedPageRanges.includes(page)) {
          extractedPageRanges.push(page)
        }
      }
    }

    // Handle pdf-text extracts (line range extracts)
    if (range.extract_type === 'pdf-text' && range.lineStart !== null && range.lineEnd !== null) {
      const pageNum = range.pageNum

      // Organize by page number
      if (!extractedLineRanges.has(pageNum)) {
        extractedLineRanges.set(pageNum, [])
      }

      extractedLineRanges.get(pageNum).push({
        start: range.lineStart,
        end: range.lineEnd,
        notePath: range.path,
      })
    }
  }

  return { extractedPageRanges, extractedLineRanges }
}

export class EditorPanel extends LitElement {
  static properties = {
    currentOpenFile: { type: String, state: true },
    currentFilePath: { type: String, state: true },
    isEditMode: { type: Boolean, state: true },
    hasUnsavedChanges: { type: Boolean, state: true },
    currentViewerType: { type: String, state: true }, // 'pdf' | 'markdown' | 'html' | 'text'
    currentDisplayMode: { type: String, state: true }, // 'preview' | 'source'
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      background: var(--editor-bg, #fff);
    }

    .editor-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.5rem 1rem;
      background: var(--toolbar-bg, #f5f5f5);
      border-bottom: 1px solid var(--border-color, #ddd);
    }

    .editor-toolbar.hidden {
      display: none;
    }

    .toolbar-left {
      flex: 1;
      min-width: 0;
    }

    .toolbar-right {
      display: flex;
      gap: 0.5rem;
    }

    #current-file-path {
      font-size: 0.9rem;
      color: var(--text-muted, #666);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    button {
      padding: 0.375rem 0.75rem;
      border: 1px solid var(--button-border, #ccc);
      background: var(--button-bg, #fff);
      color: var(--button-text, #333);
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.875rem;
      transition: all 0.2s;
    }

    button:hover:not(:disabled) {
      background: var(--button-hover-bg, #f0f0f0);
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    button.hidden {
      display: none;
    }

    .editor-content {
      flex: 1;
      overflow: auto;
      position: relative;
    }

    .hidden {
      display: none !important;
    }
  `

  constructor() {
    super()
    this.currentOpenFile = null
    this.currentFilePath = ''
    this.isEditMode = false
    this.hasUnsavedChanges = false
    this.currentViewerType = null
    this.currentDisplayMode = 'preview'
  }

  firstUpdated() {
    // Get viewer references
    this.codeMirrorEditor = this.shadowRoot
      .querySelector('slot[name="codemirror"]')
      .assignedElements()[0]
    this.pdfViewer = this.shadowRoot.querySelector('slot[name="pdf"]').assignedElements()[0]
    this.htmlViewer = this.shadowRoot.querySelector('slot[name="html"]').assignedElements()[0]
    this.markdownViewer = this.shadowRoot
      .querySelector('slot[name="markdown"]')
      .assignedElements()[0]

    // Set up event listeners
    this._setupEventListeners()
  }

  _setupEventListeners() {
    // Listen for jump to note events from PDF viewer
    if (this.pdfViewer) {
      this.pdfViewer.addEventListener('pdf-jump-to-note', async (e) => {
        const { notePath } = e.detail
        console.log('Jumping to note:', notePath)

        let absolutePath = notePath
        if (!window.currentRootPath) {
          console.error('Cannot jump to note: no workspace root path set')
          this._showToast('Cannot jump to note: no workspace open', true)
          return
        }
        absolutePath = `${window.currentRootPath}/${notePath}`
        console.log('Resolved absolute path:', absolutePath)

        await this.openFile(absolutePath)
      })
    }

    // Listen for content changes in CodeMirror
    if (this.codeMirrorEditor) {
      this.codeMirrorEditor.addEventListener('content-changed', () => {
        if (this.currentOpenFile && this.isEditMode) {
          this.hasUnsavedChanges = true
        }
      })
    }

    // Listen for extraction events from markdown/html viewers
    document.addEventListener('extract-requested', async (e) => {
      const { text, viewerType } = e.detail

      if (!window.currentFileLibraryId) {
        this._showToast('Error: Library ID not set', true)
        return
      }

      try {
        const result = await window.fileManager.extractNote(
          this.currentOpenFile,
          text,
          0,
          0,
          window.currentFileLibraryId
        )

        if (result.success) {
          const viewer = viewerType === 'markdown' ? this.markdownViewer : this.htmlViewer
          await this._loadAndLockExtractedContent(this.currentOpenFile, viewer)
          this._showToast(`Note extracted to ${result.fileName}`)
        }
      } catch (error) {
        this._showToast(`Error: ${error.message}`, true)
      }
    })

    // Listen for child note open requests from CodeMirror widget badges
    window.addEventListener('open-child-note', async (event) => {
      const { path: childPath } = event.detail

      if (!childPath) {
        console.error('[open-child-note] No child path provided')
        this._showToast('Error: No child note path specified', true)
        return
      }

      if (!window.currentRootPath) {
        console.error('[open-child-note] No workspace root path set')
        this._showToast('Cannot open child note: no workspace open', true)
        return
      }

      try {
        const absolutePath = `${window.currentRootPath}/${childPath}`
        await this.openFile(absolutePath)
      } catch (error) {
        console.error('[open-child-note] Error:', error)
        this._showToast(`Error opening child note: ${error.message}`, true)
      }
    })
  }

  render() {
    const showToolbar = this.currentOpenFile !== null

    return html`
      <div class="editor-toolbar ${showToolbar ? '' : 'hidden'}">
        <div class="toolbar-left">
          <span id="current-file-path">${this.currentFilePath}</span>
        </div>
        <div class="toolbar-right">${this._renderToolbarButtons()}</div>
      </div>
      <div class="editor-content">
        <slot name="codemirror"></slot>
        <slot name="pdf"></slot>
        <slot name="html"></slot>
        <slot name="markdown"></slot>
      </div>
    `
  }

  _renderToolbarButtons() {
    if (this.currentViewerType === 'pdf') {
      // PDF mode: [Extract Text] [Extract Page]
      return html`
        <button @click=${this._handleExtractText}>Extract Text</button>
        <button @click=${this._handleExtractPage}>Extract Page</button>
      `
    } else if (this.currentDisplayMode === 'preview') {
      // Preview mode (markdown/html rendered): [Extract] [View Source]
      return html`
        <button @click=${this._handleExtract}>Extract</button>
        <button @click=${this._handleToggleEdit}>View Source</button>
      `
    } else if (this.currentDisplayMode === 'source') {
      // Source mode
      if (this.isEditMode) {
        // Source editable: [Save] [Select] [Preview]
        return html`
          <button @click=${this._handleSave}>Save</button>
          <button @click=${this._handleEditSource}>Select</button>
          <button @click=${this._handleToggleEdit}>Preview</button>
        `
      } else {
        // Source readonly: [Extract] [Edit] [Preview]
        return html`
          <button @click=${this._handleExtract}>Extract</button>
          <button @click=${this._handleEditSource}>Edit</button>
          <button @click=${this._handleToggleEdit}>Preview</button>
        `
      }
    }
    return ''
  }

  /**
   * Opens a file and displays its content in the editor and preview.
   * @param {string} filePath
   */
  async openFile(filePath) {
    try {
      if (this.hasUnsavedChanges) {
        const proceed = confirm('You have unsaved changes. Discard them?')
        if (!proceed) return
      }

      // Sync fileLibraryId with workspaceLibraryId if needed
      if (window.currentWorkspaceLibraryId && !window.currentFileLibraryId) {
        window.currentFileLibraryId = window.currentWorkspaceLibraryId
        console.log(
          'Syncing file library ID with workspace library ID:',
          window.currentWorkspaceLibraryId
        )
      }

      // Check if file is a PDF extract by querying database
      let pdfExtractInfo = null
      if (window.currentFileLibraryId) {
        const extractInfo = await window.fileManager.getNoteExtractInfo(
          filePath,
          window.currentFileLibraryId
        )

        if (extractInfo && extractInfo.success && extractInfo.found) {
          if (extractInfo.extractType === 'pdf-page') {
            pdfExtractInfo = extractInfo
            console.log('extracted pdf info get')
          }
        }
      }

      // Determine file type and dispatch to appropriate handler
      const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
      const isPdf = ext === '.pdf'

      if (pdfExtractInfo) {
        // PDF extract file
        await this._openPdfExtract(filePath, pdfExtractInfo)
      } else if (isPdf) {
        // Regular PDF file
        await this._openRegularPdf(filePath)
      } else {
        // Text file (markdown, html, or other)
        this.pdfViewer?.resetView?.()
        const result = await window.fileManager.readFile(filePath)
        if (!result.success) {
          alert(`Error reading file: ${result.error}`)
          return
        }
        await this._openTextFile(filePath, result.content)
      }
    } catch (error) {
      console.error('[openFile] Error opening file:', error)
      alert(`Error opening file: ${error.message}`)
    }
  }

  /**
   * Open a PDF extract file
   * @param {string} filePath
   * @param {Object} extractInfo
   */
  async _openPdfExtract(filePath, extractInfo) {
    console.log('Opening PDF extract file:', filePath)
    console.log('Extract info:', extractInfo)

    const { parentPath, rangeStart, rangeEnd } = extractInfo
    const sourcePdfPath = parentPath

    let pageStart = null
    let pageEnd = null
    let lineStart = null
    let lineEnd = null
    let displayText = ''

    console.log('Parsing range:', { rangeStart, rangeEnd, type: typeof rangeStart })

    if (typeof rangeStart === 'string' && rangeStart.includes(':')) {
      // Text extract with line numbers: "pageNum:lineNum"
      const [pageStr, lineStartStr] = rangeStart.split(':')
      const [endPageStr, lineEndStr] = rangeEnd.split(':')
      pageStart = parseInt(pageStr)
      pageEnd = parseInt(endPageStr)
      lineStart = parseInt(lineStartStr)
      lineEnd = parseInt(lineEndStr)
      displayText = `(Page ${pageStart}, Lines ${lineStart}-${lineEnd})`
      console.log('Text extract detected:', { pageStart, pageEnd, lineStart, lineEnd })
    } else {
      // Page extract: just page numbers
      pageStart = typeof rangeStart === 'string' ? parseInt(rangeStart) : rangeStart
      pageEnd = typeof rangeEnd === 'string' ? parseInt(rangeEnd) : rangeEnd
      displayText = `(Pages ${pageStart}-${pageEnd})`
      console.log('Page extract detected:', { pageStart, pageEnd })
    }

    // Update state
    this.currentOpenFile = filePath
    this.currentViewerType = 'pdf'
    this.currentDisplayMode = 'preview'
    this.currentFilePath = displayText

    // Show PDF viewer, hide others
    this._showViewer('pdf')

    // Get extracted ranges for the PDF
    const rangesResult = await window.fileManager.getChildRanges(
      sourcePdfPath,
      window.currentFileLibraryId
    )

    // Convert database ranges to pdfViewer format
    const { extractedPageRanges, extractedLineRanges } = processExtractedRanges(
      rangesResult?.success ? rangesResult.ranges : []
    )

    // Load PDF with all configurations at once
    const options = new pdfOptions({
      pageStart: pageStart,
      pageEnd: pageEnd,
      extractedPageRanges: extractedPageRanges,
      extractedLineRanges: extractedLineRanges,
    })

    console.log('Final pdfOptions:', options)
    await this.pdfViewer.loadPdf(sourcePdfPath, options)

    console.log('PDF extract loaded with configuration:', {
      pageStart,
      pageEnd,
      extractedPageRanges: extractedPageRanges.length,
      extractedLineRangesPages: extractedLineRanges.size,
    })

    this.requestUpdate()
  }

  /**
   * Open a regular PDF file
   * @param {string} filePath
   */
  async _openRegularPdf(filePath) {
    this.currentOpenFile = filePath
    this.currentViewerType = 'pdf'
    this.currentDisplayMode = 'preview'
    this.currentFilePath = filePath

    // Show PDF viewer, hide others
    this._showViewer('pdf')

    // Get extracted ranges for the PDF
    const rangesResult = await window.fileManager.getChildRanges(
      filePath,
      window.currentFileLibraryId
    )

    // Convert database ranges to pdfViewer format
    const { extractedPageRanges, extractedLineRanges } = processExtractedRanges(
      rangesResult?.success ? rangesResult.ranges : []
    )

    // Load PDF with extracted ranges
    await this.pdfViewer.loadPdf(
      filePath,
      new pdfOptions({
        extractedPageRanges: extractedPageRanges,
        extractedLineRanges: extractedLineRanges,
      })
    )

    console.log('Regular PDF loaded with extracted ranges:', {
      extractedPageRanges: extractedPageRanges.length,
      extractedLineRangesPages: extractedLineRanges.size,
    })

    this.requestUpdate()
  }

  /**
   * Open a text file (markdown, html, or other text formats)
   * @param {string} filePath
   * @param {string} content
   */
  async _openTextFile(filePath, content) {
    this.currentOpenFile = filePath
    this.currentFilePath = filePath
    this.isEditMode = false
    this.hasUnsavedChanges = false

    const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()

    // Determine viewer type
    if (ext === '.md' || ext === '.markdown') {
      this.currentViewerType = 'markdown'
    } else if (ext === '.html' || ext === '.htm') {
      this.currentViewerType = 'html'
    } else {
      this.currentViewerType = 'text'
    }

    // Default to preview mode (for markdown/html) or source readonly mode (for text)
    if (this.currentViewerType === 'markdown' || this.currentViewerType === 'html') {
      this.currentDisplayMode = 'preview'
      await this._showPreviewMode(content)
    } else {
      // Plain text files start in source mode (readonly)
      this.currentDisplayMode = 'source'
      await this._showSourceMode(content, false)
    }

    this.requestUpdate()
  }

  /**
   * Show preview mode for markdown/html files (rendered view)
   * @param {string} content - file content (optional)
   */
  async _showPreviewMode(content) {
    this.currentDisplayMode = 'preview'

    if (this.currentViewerType === 'markdown') {
      this._showViewer('markdown')

      if (content !== undefined) {
        this.markdownViewer.setMarkdown(content)
      }

      await this._loadAndLockExtractedContent(this.currentOpenFile, this.markdownViewer)
    } else if (this.currentViewerType === 'html') {
      this._showViewer('html')

      if (content !== undefined) {
        this.htmlViewer.setHtml(content)
      }

      await this._loadAndLockExtractedContent(this.currentOpenFile, this.htmlViewer)
    }
  }

  /**
   * Show source mode (CodeMirror with source code)
   * @param {string} content - file content (optional)
   * @param {boolean} editable - whether CodeMirror should be editable
   */
  async _showSourceMode(content, editable = false) {
    this.currentDisplayMode = 'source'
    this.isEditMode = editable

    // Show CodeMirror editor
    this._showViewer('codemirror')

    // Load content into CodeMirror if provided
    if (content !== undefined) {
      this.codeMirrorEditor.setContent(content)
    } else {
      // Get content from current viewer or CodeMirror
      let sourceContent = ''
      if (this.currentViewerType === 'markdown') {
        sourceContent = this.markdownViewer.markdownSource || ''
      } else if (this.currentViewerType === 'html') {
        sourceContent = this.htmlViewer.content || ''
      } else {
        sourceContent = this.codeMirrorEditor.editorView.state.doc.toString()
      }
      this.codeMirrorEditor.setContent(sourceContent)
    }

    // Set editable state
    if (editable) {
      this.codeMirrorEditor.enableEditing()
    } else {
      this.codeMirrorEditor.disableEditing()
    }

    // Load and lock extracted ranges
    await this._loadAndLockExtractedRanges(this.currentOpenFile)
    this.codeMirrorEditor.clearHistory()
  }

  /**
   * Show specific viewer and hide others
   * @param {string} viewer - 'pdf' | 'markdown' | 'html' | 'codemirror'
   */
  _showViewer(viewer) {
    const viewers = ['pdf', 'markdown', 'html', 'codemirror']
    viewers.forEach((v) => {
      const el = this[`${v}Viewer`] || this[`${v}Editor`]
      if (el) {
        if (v === viewer) {
          el.classList.remove('hidden')
        } else {
          el.classList.add('hidden')
        }
      }
    })

    // Handle codemirror special case
    if (viewer === 'codemirror') {
      this.codeMirrorEditor.classList.remove('hidden')
    } else {
      this.codeMirrorEditor?.classList.add('hidden')
    }
  }

  /**
   * Load extracted line ranges from database and lock them in editor
   * @param {string} filePath
   */
  async _loadAndLockExtractedRanges(filePath) {
    if (!window.currentFileLibraryId) {
      console.warn('[loadAndLockExtractedRanges] No library ID set')
      this.codeMirrorEditor.clearLockedLines()
      return
    }

    let rangesResult
    try {
      rangesResult = await window.fileManager.getChildRanges(filePath, window.currentFileLibraryId)
    } catch (error) {
      console.error('[loadAndLockExtractedRanges] Error querying database:', error)
      this.codeMirrorEditor.clearLockedLines()
      throw error
    }

    if (rangesResult.ranges.length === 0) {
      this.codeMirrorEditor.clearLockedLines()
      return
    }

    try {
      this.codeMirrorEditor.lockLineRanges(rangesResult.ranges)
    } catch (error) {
      console.error('[loadAndLockExtractedRanges] Error locking ranges in editor:', error)
      throw error
    }
  }

  /**
   * Load extracted content and lock them in markdown/html viewers
   * @param {string} filePath
   * @param {Object} viewer
   */
  async _loadAndLockExtractedContent(filePath, viewer) {
    try {
      if (!window.currentFileLibraryId) {
        console.warn('No library ID set, cannot load extracted content')
        viewer.clearLockedContent?.()
        return
      }

      const rangesResult = await window.fileManager.getChildRanges(
        filePath,
        window.currentFileLibraryId
      )

      if (rangesResult.success) {
        if (rangesResult.ranges.length > 0) {
          viewer.lockContent?.(rangesResult.ranges)
        } else {
          viewer.clearLockedContent?.()
        }
      } else {
        viewer.clearLockedContent?.()
      }
    } catch (error) {
      console.error('Error loading extracted content:', error)
      viewer.clearLockedContent?.()
    }
  }

  /**
   * Save file handler
   */
  async _handleSave() {
    await this._saveFile()
  }

  /**
   * Save file with optional silent mode (no toast on success)
   * @param {boolean} silent
   */
  async _saveFile(silent = false) {
    if (!this.currentOpenFile) return { success: false, error: 'No file open' }

    try {
      // Check if there are line number changes that need updating
      if (this.codeMirrorEditor.hasRangeChanges) {
        const rangeUpdates = this.codeMirrorEditor.getRangeUpdates()

        if (rangeUpdates.length > 0) {
          const updateResult = await window.fileManager.updateLockedRanges(
            this.currentOpenFile,
            rangeUpdates,
            window.currentFileLibraryId
          )

          if (!updateResult.success) {
            this._showToast(`Error updating line numbers: ${updateResult.error}`, true)
            return { success: false, error: updateResult.error }
          }

          this.codeMirrorEditor.confirmRangeUpdates()
        }
      }

      // Save file content
      const content = this.codeMirrorEditor.getOriginalContent
        ? this.codeMirrorEditor.getOriginalContent()
        : this.codeMirrorEditor.editorView.state.doc.toString()

      const result = await window.fileManager.writeFile(this.currentOpenFile, content)
      if (result.success) {
        this.hasUnsavedChanges = false

        // Update preview viewers with the new content
        if (this.currentViewerType === 'markdown') {
          this.markdownViewer.setMarkdown(content)
        } else if (this.currentViewerType === 'html') {
          this.htmlViewer.setHtml(content)
        }

        if (!silent) {
          this._showToast('File saved successfully!')
        }
        return { success: true }
      } else {
        this._showToast(`Error saving file: ${result.error}`, true)
        return { success: false, error: result.error }
      }
    } catch (error) {
      console.error('Error saving file:', error)
      this._showToast(`Error saving file: ${error.message}`, true)
      return { success: false, error: error.message }
    }
  }

  /**
   * Toggle between preview and source mode
   */
  async _handleToggleEdit() {
    if (!this.currentOpenFile) return
    if (this.currentViewerType === 'pdf') return

    if (this.currentDisplayMode === 'preview') {
      // Switch from preview to source (readonly)
      await this._showSourceMode(undefined, false)
    } else if (this.currentDisplayMode === 'source') {
      // Switch from source back to preview (for markdown/html)
      if (this.currentViewerType === 'markdown' || this.currentViewerType === 'html') {
        if (this.isEditMode && this.hasUnsavedChanges) {
          const confirmed = confirm('You have unsaved changes. Continue without saving?')
          if (!confirmed) return
        }

        this.isEditMode = false
        const content = this.codeMirrorEditor.editorView.state.doc.toString()
        await this._showPreviewMode(content)
      }
    }

    this.requestUpdate()
  }

  /**
   * Edit/Select button handler
   */
  async _handleEditSource() {
    if (!this.currentOpenFile) return
    if (this.currentDisplayMode !== 'source') return

    if (this.isEditMode) {
      // Switch from editable to readonly (Select mode)
      if (this.hasUnsavedChanges) {
        const confirmed = confirm('You have unsaved changes. Discard changes?')
        if (!confirmed) return
      }
      this.isEditMode = false
      this.codeMirrorEditor.disableEditing()
      // Reload content to discard unsaved changes
      const result = await window.fileManager.readFile(this.currentOpenFile)
      if (result.success) {
        this.codeMirrorEditor.setContent(result.content)
        await this._loadAndLockExtractedRanges(this.currentOpenFile)
        this.codeMirrorEditor.clearHistory()
        this.hasUnsavedChanges = false
      }
    } else {
      // Switch from readonly to editable (Edit mode)
      this.isEditMode = true
      this.codeMirrorEditor.enableEditing()
    }

    this.requestUpdate()
  }

  /**
   * Extract button handler
   */
  async _handleExtract() {
    if (!this.currentOpenFile) {
      this._showToast('Please open a file first', true)
      return
    }

    // HTML viewer active
    if (this.htmlViewer && !this.htmlViewer.classList.contains('hidden')) {
      await this._handleSemanticExtraction(this.htmlViewer)
      return
    }

    // Markdown viewer active
    if (this.markdownViewer && !this.markdownViewer.classList.contains('hidden')) {
      await this._handleSemanticExtraction(this.markdownViewer)
      return
    }

    // Default: CodeMirror
    await this._handleCodeMirrorExtraction()
  }

  /**
   * Helper for CodeMirror text extraction
   */
  async _handleCodeMirrorExtraction() {
    if (!this.codeMirrorEditor) {
      this._showToast('CodeMirror editor not found', true)
      return
    }

    if (this.isEditMode === true) {
      this._showToast('Please switch to preview mode before extracting', true)
      return
    }

    // Check if there are unsaved changes or line range changes
    if (this.hasUnsavedChanges || this.codeMirrorEditor.hasRangeChanges) {
      this._showToast('Saving changes before extraction...')
      const saveResult = await this._saveFile(true)
      if (!saveResult.success) {
        this._showToast('Please save your changes before extracting', true)
        return
      }
    }

    const selectedLines = this.codeMirrorEditor.getSelectedLines()
    if (!selectedLines || selectedLines.length === 0) {
      this._showToast('Please select lines to extract', true)
      return
    }

    let selectedText = selectedLines.map((line) => line.text).join('\n')

    if (!selectedText.trim()) {
      this._showToast('Please select text to extract', true)
      return
    }

    // Check if current file is markdown - apply cleaning if needed
    const isMarkdownFile =
      this.currentOpenFile &&
      (this.currentOpenFile.endsWith('.md') || this.currentOpenFile.endsWith('.markdown'))

    if (isMarkdownFile && this.markdownViewer) {
      selectedText = this.markdownViewer.cleanPartialFormatting?.(selectedText) || selectedText
    }

    // Extract line numbers for range tracking
    const rangeStart = selectedLines[0].number
    const rangeEnd = selectedLines[selectedLines.length - 1].number

    if (!window.currentFileLibraryId) {
      this._showToast('Error: Library ID not set. Please reopen the file.', true)
      console.error('currentFileLibraryId is not set')
      return
    }

    try {
      const result = await window.fileManager.extractNote(
        this.currentOpenFile,
        selectedText,
        rangeStart,
        rangeEnd,
        window.currentFileLibraryId
      )
      if (result.success) {
        await this._loadAndLockExtractedRanges(this.currentOpenFile)
        this.codeMirrorEditor.clearHistory()
        this._showToast(`Note extracted to ${result.fileName}`)
      } else {
        this._showToast(`Error: ${result.error}`, true)
      }
    } catch (error) {
      console.error('Error extracting note:', error)
      this._showToast(`Error extracting note: ${error.message}`, true)
    }
  }

  /**
   * Helper for HTML/Markdown semantic extraction
   * @param {Object} viewer
   */
  async _handleSemanticExtraction(viewer) {
    const selection = viewer.getSemanticSelection?.()

    if (!selection || !selection.text) {
      this._showToast('Please select text or a block to extract', true)
      return
    }

    const selectedText = selection.text
    const extractedContent = selection.html || selection.markdown || selectedText

    if (!selectedText.trim()) {
      this._showToast('Please select text to extract', true)
      return
    }

    if (!window.currentFileLibraryId) {
      this._showToast('Error: Library ID not set. Please reopen the file.', true)
      console.error('currentFileLibraryId is not set')
      return
    }

    try {
      const result = await window.fileManager.extractNote(
        this.currentOpenFile,
        extractedContent,
        0,
        0,
        window.currentFileLibraryId
      )

      if (result.success) {
        await this._loadAndLockExtractedContent(this.currentOpenFile, viewer)
        this._showToast(`Note extracted to ${result.fileName}`)
      } else {
        this._showToast(`Error: ${result.error}`, true)
      }
    } catch (error) {
      console.error('Error extracting note:', error)
      this._showToast(`Error extracting note: ${error.message}`, true)
    }
  }

  /**
   * PDF Extract Text button handler
   */
  async _handleExtractText() {
    const pdfPath = this.pdfViewer.getCurrentPdfPath()

    if (!pdfPath || !pdfPath.endsWith('.pdf')) {
      this._showToast('Please open a PDF file first', true)
      return
    }

    const selectedText = this.pdfViewer.getSelectedTextWithLines()

    if (!selectedText || !selectedText.text.trim()) {
      this._showToast('Please select text to extract', true)
      return
    }

    try {
      const result = await window.fileManager.extractPdfText(
        pdfPath,
        selectedText.text,
        selectedText.pageNum,
        selectedText.lineStart,
        selectedText.lineEnd,
        window.currentFileLibraryId
      )

      if (result.success) {
        this._showToast(`Text extracted to ${result.fileName}`)
        await this._reloadPdfExtractedRanges()

        if (selectedText.lineStart !== undefined && selectedText.lineEnd !== undefined) {
          this.pdfViewer.clearLineSelection()
        } else {
          window.getSelection().removeAllRanges()
        }
      } else {
        this._showToast(`Error: ${result.error}`, true)
      }
    } catch (error) {
      console.error('Error extracting text:', error)
      this._showToast(`Error extracting text: ${error.message}`, true)
    }
  }

  /**
   * PDF Extract Page button handler
   */
  async _handleExtractPage() {
    const pdfPath = this.pdfViewer.getCurrentPdfPath()

    if (!pdfPath || !pdfPath.endsWith('.pdf')) {
      this._showToast('Please open a PDF file first', true)
      return
    }

    const selectedPages = this.pdfViewer.getSelectedPages()
    if (!selectedPages || selectedPages.length === 0) {
      this._showToast('Please select pages to extract', true)
      return
    }

    const startPage = Math.min(...selectedPages)
    const endPage = Math.max(...selectedPages)

    if (!window.currentFileLibraryId) {
      this._showToast('Error: Library ID not set. Please reopen the file.', true)
      console.error('currentFileLibraryId is not set')
      return
    }

    try {
      const result = await window.fileManager.extractPdfPages(
        pdfPath,
        startPage,
        endPage,
        window.currentFileLibraryId
      )

      if (result.success) {
        this._showToast(`Pages ${startPage}-${endPage} extracted to ${result.fileName}`)
        await this._reloadPdfExtractedRanges()
        this.pdfViewer.clearPageSelection()
      } else {
        this._showToast(`Error: ${result.error}`, true)
      }
    } catch (error) {
      console.error('Error extracting pages:', error)
      this._showToast(`Error extracting pages: ${error.message}`, true)
    }
  }

  /**
   * Reload PDF extracted ranges
   */
  async _reloadPdfExtractedRanges() {
    const pdfPath = this.pdfViewer.getCurrentPdfPath()

    if (!pdfPath || !pdfPath.endsWith('.pdf')) return

    try {
      const rangesResult = await window.fileManager.getChildRanges(
        pdfPath,
        window.currentFileLibraryId
      )
      if (rangesResult && rangesResult.success) {
        const { extractedPageRanges, extractedLineRanges } = processExtractedRanges(
          rangesResult.ranges
        )

        this.pdfViewer.extractedPageRanges = extractedPageRanges
        this.pdfViewer.extractedLineRanges = extractedLineRanges
      }
    } catch (error) {
      console.error('Error reloading PDF extracted ranges:', error)
    }
  }

  /**
   * Show toast message
   * @param {string} message
   * @param {boolean} isError
   */
  _showToast(message, isError = false) {
    const toast = document.getElementById('toast')
    if (toast) {
      toast.textContent = message
      toast.classList.toggle('error', isError)
      toast.classList.add('show')
      setTimeout(() => {
        toast.classList.remove('show')
      }, 3000)
    }
  }
}

customElements.define('editor-panel', EditorPanel)
