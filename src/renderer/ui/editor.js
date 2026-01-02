// SPDX-FileCopyrightText: 2025 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Editor UI logic extracted from renderer.js
// Handles file editor, preview, and related events

const currentFilePath = document.getElementById('current-file-path')
const saveFileBtn = document.getElementById('save-file-btn')
const toggleEditBtn = document.getElementById('toggle-edit-btn')
const extractBtn = document.getElementById('extract-btn')
const extractTextBtn = document.getElementById('extract-text-btn')
const extractPageBtn = document.getElementById('extract-page-btn')
const editorToolbar = document.getElementById('editor-toolbar')
const codeMirrorEditor = document.querySelector('codemirror-viewer')
const pdfViewer = document.querySelector('pdf-viewer')

// Editor state
let currentOpenFile = null
let isEditMode = false
let hasUnsavedChanges = false

/**
 * Opens a file and displays its content in the editor and preview.
 * @param {string} filePath
 */
export async function openFile(filePath) {
  console.log('[openFile] Starting to open file:', filePath)

  // Step 1: Check for unsaved changes
  if (hasUnsavedChanges) {
    const proceed = confirm('You have unsaved changes. Discard them?')
    if (!proceed) {
      console.log('[openFile] User cancelled due to unsaved changes')
      return
    }
  }

  // Step 2: Sync library IDs if needed
  try {
    if (window.currentWorkspaceLibraryId && !window.currentFileLibraryId) {
      window.currentFileLibraryId = window.currentWorkspaceLibraryId
      console.log(
        '[openFile] Synced file library ID with workspace library ID:',
        window.currentWorkspaceLibraryId
      )
    }
  } catch (error) {
    console.error('[openFile] Error syncing library IDs:', error)
    alert(`Error syncing library IDs: ${error.message}`)
    return
  }

  // Step 3: Check if file is a PDF extract by querying database
  let pdfExtractInfo = null
  try {
    if (window.currentFileLibraryId) {
      console.log('[openFile] Querying extract info for:', filePath)
      const extractInfo = await window.fileManager.getNoteExtractInfo(
        filePath,
        window.currentFileLibraryId
      )

      if (extractInfo && extractInfo.success && extractInfo.found) {
        if (extractInfo.extractType === 'pdf-page') {
          pdfExtractInfo = extractInfo
          console.log('[openFile] Found PDF extract info:', pdfExtractInfo)
        }
      } else {
        console.log('[openFile] No extract info found (normal file)')
      }
    }
  } catch (error) {
    console.error('[openFile] Error querying extract info:', error)
    alert(`Error checking file type: ${error.message}`)
    return
  }

  // Step 4: Determine file type
  const ext = filePath.slice(filePath.lastIndexOf('.'))
  const isPdf = ext === '.pdf'
  console.log('[openFile] File type detected:', { ext, isPdf, isPdfExtract: !!pdfExtractInfo })

  // Step 5: Handle different file types
  if (pdfExtractInfo) {
    await openPdfExtract(filePath, pdfExtractInfo)
  } else if (isPdf) {
    await openRegularPdf(filePath)
  } else {
    await openTextFile(filePath)
  }
}

/**
 * Open a PDF extract file (pages extracted from a PDF)
 */
