// SPDX-FileCopyrightText: 2025 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Editor UI logic extracted from renderer.js
// Handles file editor, preview, and related events

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

const currentFilePath = document.getElementById('current-file-path')
const saveFileBtn = document.getElementById('save-file-btn')
const editSourceBtn = document.getElementById('edit-source-btn')
const toggleEditBtn = document.getElementById('toggle-edit-btn')
const extractBtn = document.getElementById('extract-btn')
const extractTextBtn = document.getElementById('extract-text-btn')
const extractPageBtn = document.getElementById('extract-page-btn')
const editorToolbar = document.getElementById('editor-toolbar')
const codeMirrorEditor = document.querySelector('codemirror-viewer')
const pdfViewer = document.querySelector('pdf-viewer')
const htmlViewer = document.querySelector('html-viewer')
const markdownViewer = document.querySelector('markdown-viewer')

// Editor state
let currentOpenFile = null
let isEditMode = false
let hasUnsavedChanges = false

// Viewer mode state
let currentViewerType = null // 'pdf' | 'markdown' | 'html' | 'text'
let currentDisplayMode = 'preview' // 'preview' | 'source' (for markdown/html/text files)
// isEditMode is used only in 'source' mode to toggle readonly/editable

// Listen for jump to note events from PDF viewer
pdfViewer.addEventListener('pdf-jump-to-note', async (e) => {
  const { notePath } = e.detail
  console.log('Jumping to note:', notePath)

  // Check if path is relative or absolute
  let absolutePath = notePath

  // If path doesn't start with /, it's relative - convert to absolute
  if (!window.currentRootPath) {
    console.error('Cannot jump to note: no workspace root path set')
    showToast('Cannot jump to note: no workspace open', true)
    return
  }
  absolutePath = `${window.currentRootPath}/${notePath}`
  console.log('Resolved absolute path:', absolutePath)

  // Open the note file
  await openFile(absolutePath)
})

/**
 * Open a PDF extract file
 * @param {string} filePath
 * @param {Object} extractInfo
 */
async function openPdfExtract(filePath, extractInfo) {
  console.log('Opening PDF extract file:', filePath)
  console.log('Extract info:', extractInfo)

  const { parentPath, rangeStart, rangeEnd, extractType } = extractInfo
  const sourcePdfPath = parentPath // Absolute path from database

  // Parse range to check if it includes line numbers
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

  // Update UI state
  currentOpenFile = filePath
  currentViewerType = 'pdf'
  currentDisplayMode = 'preview'
  currentFilePath.textContent = displayText
  editorToolbar.classList.remove('hidden')

  // Show PDF viewer, hide others
  pdfViewer.classList.remove('hidden')
  codeMirrorEditor.classList.add('hidden')
  htmlViewer?.classList.add('hidden')
  markdownViewer?.classList.add('hidden')

  // Get extracted ranges for the PDF
  const rangesResult = await window.fileManager.getChildRanges(
    sourcePdfPath,
    window.currentFileLibraryId
  )

  // Convert database ranges to pdfViewer format
  const { extractedPageRanges, extractedLineRanges } = processExtractedRanges(
    rangesResult?.success ? rangesResult.ranges : []
  )

  // Load PDF with all configurations at once (single render!)
  const options = new pdfOptions({
    pageStart: pageStart, // Restrict to extracted pages - start
    pageEnd: pageEnd, // Restrict to extracted pages - end
    extractedPageRanges: extractedPageRanges, // Already extracted pages
    extractedLineRanges: extractedLineRanges, // Already extracted line ranges
  })

  console.log('Final pdfOptions:', options)
  await pdfViewer.loadPdf(sourcePdfPath, options)

  console.log('PDF extract loaded with configuration:', {
    pageStart,
    pageEnd,
    extractedPageRanges: extractedPageRanges.length,
    extractedLineRangesPages: extractedLineRanges.size,
  })

  updateToolbarButtons()
}

/**
 * Open a regular PDF file
 * @param {string} filePath
 */
