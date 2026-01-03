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

    // Check if file is a regular PDF
    const ext = filePath.slice(filePath.lastIndexOf('.'))
    const isPdf = ext === '.pdf'

    if (pdfExtractInfo) {
      // Open PDF extract file
      console.log('Opening PDF extract file:', filePath)
      console.log('Extract info:', pdfExtractInfo)

      const { parentPath, rangeStart, rangeEnd } = pdfExtractInfo
      const sourcePdfPath = parentPath // Absolute path from database

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

      // Get extracted ranges for the PDF
      const rangesResult = await window.fileManager.getChildRanges(
        sourcePdfPath,
        window.currentFileLibraryId
      )
      pdfViewer.resetView?.()
      // Load PDF with all configurations at once (single render!)
      await pdfViewer.loadPdf(sourcePdfPath, {
        pageRange: [rangeStart, rangeEnd], // Restrict to extracted pages
        initialPage: rangeStart, // Start at first extracted page
        selectedPages: [rangeStart, rangeEnd], // Highlight extracted pages
        extractedRanges: rangesResult?.success ? rangesResult.ranges : [], // Lock extracted ranges
      })

      console.log('PDF extract loaded with configuration:', {
        pageRange: [rangeStart, rangeEnd],
        initialPage: rangeStart,
        extractedRanges: rangesResult?.success ? rangesResult.ranges.length : 0,
      })
    } else if (isPdf) {
      // Open regular PDF file
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

      // Get extracted ranges for the PDF
      const rangesResult = await window.fileManager.getChildRanges(
        filePath,
        window.currentFileLibraryId
      )
      pdfViewer.resetView?.()
      // Load PDF with extracted ranges (single render!)
      await pdfViewer.loadPdf(filePath, {
        extractedRanges: rangesResult?.success ? rangesResult.ranges : [],
      })

      console.log(
        'Regular PDF loaded with extracted ranges:',
        rangesResult?.success ? rangesResult.ranges.length : 0
      )
    } else {
      pdfViewer.resetView?.()
      const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
      const result = await window.fileManager.readFile(filePath)
      if (result.success) {
        currentOpenFile = filePath
        currentFilePath.textContent = filePath
        editorToolbar.classList.remove('hidden')
        isEditMode = false
        hasUnsavedChanges = false
        toggleEditBtn.textContent = 'Edit'
        // Hide PDF viewer, show text editor
        pdfViewer.classList.add('hidden')
        codeMirrorEditor.classList.remove('hidden')
        // Adjust toolbar buttons
        extractTextBtn.classList.add('hidden')
        extractPageBtn.classList.add('hidden')
        extractBtn.classList.remove('hidden')
        saveFileBtn.classList.remove('hidden')
        toggleEditBtn.classList.remove('hidden')
        if (codeMirrorEditor) {
          codeMirrorEditor.setContent(result.content)
          // Load and lock extracted line ranges from database
          await loadAndLockExtractedRanges(filePath)
          codeMirrorEditor.disableEditing()
          pdfViewer.resetView?.()
          if (ext === '.md' || ext === '.markdown') {
            // Show pdf-viewer in markdown mode
            codeMirrorEditor.classList.add('hidden')
            pdfViewer.classList.remove('hidden')
            pdfViewer.contentType = 'markdown'
            pdfViewer.content = result.content
            pdfViewer.requestUpdate()
          } else if (ext === '.html' || ext === '.htm') {
            // Show pdf-viewer in html mode
            codeMirrorEditor.classList.add('hidden')
            pdfViewer.classList.remove('hidden')
            pdfViewer.contentType = 'html'
            pdfViewer.content = result.content
            pdfViewer.requestUpdate()
          } else {
            // Default: show text editor
            pdfViewer.classList.add('hidden')
            codeMirrorEditor.classList.remove('hidden')
            extractTextBtn.classList.add('hidden')
            extractPageBtn.classList.add('hidden')
            extractBtn.classList.remove('hidden')
            saveFileBtn.classList.remove('hidden')
            toggleEditBtn.classList.remove('hidden')

            if (codeMirrorEditor) {
              codeMirrorEditor.setContent(result.content)
              await loadAndLockExtractedRanges(filePath)
              codeMirrorEditor.disableEditing()
            }
          }
        }
      } else {
        alert(`Error reading file: ${result.error}`)
      }
    }
  } catch (error) {
    console.error('[openTextFile] Error loading extracted ranges:', error)
    // Continue without locking ranges
  }

  // Finalize editor state
  codeMirrorEditor.disableEditing()
  codeMirrorEditor.clearHistory()
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