async function openPdfExtract(filePath, pdfExtractInfo) {
  console.log('[openPdfExtract] Opening PDF extract:', filePath)

  try {
    const { parentPath, rangeStart, rangeEnd } = pdfExtractInfo
    const sourcePdfPath = parentPath

    // Update UI state
    currentOpenFile = filePath
    currentFilePath.textContent = `(Pages ${rangeStart}-${rangeEnd})`
    editorToolbar.classList.remove('hidden')

    // Show PDF viewer
    pdfViewer.classList.remove('hidden')
    codeMirrorEditor.classList.add('hidden')

    // Adjust toolbar buttons
    extractBtn.classList.add('hidden')
    saveFileBtn.classList.add('hidden')
    toggleEditBtn.classList.add('hidden')
    extractTextBtn.classList.remove('hidden')
    extractPageBtn.classList.remove('hidden')

    console.log('[openPdfExtract] UI updated, loading PDF viewer...')
  } catch (error) {
    console.error('[openPdfExtract] Error setting up UI:', error)
    alert(`Error setting up PDF extract viewer: ${error.message}`)
    return
  }

  // Get extracted ranges for the PDF
  let rangesResult = null
  try {
    console.log('[openPdfExtract] Fetching child ranges for source PDF...')
    rangesResult = await window.fileManager.getChildRanges(
      pdfExtractInfo.parentPath,
      window.currentFileLibraryId
    )
    console.log('[openPdfExtract] Child ranges fetched:', rangesResult?.ranges?.length || 0)
  } catch (error) {
    console.error('[openPdfExtract] Error fetching child ranges:', error)
    // Continue without ranges
  }

  // Load PDF viewer
  try {
    console.log('[openPdfExtract] Loading PDF viewer with config...')
    await pdfViewer.loadPdf(pdfExtractInfo.parentPath, {
      pageRange: [pdfExtractInfo.rangeStart, pdfExtractInfo.rangeEnd],
      initialPage: pdfExtractInfo.rangeStart,
      selectedPages: [pdfExtractInfo.rangeStart, pdfExtractInfo.rangeEnd],
      extractedRanges: rangesResult?.success ? rangesResult.ranges : [],
    })
    console.log('[openPdfExtract] PDF extract loaded successfully')
  } catch (error) {
    console.error('[openPdfExtract] Error loading PDF viewer:', error)
    alert(`Error loading PDF: ${error.message}`)
  }
}

/**
 * Open a regular PDF file
 */
async function openRegularPdf(filePath) {
  console.log('[openRegularPdf] Opening regular PDF:', filePath)

  try {
    // Update UI state
    currentOpenFile = filePath
    currentFilePath.textContent = filePath
    editorToolbar.classList.remove('hidden')

    // Show PDF viewer
    codeMirrorEditor.classList.add('hidden')
    pdfViewer.classList.remove('hidden')

    // Adjust toolbar buttons
    extractBtn.classList.add('hidden')
    saveFileBtn.classList.add('hidden')
    toggleEditBtn.classList.add('hidden')
    extractTextBtn.classList.remove('hidden')
    extractPageBtn.classList.remove('hidden')

    console.log('[openRegularPdf] UI updated, loading PDF viewer...')
  } catch (error) {
    console.error('[openRegularPdf] Error setting up UI:', error)
    alert(`Error setting up PDF viewer: ${error.message}`)
    return
  }

  // Get extracted ranges for the PDF
  let rangesResult = null
  try {
    console.log('[openRegularPdf] Fetching child ranges...')
    rangesResult = await window.fileManager.getChildRanges(filePath, window.currentFileLibraryId)
    console.log('[openRegularPdf] Child ranges fetched:', rangesResult?.ranges?.length || 0)
  } catch (error) {
    console.error('[openRegularPdf] Error fetching child ranges:', error)
    // Continue without ranges
  }

  // Load PDF viewer
  try {
    console.log('[openRegularPdf] Loading PDF viewer...')
    await pdfViewer.loadPdf(filePath, {
      extractedRanges: rangesResult?.success ? rangesResult.ranges : [],
    })
    console.log('[openRegularPdf] PDF loaded successfully')
  } catch (error) {
    console.error('[openRegularPdf] Error loading PDF viewer:', error)
    alert(`Error loading PDF: ${error.message}`)
  }
}

/**
 * Open a text file (markdown, txt, etc)
 */