async function openRegularPdf(filePath) {
  currentOpenFile = filePath
  currentViewerType = 'pdf'
  currentDisplayMode = 'preview'
  currentFilePath.textContent = filePath
  editorToolbar.classList.remove('hidden')

  // Hide text editor and other viewers, show PDF viewer
  codeMirrorEditor.classList.add('hidden')
  htmlViewer?.classList.add('hidden')
  markdownViewer?.classList.add('hidden')
  pdfViewer.classList.remove('hidden')

  // Get extracted ranges for the PDF
  const rangesResult = await window.fileManager.getChildRanges(
    filePath,
    window.currentFileLibraryId
  )

  // Convert database ranges to pdfViewer format
  const { extractedPageRanges, extractedLineRanges } = processExtractedRanges(
    rangesResult?.success ? rangesResult.ranges : []
  )

  // Load PDF with extracted ranges (single render!)
  await pdfViewer.loadPdf(
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

  updateToolbarButtons()
}

/**
 * Open a text file (markdown, html, or other text formats)
 * @param {string} filePath
 * @param {string} content
 */
async function openTextFile(filePath, content) {
  currentOpenFile = filePath
  currentFilePath.textContent = filePath
  editorToolbar.classList.remove('hidden')
  isEditMode = false
  hasUnsavedChanges = false

  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()

  // Determine viewer type
  if (ext === '.md' || ext === '.markdown') {
    currentViewerType = 'markdown'
  } else if (ext === '.html' || ext === '.htm') {
    currentViewerType = 'html'
  } else {
    currentViewerType = 'text'
  }

  // Default to preview mode (for markdown/html) or source readonly mode (for text)
  if (currentViewerType === 'markdown' || currentViewerType === 'html') {
    currentDisplayMode = 'preview'
    await showPreviewMode(content)
  } else {
    // Plain text files start in source mode (readonly)
    currentDisplayMode = 'source'
    await showSourceMode(content, false) // false = readonly
  }

  updateToolbarButtons()
}

/**
 * Show preview mode for markdown/html files (rendered view)
 * @param {string} content - file content (optional, uses current viewer content if not provided)
 */
async function showPreviewMode(content) {
  currentDisplayMode = 'preview'

  if (currentViewerType === 'markdown') {
    markdownViewer.classList.remove('hidden')
    htmlViewer.classList.add('hidden')
    codeMirrorEditor.classList.add('hidden')
    pdfViewer.classList.add('hidden')

    if (content !== undefined) {
      markdownViewer.setMarkdown(content)
    }

    await loadAndLockExtractedContent(currentOpenFile, markdownViewer)
  } else if (currentViewerType === 'html') {
    htmlViewer.classList.remove('hidden')
    markdownViewer.classList.add('hidden')
    codeMirrorEditor.classList.add('hidden')
    pdfViewer.classList.add('hidden')

    if (content !== undefined) {
      htmlViewer.setHtml(content)
    }

    await loadAndLockExtractedContent(currentOpenFile, htmlViewer)
  }
}

/**
 * Show source mode (CodeMirror with source code)
 * @param {string} content - file content (optional)
 * @param {boolean} editable - whether CodeMirror should be editable
 */
async function showSourceMode(content, editable = false) {
  currentDisplayMode = 'source'
  isEditMode = editable

  // Hide all preview viewers
  markdownViewer.classList.add('hidden')
  htmlViewer.classList.add('hidden')
  pdfViewer.classList.add('hidden')

  // Show CodeMirror editor
  codeMirrorEditor.classList.remove('hidden')

  // Load content into CodeMirror if provided
  if (content !== undefined) {
    codeMirrorEditor.setContent(content)
  } else {
    // Get content from current viewer or CodeMirror
    let sourceContent = ''
    if (currentViewerType === 'markdown') {
      sourceContent = markdownViewer.markdownSource || ''
    } else if (currentViewerType === 'html') {
      sourceContent = htmlViewer.content || ''
    } else {
      sourceContent = codeMirrorEditor.editorView.state.doc.toString()
    }
    codeMirrorEditor.setContent(sourceContent)
  }

  // Set editable state
  if (editable) {
    codeMirrorEditor.enableEditing()
  } else {
    codeMirrorEditor.disableEditing()
  }

  // Load and lock extracted ranges
  await loadAndLockExtractedRanges(currentOpenFile)
  codeMirrorEditor.clearHistory()
}

/**
 * Update toolbar buttons based on current viewer type and display mode
 *
 * Button visibility states:
 * - PDF mode: [Extract Text] [Extract Page]
 * - Preview mode (markdown/html rendered): [Extract] [View Source]
 * - Source mode readonly (markdown/html/text source): [Extract] [Edit] [Preview]
 * - Source mode editable: [Save] [Select] [Preview]
 */
function updateToolbarButtons() {
  if (currentViewerType === 'pdf') {
    // PDF mode: [Extract Text] [Extract Page]
    extractBtn.classList.add('hidden')
    saveFileBtn.classList.add('hidden')
    editSourceBtn.classList.add('hidden')
    toggleEditBtn.classList.add('hidden')
    extractTextBtn.classList.remove('hidden')
    extractPageBtn.classList.remove('hidden')
  } else if (currentDisplayMode === 'preview') {
    // Preview mode (markdown/html rendered): [Extract] [View Source]
    extractTextBtn.classList.add('hidden')
    extractPageBtn.classList.add('hidden')
    extractBtn.classList.remove('hidden')
    saveFileBtn.classList.add('hidden')
    editSourceBtn.classList.add('hidden')
    toggleEditBtn.classList.remove('hidden')
    toggleEditBtn.textContent = 'View Source'
  } else if (currentDisplayMode === 'source') {
    // Source mode
    extractTextBtn.classList.add('hidden')
    extractPageBtn.classList.add('hidden')
    toggleEditBtn.classList.remove('hidden')
    toggleEditBtn.textContent = 'Preview'

    if (isEditMode) {
      // Source editable: [Save] [Select] [Preview]
      extractBtn.classList.add('hidden')
      saveFileBtn.classList.remove('hidden')
      editSourceBtn.classList.remove('hidden')
      editSourceBtn.textContent = 'Select'
    } else {
      // Source readonly: [Extract] [Edit] [Preview]
      extractBtn.classList.remove('hidden')
      saveFileBtn.classList.add('hidden')
      editSourceBtn.classList.remove('hidden')
      editSourceBtn.textContent = 'Edit'
    }
  }
}

/**
 * Opens a file and displays its content in the editor and preview.
 * @param {string} filePath
 */
export async function openFile(filePath) {
  try {
    if (hasUnsavedChanges) {
      const proceed = confirm('You have unsaved changes. Discard them?')
      if (!proceed) return
    }

    // If opening via file tree (not revision mode), sync fileLibraryId with workspaceLibraryId
    // This ensures files opened through the workspace tree use the workspace's library ID
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
      await openPdfExtract(filePath, pdfExtractInfo)
    } else if (isPdf) {
      // Regular PDF file
      await openRegularPdf(filePath)
    } else {
      // Text file (markdown, html, or other)
      pdfViewer.resetView?.()
      const result = await window.fileManager.readFile(filePath)
      if (!result.success) {
        alert(`Error reading file: ${result.error}`)
        return
      }
      await openTextFile(filePath, result.content)
    }
  } catch (error) {
    console.error('[openFile] Error opening file:', error)
    alert(`Error opening file: ${error.message}`)
  }
}

