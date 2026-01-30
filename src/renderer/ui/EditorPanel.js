// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Editor Panel Lit component
// Manages file editor, preview, and related events

import { LitElement, html, css } from 'lit'
import { pdfOptions } from './pdfViewer.js'
import { videoOptions } from './VideoViewer.js'

/**
 * Convert database extractedRanges to pdfViewer-ready format
 * @param {Array} ranges - Raw ranges from database (getChildRanges result)
 * @returns {{extractedPages: Set<number>, extractedLineRanges: Map<number, Array>}}
 */
function processExtractedRanges(ranges) {
  const extractedPages = new Set()
  const extractedLineRanges = new Map()

  for (const range of ranges) {
    // Handle pdf-page extracts (whole page extracts)
    if (range.extract_type === 'pdf-page') {
      const startPage = parseInt(range.start)
      const endPage = parseInt(range.end)

      // Add all pages in the range
      for (let page = startPage; page <= endPage; page++) {
        extractedPages.add(page)
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

  return { extractedPages, extractedLineRanges }
}

/**
 * Convert database extractedRanges to videoViewer-ready format
 * @param {Array} ranges - Raw ranges from database (getChildRanges result)
 * @returns {Array<{start: number, end: number, notePath: string}>}
 */
function processVideoExtractedRanges(ranges) {
  const extractedRanges = []

  for (const range of ranges) {
    if (range.extract_type === 'video-clip') {
      extractedRanges.push({
        start: parseInt(range.start),
        end: parseInt(range.end),
        notePath: range.path,
      })
    }
  }

  return extractedRanges
}

export class EditorPanel extends LitElement {
  static properties = {
    currentOpenFile: { type: String, state: true },
    currentFilePath: { type: String, state: true },
    isEditMode: { type: Boolean, state: true },
    currentViewerType: { type: String, state: true }, // 'pdf' | 'markdown' | 'html' | 'text' | 'video' | 'flashcard'
    currentDisplayMode: { type: String, state: true }, // 'preview' | 'source'
    currentQueue: { type: String, state: true }, // Current file's queue name
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
    this.currentViewerType = null
    this.currentDisplayMode = 'preview'
    this.currentQueue = null
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
    this.videoViewer = this.shadowRoot.querySelector('slot[name="video"]').assignedElements()[0]
    this.flashcardViewer = this.shadowRoot
      .querySelector('slot[name="flashcard"]')
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
        <slot name="video"></slot>
        <slot name="flashcard"></slot>
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
    } else if (this.currentViewerType === 'video') {
      // Video mode: [Extract Clip]
      return html`<button @click=${this._handleExtractVideoClip}>Extract Clip</button>`
    } else if (this.currentViewerType === 'flashcard') {
      // Flashcard mode: no action buttons
      return html``
    } else if (this.currentDisplayMode === 'preview') {
      // Preview mode (markdown/html rendered): [Extract] [View Source]
      // Add [Cloze] button if in intermediate queue
      return html`
        <button @click=${this._handleExtract}>Extract</button>
        ${this.currentQueue === 'intermediate'
          ? html`<button @click=${this._handleCloze}>Cloze</button>`
          : ''}
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
        // Source readonly: [Extract] [Cloze (if intermediate)] [Edit] [Preview]
        return html`
          <button @click=${this._handleExtract}>Extract</button>
          ${this.currentQueue === 'intermediate'
            ? html`<button @click=${this._handleCloze}>Cloze</button>`
            : ''}
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
      if (this.codeMirrorEditor.hasUnsavedChanges) {
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
      let flashcardExtractInfo = null
      let videoExtractInfo = null

      if (window.currentFileLibraryId) {
        const extractInfo = await window.fileManager.getNoteExtractInfo(
          filePath,
          window.currentFileLibraryId
        )

        console.log('[openFile] Extract info check:', {
          filePath,
          success: extractInfo?.success,
          found: extractInfo?.found,
          extractType: extractInfo?.extractType,
        })

        if (extractInfo && extractInfo.success && extractInfo.found) {
          // Check extract type and assign to appropriate variable
          if (extractInfo.extractType === 'pdf-page') {
            pdfExtractInfo = extractInfo
            console.log('[openFile] ✓ Detected PDF extract')
          } else if (extractInfo.extractType === 'flashcard') {
            flashcardExtractInfo = extractInfo
            console.log('[openFile] ✓ Detected FLASHCARD extract')
          } else if (extractInfo.extractType === 'video-clip') {
            videoExtractInfo = extractInfo
            console.log('[openFile] ✓ Detected video extract')
          }
        }
      }

      // Determine file type and dispatch to appropriate handler
      const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
      const isPdf = ext === '.pdf'
      const isVideo = ['.mp4', '.webm', '.ogg', '.mov'].includes(ext)

      console.log('[openFile] Routing decision:', {
        ext,
        isPdf,
        isVideo,
        hasPdfExtract: !!pdfExtractInfo,
        hasFlashcard: !!flashcardExtractInfo,
        hasVideoExtract: !!videoExtractInfo,
        willRoute: pdfExtractInfo
          ? 'PDF extract'
          : flashcardExtractInfo
            ? 'Flashcard'
            : videoExtractInfo
              ? 'Video extract'
              : isPdf
                ? 'Regular PDF'
                : isVideo
                  ? 'Regular Video'
                  : 'Text file',
      })

      if (pdfExtractInfo) {
        // PDF extract file
        await this._openPdfExtract(filePath, pdfExtractInfo)
      } else if (flashcardExtractInfo) {
        // Flashcard file
        await this._openFlashcard(filePath, flashcardExtractInfo)
      } else if (videoExtractInfo) {
        // Video extract file
        await this._openVideoClip(filePath, videoExtractInfo)
      } else if (isPdf) {
        // Regular PDF file
        await this._openRegularPdf(filePath)
      } else if (isVideo) {
        // Regular video file
        await this._openRegularVideo(filePath)
      } else {
        // Text file (markdown, html, or other)
        this.pdfViewer?.resetView?.()
        const result = await window.fileManager.readFile(filePath)
        if (!result.success) {
          alert(`Error reading file: ${result.error}`)
          console.error('Error reading file:', result.error)
          return
        }
        await this._openTextFile(filePath, result.content)
      }

      // Check if the opened file is in a queue
      // Load queue info to determine if we should show Cloze button
      if (window.currentFileLibraryId) {
        try {
          const queueResult = await window.fileManager.getFileQueue(
            filePath,
            window.currentFileLibraryId
          )
          if (queueResult && queueResult.queueName) {
            this.currentQueue = queueResult.queueName
          } else {
            this.currentQueue = null
          }
        } catch (error) {
          console.error('Error getting file queue:', error)
          this.currentQueue = null
        }
      }

      // Check if the opened file is in the revision queue
      // If so, show feedback buttons (implements requirement B)
      const feedbackBar = document.querySelector('feedback-bar')
      if (feedbackBar) {
        feedbackBar.checkAndShowFeedbackIfInQueue(filePath)
      }
    } catch (error) {
      console.error('[openFile] Error opening file:', error)
      alert(`Error opening file: ${error.message}`)
      console.error('Error opening file:', error)
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

    const isTextExtract = typeof rangeStart === 'string' && rangeStart.includes(':')
    if (isTextExtract) {
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

    // Filter ranges to only those within the current extract range
    const filteredRangesResult = rangesResult
      .filter((range) => range.start >= pageStart && range.end <= pageEnd)
      .filter((range) => !(range.start === pageStart && range.end === pageEnd))

    // Convert database ranges to pdfViewer format
    const { extractedPages, extractedLineRanges } = processExtractedRanges(
      filteredRangesResult || []
    )
    // The last read page is the page of the furthest extracted range, so the reader can continue extracting
    const lastReadPage = extractedPages.size > 0 ? Math.max(...extractedPages) : pageStart

    // Load PDF with all configurations at once
    const options = new pdfOptions({
      pageStart: pageStart,
      pageEnd: pageEnd,
      lastReadPage: lastReadPage,
      extractedPages: extractedPages,
      extractedLineRanges: extractedLineRanges,
    })

    console.log('Final pdfOptions:', options)
    await this.pdfViewer.loadPdf(sourcePdfPath, options)

    console.log('PDF extract loaded with configuration:', {
      pageStart,
      pageEnd,
      extractedPages: extractedPages.length,
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
    const { extractedPages, extractedLineRanges } = processExtractedRanges(rangesResult || [])

    // The last read page is the page of the furthest extracted range, so the reader can continue extracting
    const lastReadPage = extractedPages.size > 0 ? Math.max(...extractedPages) : 1
    // Load PDF with extracted ranges
    await this.pdfViewer.loadPdf(
      filePath,
      new pdfOptions({
        lastReadPage: lastReadPage,
        extractedPages: extractedPages,
        extractedLineRanges: extractedLineRanges,
      })
    )

    console.log('Regular PDF loaded with extracted ranges:', {
      extractedPages: extractedPages.length,
      extractedLineRangesPages: extractedLineRanges.size,
    })

    this.requestUpdate()
  }

  /**
   * Open a flashcard file
   * @param {string} filePath
   * @param {Object} extractInfo
   */
  async _openFlashcard(filePath, extractInfo) {
    console.log('[_openFlashcard] Opening flashcard file:', filePath)
    console.log('[_openFlashcard] Extract info:', extractInfo)

    const { parentPath, rangeStart, rangeEnd } = extractInfo
    const displayText = 'Flashcard'

    // Update state
    this.currentOpenFile = filePath
    this.currentViewerType = 'flashcard'
    this.currentDisplayMode = 'preview'
    this.currentFilePath = displayText

    console.log('[_openFlashcard] State updated, showing flashcard viewer')

    // Show flashcard viewer, hide others
    this._showViewer('flashcard')

    console.log('[_openFlashcard] Calling loadFlashcard...')

    // Load flashcard content
    try {
      await this.flashcardViewer.loadFlashcard(filePath, extractInfo)
      console.log('[_openFlashcard] ✓ Flashcard loaded successfully')
    } catch (error) {
      console.error('[_openFlashcard] ✗ Error loading flashcard:', error)
    }

    console.log('[_openFlashcard] Flashcard opened:', {
      parentPath,
      charStart: rangeStart,
      charEnd: rangeEnd,
    })

    this.requestUpdate()
  }

  /**
   * Open a video clip extract file
   * @param {string} filePath
   * @param {Object} extractInfo
   */
  async _openVideoClip(filePath, extractInfo) {
    console.log('Opening video clip extract file:', filePath)
    console.log('Extract info:', extractInfo)

    const { parentPath, rangeStart, rangeEnd } = extractInfo
    const sourceVideoPath = parentPath

    const startTime = parseInt(rangeStart)
    const endTime = parseInt(rangeEnd)
    const displayText = `Video Clip (${this._formatTime(startTime)} - ${this._formatTime(endTime)})`

    // Update state
    this.currentOpenFile = filePath
    this.currentViewerType = 'video'
    this.currentDisplayMode = 'preview'
    this.currentFilePath = displayText

    // Show video viewer, hide others
    this._showViewer('video')

    // Get extracted ranges for the video
    const rangesResult = await window.fileManager.getChildRanges(
      sourceVideoPath,
      window.currentFileLibraryId
    )

    // Convert database ranges to videoViewer format
    const extractedRanges = processVideoExtractedRanges(rangesResult || [])

    // Load video with time restriction
    const options = new videoOptions({
      timeStart: startTime,
      timeEnd: endTime,
      extractedRanges: extractedRanges,
    })

    console.log('Final videoOptions:', options)
    await this.videoViewer.loadVideo(sourceVideoPath, options)

    console.log('Video clip loaded with configuration:', {
      startTime,
      endTime,
      extractedRanges: extractedRanges.length,
    })

    this.requestUpdate()
  }

  /**
   * Open a regular video file
   * @param {string} filePath
   */
  async _openRegularVideo(filePath) {
    this.currentOpenFile = filePath
    this.currentViewerType = 'video'
    this.currentDisplayMode = 'preview'
    this.currentFilePath = filePath

    // Show video viewer, hide others
    this._showViewer('video')

    // Get extracted ranges for the video
    const rangesResult = await window.fileManager.getChildRanges(
      filePath,
      window.currentFileLibraryId
    )

    // Convert database ranges to videoViewer format
    const extractedRanges = processVideoExtractedRanges(rangesResult || [])

    // Load video with extracted ranges
    await this.videoViewer.loadVideo(
      filePath,
      new videoOptions({
        extractedRanges: extractedRanges,
      })
    )

    console.log('Regular video loaded with extracted ranges:', {
      extractedRanges: extractedRanges.length,
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
    this.codeMirrorEditor.hasUnsavedChanges = false

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
   * @param {string} viewer - 'pdf' | 'markdown' | 'html' | 'codemirror' | 'video' | 'flashcard'
   */
  _showViewer(viewer) {
    const viewers = ['pdf', 'markdown', 'html', 'codemirror', 'video', 'flashcard']
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

    if (!rangesResult || rangesResult.length === 0) {
      this.codeMirrorEditor.clearLockedLines()
      return
    }

    try {
      this.codeMirrorEditor.lockLineRanges(rangesResult)
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

      if (rangesResult && rangesResult.length > 0) {
        viewer.lockContent?.(rangesResult)
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
    const saveResult = await this.codeMirrorEditor.saveFile(this.currentOpenFile)
    if (saveResult.success) {
      this._showToast('File saved')
      return
    } else {
      this._showToast(saveResult.error || 'Error saving file', true)
      return
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
        if (this.isEditMode && this.codeMirrorEditor.hasUnsavedChanges) {
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
      if (this.codeMirrorEditor.hasUnsavedChanges) {
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
    if (!this.htmlViewer.classList.contains('hidden')) {
      const result = await this.htmlViewer.extractSelection(this.currentOpenFile)
      if (!result.success) {
        this._showToast(result.error || 'Extraction failed', true)
      } else {
        // Success: reload locked content, show toast, refresh file manager
        await this._loadAndLockExtractedContent(this.currentOpenFile, this.htmlViewer)
        this._showToast('Note extracted successfully')
        this._refreshFileManager()
      }
      return
    }

    // Markdown viewer active
    if (!this.markdownViewer.classList.contains('hidden')) {
      const result = await this.markdownViewer.extractSelection(this.currentOpenFile)
      if (!result.success) {
        this._showToast(result.error || 'Extraction failed', true)
      } else {
        // Success: reload locked content, show toast, refresh file manager
        await this._loadAndLockExtractedContent(this.currentOpenFile, this.markdownViewer)
        this._showToast('Note extracted successfully')
        this._refreshFileManager()
      }
      return
    }

    // Check edit mode
    if (this.isEditMode === true) {
      this._showToast('Please switch to extract mode before extracting', true)
      return
    }

    // Check if there are unsaved changes or line range changes
    if (this.codeMirrorEditor.hasUnsavedChanges || this.codeMirrorEditor.hasRangeChanges) {
      this._showToast('Saving changes before extraction...')
      const saveResult = await this.codeMirrorEditor.saveFile(this.currentOpenFile)
      if (saveResult.success) {
        this._showToast('File saved')
        return
      } else {
        this._showToast(saveResult.error || 'Error saving file', true)
        return
      }
    }

    // Call CodeMirror extraction
    const result = await this.codeMirrorEditor.extractSelection(this.currentOpenFile)
    if (!result.success) {
      this._showToast(result.error || 'Extraction failed', true)
    } else {
      await this._loadAndLockExtractedRanges(this.currentOpenFile)
      this.codeMirrorEditor.clearHistory()
      this._showToast('Note extracted successfully')
      this._refreshFileManager()
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
        // Refresh file manager to show the new extracted note
        this._refreshFileManager()
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
        // Refresh file manager to show the new extracted note
        this._refreshFileManager()
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
      if (rangesResult) {
        const { extractedPages, extractedLineRanges } = processExtractedRanges(rangesResult)

        this.pdfViewer.extractedPages = extractedPages
        this.pdfViewer.extractedLineRanges = extractedLineRanges
      }
    } catch (error) {
      console.error('Error reloading PDF extracted ranges:', error)
    }
  }

  /**
   * Handle Cloze button click - create flashcard from selection
   */
  async _handleCloze() {
    if (!this.currentOpenFile) {
      this._showToast('Please open a file first', true)
      return
    }

    // Debug: Log current viewer state
    console.log('[Cloze] Current viewer state:', {
      viewerType: this.currentViewerType,
      displayMode: this.currentDisplayMode,
      htmlHidden: this.htmlViewer?.classList.contains('hidden'),
      markdownHidden: this.markdownViewer?.classList.contains('hidden'),
      codeMirrorHidden: this.codeMirrorEditor?.classList.contains('hidden'),
    })

    // Get selection based on current viewer
    let selectedText = ''
    let charStart = -1
    let charEnd = -1

    // HTML viewer active
    if (this.htmlViewer && !this.htmlViewer.classList.contains('hidden')) {
      console.log('[Cloze] Attempting HTML viewer selection')
      const selection = this._getHtmlViewerSelection()
      if (!selection) {
        this._showToast('Please select text to create a flashcard', true)
        return
      }
      selectedText = selection.text
      charStart = selection.charStart
      charEnd = selection.charEnd
    }
    // Markdown viewer active
    else if (this.markdownViewer && !this.markdownViewer.classList.contains('hidden')) {
      console.log('[Cloze] Attempting Markdown viewer selection')
      const selection = this._getMarkdownViewerSelection()
      if (!selection) {
        this._showToast('Please select text to create a flashcard', true)
        return
      }
      selectedText = selection.text
      charStart = selection.charStart
      charEnd = selection.charEnd
    }
    // CodeMirror active
    else if (this.codeMirrorEditor && !this.codeMirrorEditor.classList.contains('hidden')) {
      console.log('[Cloze] Attempting CodeMirror selection')
      const selection = this._getCodeMirrorSelection()
      if (!selection) {
        this._showToast('Please select text to create a flashcard', true)
        return
      }
      selectedText = selection.text
      charStart = selection.charStart
      charEnd = selection.charEnd
    } else {
      this._showToast('Cannot create flashcard in current view mode', true)
      return
    }

    console.log('[Cloze] Selection extracted:', {
      text: selectedText.substring(0, 50) + '...',
      charStart,
      charEnd,
    })

    if (!selectedText.trim()) {
      this._showToast('Please select text to create a flashcard', true)
      return
    }

    if (!window.currentFileLibraryId) {
      this._showToast('Error: Library ID not set. Please reopen the file.', true)
      console.error('currentFileLibraryId is not set')
      return
    }

    try {
      console.log('[Cloze] Calling extractFlashcard with:', {
        file: this.currentOpenFile,
        textLength: selectedText.length,
        charStart,
        charEnd,
        libraryId: window.currentFileLibraryId,
      })

      const result = await window.fileManager.extractFlashcard(
        this.currentOpenFile,
        selectedText,
        charStart,
        charEnd,
        window.currentFileLibraryId
      )

      console.log('[Cloze] extractFlashcard result:', result)

      if (result.success) {
        this._showToast(`Flashcard created: ${result.fileName}`)
        console.log('[Cloze] ✓ Flashcard created successfully:', result.filePath)
        // Clear selection
        window.getSelection().removeAllRanges()
        // Refresh file manager to show the new flashcard
        this._refreshFileManager()
      } else {
        this._showToast(`Error: ${result.error}`, true)
        console.error('[Cloze] ✗ Failed to create flashcard:', result.error)
      }
    } catch (error) {
      console.error('[Cloze] ✗ Exception creating flashcard:', error)
      this._showToast(`Error creating flashcard: ${error.message}`, true)
    }
  }

  /**
   * Get selection from HTML viewer with character positions
   * @returns {{text: string, charStart: number, charEnd: number} | null}
   */
  _getHtmlViewerSelection() {
    const content = this.htmlViewer.content || ''
    const selection = window.getSelection()
    const selectedText = selection.toString().trim()

    console.log('[HTML Selection] Debug info:', {
      rangeCount: selection.rangeCount,
      isCollapsed: selection.isCollapsed,
      selectionText: selectedText,
      selectionLength: selectedText.length,
      contentLength: content.length,
      hasContent: !!content,
    })

    // Check if there's actually selected text first
    if (!selectedText) {
      console.log('[HTML Selection] No text selected')
      return null
    }

    if (!selection.rangeCount || selection.isCollapsed) {
      // Sometimes the selection object reports isCollapsed=true but we have text
      // This can happen with certain selection APIs, so let's trust the text
      console.log(
        '[HTML Selection] Selection reports collapsed, but we have text - continuing anyway'
      )
    }

    // Try multiple strategies to find the selection in source
    let charStart = -1

    // Strategy 1: Exact match
    charStart = content.indexOf(selectedText)

    if (charStart === -1) {
      // Strategy 2: Normalized whitespace
      console.log('[HTML Selection] Trying normalized whitespace match')
      const normalizedSelected = selectedText.replace(/\s+/g, ' ')
      const normalizedContent = content.replace(/\s+/g, ' ')
      const normalizedStart = normalizedContent.indexOf(normalizedSelected)

      if (normalizedStart !== -1) {
        // Map back to original position
        let charCount = 0
        let normalizedCount = 0
        for (let i = 0; i < content.length; i++) {
          if (normalizedCount === normalizedStart) {
            charStart = i
            break
          }
          charCount++
          if (!/\s/.test(content[i]) || (i > 0 && !/\s/.test(content[i - 1]))) {
            normalizedCount++
          }
        }
        console.log('[HTML Selection] Found via normalized whitespace')
      }
    }

    if (charStart === -1) {
      // Strategy 3: Strip HTML tags and match
      console.log('[HTML Selection] Trying HTML tag stripping')
      const strippedContent = content.replace(/<[^>]*>/g, '')
      const strippedStart = strippedContent.indexOf(selectedText)

      if (strippedStart !== -1) {
        // Map back to position in original content
        let strippedPos = 0
        for (let i = 0; i < content.length; i++) {
          if (strippedPos === strippedStart) {
            charStart = i
            break
          }
          if (content[i] === '<') {
            // Skip to end of tag
            const tagEnd = content.indexOf('>', i)
            if (tagEnd !== -1) {
              i = tagEnd
              continue
            }
          }
          strippedPos++
        }
        console.log('[HTML Selection] Found via HTML stripping')
      }
    }

    if (charStart === -1) {
      // Strategy 4: Match first significant words (at least 3)
      console.log('[HTML Selection] Trying partial word match')
      const words = selectedText.split(/\s+/).filter((w) => w.length > 2)
      if (words.length >= 3) {
        const firstWords = words.slice(0, 3).join('.*')
        const regex = new RegExp(firstWords, 'i')
        const match = content.match(regex)
        if (match) {
          charStart = match.index
          console.log('[HTML Selection] Found via partial word match')
        }
      }
    }

    if (charStart === -1) {
      this._showToast(
        'Could not locate selection in source. Please use source view (CodeMirror) for precise selection.',
        true
      )
      return null
    }

    const charEnd = charStart + selectedText.length

    return {
      text: selectedText,
      charStart,
      charEnd,
    }
  }

  /**
   * Get selection from Markdown viewer with character positions
   * @returns {{text: string, charStart: number, charEnd: number} | null}
   */
  _getMarkdownViewerSelection() {
    const content = this.markdownViewer.markdownSource || ''
    const selection = window.getSelection()
    const selectedText = selection.toString().trim()

    console.log('[Markdown Selection] Debug info:', {
      rangeCount: selection.rangeCount,
      isCollapsed: selection.isCollapsed,
      selectionText: selectedText,
      selectionLength: selectedText.length,
      contentLength: content.length,
      hasContent: !!content,
    })

    // Check if there's actually selected text first
    if (!selectedText) {
      console.log('[Markdown Selection] No text selected')
      return null
    }

    if (!selection.rangeCount || selection.isCollapsed) {
      // Sometimes the selection object reports isCollapsed=true but we have text
      console.log(
        '[Markdown Selection] Selection reports collapsed, but we have text - continuing anyway'
      )
    }

    // Try multiple strategies to find the selection in markdown source
    let charStart = -1

    // Strategy 1: Exact match
    charStart = content.indexOf(selectedText)

    if (charStart === -1) {
      // Strategy 2: Normalized whitespace
      console.log('[Markdown Selection] Trying normalized whitespace match')
      const normalizedSelected = selectedText.replace(/\s+/g, ' ')
      const normalizedContent = content.replace(/\s+/g, ' ')
      const normalizedStart = normalizedContent.indexOf(normalizedSelected)

      if (normalizedStart !== -1) {
        // Map back to original position
        let charCount = 0
        let normalizedCount = 0
        for (let i = 0; i < content.length; i++) {
          if (normalizedCount === normalizedStart) {
            charStart = i
            break
          }
          charCount++
          if (!/\s/.test(content[i]) || (i > 0 && !/\s/.test(content[i - 1]))) {
            normalizedCount++
          }
        }
        console.log('[Markdown Selection] Found via normalized whitespace')
      }
    }

    if (charStart === -1) {
      // Strategy 3: Strip markdown formatting
      console.log('[Markdown Selection] Trying markdown stripping')
      // Remove common markdown syntax: bold, italic, links, headings
      const strippedContent = content
        .replace(/\*\*(.+?)\*\*/g, '$1') // bold
        .replace(/\*(.+?)\*/g, '$1') // italic
        .replace(/__(.+?)__/g, '$1') // bold alt
        .replace(/_(.+?)_/g, '$1') // italic alt
        .replace(/\[(.+?)\]\(.+?\)/g, '$1') // links
        .replace(/^#+\s+/gm, '') // headings
        .replace(/`(.+?)`/g, '$1') // inline code

      const strippedStart = strippedContent.indexOf(selectedText)

      if (strippedStart !== -1) {
        // Approximate position (may not be exact due to removed syntax)
        charStart = strippedStart
        console.log('[Markdown Selection] Found via markdown stripping (approximate)')
      }
    }

    if (charStart === -1) {
      // Strategy 4: Match first significant words (at least 3)
      console.log('[Markdown Selection] Trying partial word match')
      const words = selectedText.split(/\s+/).filter((w) => w.length > 2)
      if (words.length >= 3) {
        const firstWords = words.slice(0, 3).join('.*?')
        const regex = new RegExp(firstWords, 'i')
        const match = content.match(regex)
        if (match) {
          charStart = match.index
          console.log('[Markdown Selection] Found via partial word match')
        }
      }
    }

    if (charStart === -1) {
      this._showToast(
        'Could not locate selection in markdown source. Please use source view (CodeMirror) for precise selection.',
        true
      )
      return null
    }

    const charEnd = charStart + selectedText.length

    return {
      text: selectedText,
      charStart,
      charEnd,
    }
  }

  /**
   * Get selection from CodeMirror with character positions
   * @returns {{text: string, charStart: number, charEnd: number} | null}
   */
  _getCodeMirrorSelection() {
    const view = this.codeMirrorEditor.editorView
    const state = view.state
    const selection = state.selection.main

    console.log('[CodeMirror Selection]', {
      empty: selection.empty,
      from: selection.from,
      to: selection.to,
    })

    if (selection.empty) {
      return null
    }

    const selectedText = state.sliceDoc(selection.from, selection.to)

    if (!selectedText.trim()) {
      return null
    }

    return {
      text: selectedText,
      charStart: selection.from,
      charEnd: selection.to,
    }
  }

  /**
   * Video Extract Clip button handler
   */
  async _handleExtractVideoClip() {
    const videoPath = this.videoViewer.getCurrentVideoPath()

    if (!videoPath) {
      this._showToast('Please open a video file first', true)
      return
    }

    const timeRange = this.videoViewer.getSelectedTimeRange()

    if (!timeRange || timeRange.start === null || timeRange.end === null) {
      this._showToast('Please set start and end times', true)
      return
    }

    if (timeRange.start >= timeRange.end) {
      this._showToast('Start time must be before end time', true)
      return
    }

    if (!window.currentFileLibraryId) {
      this._showToast('Error: Library ID not set. Please reopen the file.', true)
      console.error('currentFileLibraryId is not set')
      return
    }

    try {
      const result = await window.fileManager.extractVideoClip(
        videoPath,
        timeRange.start,
        timeRange.end,
        window.currentFileLibraryId
      )

      if (result.success) {
        this._showToast(
          `Clip ${this._formatTime(timeRange.start)}-${this._formatTime(timeRange.end)} extracted to ${result.fileName}`
        )
        await this._reloadVideoExtractedRanges()
        // Refresh file manager to show the new extracted note
        this._refreshFileManager()
      } else {
        this._showToast(`Error: ${result.error}`, true)
      }
    } catch (error) {
      console.error('Error extracting video clip:', error)
      this._showToast(`Error extracting video clip: ${error.message}`, true)
    }
  }

  /**
   * Reload video extracted ranges
   */
  async _reloadVideoExtractedRanges() {
    const videoPath = this.videoViewer.getCurrentVideoPath()

    if (!videoPath) return

    try {
      const rangesResult = await window.fileManager.getChildRanges(
        videoPath,
        window.currentFileLibraryId
      )
      if (rangesResult) {
        const extractedRanges = processVideoExtractedRanges(rangesResult)
        this.videoViewer.extractedRanges = extractedRanges
      }
    } catch (error) {
      console.error('Error reloading video extracted ranges:', error)
    }
  }

  /**
   * Format time in seconds to HH:MM:SS
   * @param {number} seconds
   * @returns {string}
   */
  _formatTime(seconds) {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  /**
   * Refresh file manager to show newly extracted notes
   */
  _refreshFileManager() {
    const fileManager = document.querySelector('file-manager')
    if (fileManager && typeof fileManager.refreshCurrentWorkspace === 'function') {
      fileManager.refreshCurrentWorkspace()
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