async function openTextFile(filePath) {
  console.log('[openTextFile] Opening text file:', filePath)

  // Read file content
  let result
  try {
    console.log('[openTextFile] Reading file content...')
    result = await window.fileManager.readFile(filePath)
    if (!result.success) {
      console.error('[openTextFile] Failed to read file:', result.error)
      alert(`Error reading file: ${result.error}`)
      return
    }
    console.log('[openTextFile] File read successfully, length:', result.content.length)
  } catch (error) {
    console.error('[openTextFile] Error reading file:', error)
    alert(`Error reading file: ${error.message}`)
    return
  }

  // Update UI state
  try {
    console.log('[openTextFile] Updating UI state...')
    currentOpenFile = filePath
    currentFilePath.textContent = filePath
    editorToolbar.classList.remove('hidden')
    isEditMode = false
    hasUnsavedChanges = false
    toggleEditBtn.textContent = 'Edit'

    // Show text editor
    pdfViewer.classList.add('hidden')
    codeMirrorEditor.classList.remove('hidden')

    // Adjust toolbar buttons
    extractTextBtn.classList.add('hidden')
    extractPageBtn.classList.add('hidden')
    extractBtn.classList.remove('hidden')
    saveFileBtn.classList.add('hidden')
    toggleEditBtn.classList.remove('hidden')

    console.log('[openTextFile] UI updated')
  } catch (error) {
    console.error('[openTextFile] Error updating UI:', error)
    alert(`Error setting up text editor: ${error.message}`)
    return
  }

  // Set content in CodeMirror
  try {
    if (!codeMirrorEditor) {
      throw new Error('CodeMirror editor not found')
    }

    console.log('[openTextFile] Setting content in CodeMirror...')
    codeMirrorEditor.setContent(result.content)
    console.log('[openTextFile] Content set successfully')
  } catch (error) {
    console.error('[openTextFile] Error setting content:', error)
    alert(`Error displaying file content: ${error.message}`)
    return
  }

  // Load and lock extracted line ranges
  try {
    console.log('[openTextFile] Loading extracted ranges...')
    await loadAndLockExtractedRanges(filePath)
    console.log('[openTextFile] Extracted ranges loaded')
  } catch (error) {
    console.error('[openTextFile] Error loading extracted ranges:', error)
    // Continue without locking ranges
  }

  // Finalize editor state
  try {
    console.log('[openTextFile] Finalizing editor state...')
    codeMirrorEditor.disableEditing()
    codeMirrorEditor.clearHistory()
    console.log('[openTextFile] Text file opened successfully')
  } catch (error) {
    console.error('[openTextFile] Error finalizing editor state:', error)
    // Non-critical, continue
  }
}

/**
 * Load extracted line ranges from database and lock them in editor
 * @param {string} filePath - The file path to load ranges for
 */