/**
 * Load extracted line ranges from database and lock them in editor
 * @param {string} filePath - The file path to load ranges for
 */
async function loadAndLockExtractedRanges(filePath) {
  // Check library ID
  if (!window.currentFileLibraryId) {
    console.warn('[loadAndLockExtractedRanges] No library ID set')
    codeMirrorEditor.clearLockedLines()
    return
  }

  // Get child notes line ranges from database
  let rangesResult
  try {
    rangesResult = await window.fileManager.getChildRanges(filePath, window.currentFileLibraryId)
  } catch (error) {
    console.error('[loadAndLockExtractedRanges] Error querying database:', error)
    codeMirrorEditor.clearLockedLines()
    throw error
  }

  if (rangesResult.ranges.length === 0) {
    codeMirrorEditor.clearLockedLines()
    return
  }

  // Lock ranges in editor
  try {
    codeMirrorEditor.lockLineRanges(rangesResult.ranges)
  } catch (error) {
    console.error('[loadAndLockExtractedRanges] Error locking ranges in editor:', error)
    throw error
  }
}

/**
 * Load extracted content and lock them in markdown/html viewers
 * @param {string} filePath aka file path to load extracted content for
 * @param {Object} viewer aka viewer component (markdownViewer or htmlViewer)
 */
async function loadAndLockExtractedContent(filePath, viewer) {
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

function showToast(message, isError = false) {
  const toast = document.getElementById('toast')
  toast.textContent = message
  toast.classList.toggle('error', isError)
  toast.classList.add('show')
  setTimeout(() => {
    toast.classList.remove('show')
  }, 3000)
}

function updateExtractButtonState() {
  if (!currentOpenFile) {
    extractBtn.disabled = true
    return
  }
  extractBtn.disabled = false
}

// Save file with optional silent mode (no toast on success)
async function saveFile(silent = false) {
  if (!currentOpenFile) return { success: false, error: 'No file open' }

  try {
    // Step 1: Check if there are line number changes that need updating
    if (codeMirrorEditor.hasRangeChanges) {
      const rangeUpdates = codeMirrorEditor.getRangeUpdates()

      if (rangeUpdates.length > 0) {
        const updateResult = await window.fileManager.updateLockedRanges(
          currentOpenFile,
          rangeUpdates,
          window.currentFileLibraryId
        )

        if (!updateResult.success) {
          showToast(`Error updating line numbers: ${updateResult.error}`, true)
          return { success: false, error: updateResult.error }
        }

        // Confirm update success, set current as new original
        codeMirrorEditor.confirmRangeUpdates()
      }
    }

    // Step 2: Save file content
    // Use getOriginalContent() to exclude temporary expansion lines
    const content = codeMirrorEditor.getOriginalContent
      ? codeMirrorEditor.getOriginalContent()
      : codeMirrorEditor.editorView.state.doc.toString()

    const result = await window.fileManager.writeFile(currentOpenFile, content)
    if (result.success) {
      hasUnsavedChanges = false

      // Update preview viewers with the new content
      if (currentViewerType === 'markdown') {
        markdownViewer.setMarkdown(content)
      } else if (currentViewerType === 'html') {
        htmlViewer.setHtml(content)
      }

      if (!silent) {
        showToast('File saved successfully!')
      }
      return { success: true }
    } else {
      showToast(`Error saving file: ${result.error}`, true)
      return { success: false, error: result.error }
    }
  } catch (error) {
    console.error('Error saving file:', error)
    showToast(`Error saving file: ${error.message}`, true)
    return { success: false, error: error.message }
  }
}

saveFileBtn.addEventListener('click', async () => {
  await saveFile()
})

// Toggle between preview and source mode
// - From preview: switch to source readonly
// - From source: switch back to preview
toggleEditBtn.addEventListener('click', async () => {
  if (!currentOpenFile) return

  // PDF files don't have preview/source toggle
  if (currentViewerType === 'pdf') return

  if (!codeMirrorEditor) return

  if (currentDisplayMode === 'preview') {
    // Switch from preview to source (readonly)
    await showSourceMode(undefined, false)
  } else if (currentDisplayMode === 'source') {
    // Switch from source back to preview (for markdown/html)
    if (currentViewerType === 'markdown' || currentViewerType === 'html') {
      // If in edit mode with unsaved changes, warn user
      if (isEditMode && hasUnsavedChanges) {
        const confirmed = confirm('You have unsaved changes. Continue without saving?')
        if (!confirmed) return
      }

      isEditMode = false
      const content = codeMirrorEditor.editorView.state.doc.toString()
      await showPreviewMode(content)
    }
  }

  updateToolbarButtons()
})

// Edit/Select button: toggle between readonly and editable in source mode
editSourceBtn.addEventListener('click', async () => {
  if (!currentOpenFile) return
  if (currentDisplayMode !== 'source') return

  if (isEditMode) {
    // Switch from editable to readonly (Select mode)
    if (hasUnsavedChanges) {
      const confirmed = confirm('You have unsaved changes. Discard changes?')
      if (!confirmed) return
    }
    isEditMode = false
    codeMirrorEditor.disableEditing()
    // Reload content to discard unsaved changes
    const result = await window.fileManager.readFile(currentOpenFile)
    if (result.success) {
      codeMirrorEditor.setContent(result.content)
      await loadAndLockExtractedRanges(currentOpenFile)
      codeMirrorEditor.clearHistory()
      hasUnsavedChanges = false
    }
  } else {
    // Switch from readonly to editable (Edit mode)
    isEditMode = true
    codeMirrorEditor.enableEditing()
  }

  updateToolbarButtons()
})

// Listen for content changes in CodeMirror
codeMirrorEditor.addEventListener('content-changed', () => {
  if (currentOpenFile && isEditMode) {
    hasUnsavedChanges = true
  }
})

extractBtn.addEventListener('click', async () => {
  if (!currentOpenFile) {
    showToast('Please open a file first', true)
    return
  }

  // 1) HTML viewer active
  if (htmlViewer && !htmlViewer.classList.contains('hidden')) {
    await handleSemanticExtraction(htmlViewer)
    return
  }

  // 2) Markdown viewer active
  if (markdownViewer && !markdownViewer.classList.contains('hidden')) {
    await handleSemanticExtraction(markdownViewer)
    return
  }

  // 3) Default: CodeMirror (text files or edit mode)
  await handleCodeMirrorExtraction()
})

// Helper for CodeMirror text extraction (text/markdown/html in editor mode)
async function handleCodeMirrorExtraction() {
  if (!codeMirrorEditor) {
    showToast('CodeMirror editor not found', true)
    return
  }

  if (isEditMode === true) {
    showToast('Please switch to preview mode before extracting', true)
    return
  }

  // Check if there are unsaved changes or line range changes
  if (hasUnsavedChanges || codeMirrorEditor.hasRangeChanges) {
    showToast('Saving changes before extraction...')
    const saveResult = await saveFile(true)
    if (!saveResult.success) {
      showToast('Please save your changes before extracting', true)
      return
    }
  }

  const selectedLines = codeMirrorEditor.getSelectedLines()
  if (!selectedLines || selectedLines.length === 0) {
    showToast('Please select lines to extract', true)
    return
  }

  let selectedText = selectedLines.map((line) => line.text).join('\n')

  if (!selectedText.trim()) {
    showToast('Please select text to extract', true)
    return
  }

  // Check if current file is markdown - if so, apply markdown cleaning
  const isMarkdownFile =
    currentOpenFile && (currentOpenFile.endsWith('.md') || currentOpenFile.endsWith('.markdown'))

  if (isMarkdownFile && markdownViewer) {
    // Apply markdown formatting cleanup using MarkdownViewer's cleaning logic
    selectedText = markdownViewer.cleanPartialFormatting?.(selectedText) || selectedText
  }

  // Extract line numbers for range tracking
  const rangeStart = selectedLines[0].number
  const rangeEnd = selectedLines[selectedLines.length - 1].number

  // Defensive check: ensure library ID is set
  if (!window.currentFileLibraryId) {
    showToast('Error: Library ID not set. Please reopen the file.', true)
    console.error('currentFileLibraryId is not set')
    return
  }

  try {
    const result = await window.fileManager.extractNote(
      currentOpenFile,
      selectedText,
      rangeStart,
      rangeEnd,
      window.currentFileLibraryId
    )
    if (result.success) {
      // Reload and lock all extracted ranges (including the new one)
      await loadAndLockExtractedRanges(currentOpenFile)

      // Clear undo history after extraction to prevent undoing the extraction
      // This is necessary because extraction creates permanent database records
      // and child files that cannot be automatically rolled back
      codeMirrorEditor.clearHistory()

      showToast(`Note extracted to ${result.fileName}`)
      // Optionally, refresh the file tree here if needed
    } else {
      showToast(`Error: ${result.error}`, true)
    }
  } catch (error) {
    console.error('Error extracting note:', error)
    showToast(`Error extracting note: ${error.message}`, true)
  }
}

// helper for HTML/Markdown semantic extraction
async function handleSemanticExtraction(viewer) {
  const selection = viewer.getSemanticSelection?.()

  if (!selection || !selection.text) {
    showToast('Please select text or a block to extract', true)
    return
  }
  // selected text is for check length,
  // selected html/markdown is for extraction with formatting
  const selectedText = selection.text
  const extractedContent = selection.html || selection.markdown || selectedText

  if (!selectedText.trim()) {
    showToast('Please select text to extract', true)
    return
  }

  if (!window.currentFileLibraryId) {
    showToast('Error: Library ID not set. Please reopen the file.', true)
    console.error('currentFileLibraryId is not set')
    return
  }

  try {
    const result = await window.fileManager.extractNote(
      currentOpenFile,
      extractedContent,
      0,
      0,
      window.currentFileLibraryId
    )

    if (result.success) {
      await loadAndLockExtractedContent(currentOpenFile, viewer)
      showToast(`Note extracted to ${result.fileName}`)
    } else {
      showToast(`Error: ${result.error}`, true)
    }
  } catch (error) {
    console.error('Error extracting note:', error)
    showToast(`Error extracting note: ${error.message}`, true)
  }
}

// PDF Extract Text button handler
extractTextBtn.addEventListener('click', async () => {
  // Get the current PDF path from pdfViewer
  const pdfPath = pdfViewer.getCurrentPdfPath()

  if (!pdfPath || !pdfPath.endsWith('.pdf')) {
    showToast('Please open a PDF file first', true)
    return
  }

  // First try to get line-based selection
  const selectedText = pdfViewer.getSelectedTextWithLines()

  if (!selectedText || !selectedText.text.trim()) {
    showToast('Please select text to extract', true)
    return
  }

  try {
    // Extract with line numbers if available
    const result = await window.fileManager.extractPdfText(
      pdfPath,
      selectedText.text,
      selectedText.pageNum,
      selectedText.lineStart,
      selectedText.lineEnd,
      window.currentFileLibraryId
    )

    if (result.success) {
      showToast(`Text extracted to ${result.fileName}`)
      await reloadPdfExtractedRanges()

      // Clear line selection if it was used (check if lineStart and lineEnd exist)
      if (selectedText.lineStart !== undefined && selectedText.lineEnd !== undefined) {
        pdfViewer.clearLineSelection()
      } else {
        // Clear text selection
        window.getSelection().removeAllRanges()
      }
    } else {
      showToast(`Error: ${result.error}`, true)
    }
  } catch (error) {
    console.error('Error extracting text:', error)
    showToast(`Error extracting text: ${error.message}`, true)
  }
})

// PDF Extract Page button handler
extractPageBtn.addEventListener('click', async () => {
  // Get the current PDF path from pdfViewer
  const pdfPath = pdfViewer.getCurrentPdfPath()

  if (!pdfPath || !pdfPath.endsWith('.pdf')) {
    showToast('Please open a PDF file first', true)
    return
  }

  const selectedPages = pdfViewer.getSelectedPages()
  if (!selectedPages || selectedPages.length === 0) {
    showToast('Please select pages to extract', true)
    return
  }

  const startPage = Math.min(...selectedPages)
  const endPage = Math.max(...selectedPages)

  if (!window.currentFileLibraryId) {
    showToast('Error: Library ID not set. Please reopen the file.', true)
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
      showToast(`Pages ${startPage}-${endPage} extracted to ${result.fileName}`)
      // Reload extracted ranges
      await reloadPdfExtractedRanges()
      // Clear selection
      pdfViewer.clearPageSelection()
    } else {
      showToast(`Error: ${result.error}`, true)
    }
  } catch (error) {
    console.error('Error extracting pages:', error)
    showToast(`Error extracting pages: ${error.message}`, true)
  }
})

// Listen for extraction events from markdown/html viewers
document.addEventListener('extract-requested', async (e) => {
  const { text, viewerType } = e.detail

  if (!window.currentFileLibraryId) {
    showToast('Error: Library ID not set', true)
    return
  }

  try {
    const result = await window.fileManager.extractNote(
      currentOpenFile,
      text,
      0,
      0,
      window.currentFileLibraryId
    )

    if (result.success) {
      const viewer = viewerType === 'markdown' ? markdownViewer : htmlViewer
      await loadAndLockExtractedContent(currentOpenFile, viewer)
      showToast(`Note extracted to ${result.fileName}`)
    }
  } catch (error) {
    showToast(`Error: ${error.message}`, true)
  }
})

async function reloadPdfExtractedRanges() {
  // Get the current PDF path from pdfViewer
  const pdfPath = pdfViewer.getCurrentPdfPath()

  if (!pdfPath || !pdfPath.endsWith('.pdf')) return

  try {
    const rangesResult = await window.fileManager.getChildRanges(
      pdfPath,
      window.currentFileLibraryId
    )
    if (rangesResult && rangesResult.success) {
      // Convert database ranges to pdfViewer format
      const { extractedPageRanges, extractedLineRanges } = processExtractedRanges(
        rangesResult.ranges
      )

      // Update the PDF viewer with new extracted ranges
      pdfViewer.extractedPageRanges = extractedPageRanges
      pdfViewer.extractedLineRanges = extractedLineRanges
    }
  } catch (error) {
    console.error('Error reloading PDF extracted ranges:', error)
  }
}

// Listen for child note open requests from CodeMirror widget badges
window.addEventListener('open-child-note', async (event) => {
  const { path: childPath } = event.detail

  // Validate child path
  if (!childPath) {
    console.error('[open-child-note] No child path provided')
    showToast('Error: No child note path specified', true)
    return
  }

  // Check workspace root path
  if (!window.currentRootPath) {
    console.error('[open-child-note] No workspace root path set')
    showToast('Cannot open child note: no workspace open', true)
    return
  }

  // Construct absolute path
  try {
    const absolutePath = `${window.currentRootPath}/${childPath}`
    await openFile(absolutePath)
  } catch (error) {
    console.error('[open-child-note] Error:', error)
    showToast(`Error opening child note: ${error.message}`, true)
  }
})