async function loadAndLockExtractedRanges(filePath) {
  console.log('[loadAndLockExtractedRanges] Starting for:', filePath)

  // Check library ID
  if (!window.currentFileLibraryId) {
    console.warn('[loadAndLockExtractedRanges] No library ID set, cannot load extracted ranges')
    codeMirrorEditor.clearLockedLines()
    return
  }

  console.log('[loadAndLockExtractedRanges] Using library ID:', window.currentFileLibraryId)

  // Get child notes line ranges from database
  let rangesResult
  try {
    console.log('[loadAndLockExtractedRanges] Querying database for child ranges...')
    rangesResult = await window.fileManager.getChildRanges(filePath, window.currentFileLibraryId)
    console.log('[loadAndLockExtractedRanges] Database query result:', {
      success: rangesResult?.success,
      rangeCount: rangesResult?.ranges?.length || 0,
    })
  } catch (error) {
    console.error('[loadAndLockExtractedRanges] Error querying database:', error)
    codeMirrorEditor.clearLockedLines()
    throw error
  }

  // Process ranges result
  if (!rangesResult.success) {
    console.error('[loadAndLockExtractedRanges] Failed to get child ranges:', rangesResult.error)
    codeMirrorEditor.clearLockedLines()
    return
  }

  if (rangesResult.ranges.length === 0) {
    console.log('[loadAndLockExtractedRanges] No extracted ranges found for this file')
    codeMirrorEditor.clearLockedLines()
    return
  }

  // Lock ranges in editor
  try {
    console.log('[loadAndLockExtractedRanges] Locking ranges in editor:', rangesResult.ranges)
    const lockResult = codeMirrorEditor.lockLineRanges(rangesResult.ranges)

    if (lockResult && lockResult.success) {
      console.log(
        '[loadAndLockExtractedRanges] Successfully locked',
        rangesResult.ranges.length,
        'ranges'
      )
    } else {
      console.error('[loadAndLockExtractedRanges] Failed to lock ranges:', lockResult?.error)
      alert(
        `Cannot display child note content: ${lockResult?.error || 'Unknown error'}. The file will open without inline child content.`
      )
    }
  } catch (error) {
    console.error('[loadAndLockExtractedRanges] Error locking ranges in editor:', error)
    throw error
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
        console.log('Updating locked ranges:', rangeUpdates)

        const updateResult = await window.fileManager.updateLockedRanges(
          currentOpenFile,
          rangeUpdates,
          window.currentFileLibraryId
        )

        if (!updateResult.success) {
          showToast(`Error updating line numbers: ${updateResult.error}`, true)
          return { success: false, error: updateResult.error }
        }

        console.log(`Updated ${updateResult.updatedCount} locked ranges`)

        // Confirm update success, set current as new original
        codeMirrorEditor.confirmRangeUpdates()
      }
    }

    // Step 2: Save file content
    // Use getOriginalContent() to exclude temporary expansion lines
    const content = codeMirrorEditor.getOriginalContent
      ? codeMirrorEditor.getOriginalContent()
      : codeMirrorEditor.editorView.state.doc.toString()

    console.log('[saveFile] Saving content, length:', content.length)
    const result = await window.fileManager.writeFile(currentOpenFile, content)
    if (result.success) {
      hasUnsavedChanges = false
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

// Toggle between preview and edit mode
toggleEditBtn.addEventListener('click', () => {
  if (!currentOpenFile) return

  if (!codeMirrorEditor) return

  isEditMode = !isEditMode

  if (isEditMode) {
    codeMirrorEditor.enableEditing()
    toggleEditBtn.textContent = 'Preview'
    extractBtn.classList.add('hidden')
    saveFileBtn.classList.remove('hidden')
  } else {
    codeMirrorEditor.disableEditing()
    toggleEditBtn.textContent = 'Edit'
    extractBtn.classList.remove('hidden')
    saveFileBtn.classList.add('hidden')
  }
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

  const selectedText = selectedLines.map((line) => line.text).join('\n')

  if (!selectedText.trim()) {
    showToast('Please select text to extract', true)
    return
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
    console.log('Extracting note for library:', window.currentFileLibraryId)
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
})

// PDF Extract Text button handler
extractTextBtn.addEventListener('click', async () => {
  if (!currentOpenFile || !currentOpenFile.endsWith('.pdf')) {
    showToast('Please open a PDF file first', true)
    return
  }

  showToast('Text extraction is not yet implemented', true)
  // TODO: Implement PDF text extraction
  // const selectedText = pdfViewer.getSelectedText()
  // if (!selectedText || !selectedText.text.trim()) {
  //   showToast('Please select text to extract', true)
  //   return
  // }
  //
  // try {
  //   const result = await window.fileManager.extractPdfText(
  //     currentOpenFile,
  //     selectedText.text,
  //     selectedText.pageNum,
  //     selectedText.startOffset,
  //     selectedText.endOffset,
  //     window.currentFileLibraryId
  //   )
  //
  //   if (result.success) {
  //     showToast(`Text extracted to ${result.fileName}`)
  //     await reloadPdfExtractedRanges()
  //   } else {
  //     showToast(`Error: ${result.error}`, true)
  //   }
  // } catch (error) {
  //   showToast(`Error extracting text: ${error.message}`, true)
  // }
})

// PDF Extract Page button handler
extractPageBtn.addEventListener('click', async () => {
  if (!currentOpenFile || !currentOpenFile.endsWith('.pdf')) {
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
      currentOpenFile,
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

async function reloadPdfExtractedRanges() {
  if (!currentOpenFile || !currentOpenFile.endsWith('.pdf')) return

  try {
    const rangesResult = await window.fileManager.getChildRanges(
      currentOpenFile,
      window.currentFileLibraryId
    )
    if (rangesResult && rangesResult.success) {
      pdfViewer.lockExtractedRanges(rangesResult.ranges)
    }
  } catch (error) {
    console.error('Error reloading PDF extracted ranges:', error)
  }
}

// Listen for child note open requests from CodeMirror widget badges
window.addEventListener('open-child-note', async (event) => {
  console.log('[open-child-note] Event received:', event.detail)

  const { path: childPath } = event.detail

  // Validate child path
  if (!childPath) {
    console.error('[open-child-note] No child path provided in event')
    showToast('Error: No child note path specified', true)
    return
  }

  // Check workspace root path
  if (!window.currentRootPath) {
    console.error('[open-child-note] No workspace root path set')
    showToast('Cannot open child note: no workspace open', true)
    return
  }

  console.log('[open-child-note] Workspace root:', window.currentRootPath)

  // Construct absolute path
  try {
    const absolutePath = `${window.currentRootPath}/${childPath}`
    console.log('[open-child-note] Constructed absolute path:', absolutePath)

    // Open the child note file
    console.log('[open-child-note] Calling openFile...')
    await openFile(absolutePath)
    console.log('[open-child-note] Child note opened successfully')
  } catch (error) {
    console.error('[open-child-note] Error opening child note:', error)
    showToast(`Error opening child note: ${error.message}`, true)
  }
})
