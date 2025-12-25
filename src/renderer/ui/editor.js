// SPDX-FileCopyrightText: 2025 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Editor UI logic extracted from renderer.js
// Handles file editor, preview, and related events

const currentFilePath = document.getElementById('current-file-path')
const saveFileBtn = document.getElementById('save-file-btn')
const toggleEditBtn = document.getElementById('toggle-edit-btn')
const extractBtn = document.getElementById('extract-btn')
const editorToolbar = document.getElementById('editor-toolbar')
const codeMirrorEditor = document.querySelector('codemirror-viewer')

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

    const result = await window.fileManager.readFile(filePath)
    if (result.success) {
      currentOpenFile = filePath
      currentFilePath.textContent = filePath
      editorToolbar.classList.remove('hidden')
      isEditMode = false
      hasUnsavedChanges = false
      toggleEditBtn.textContent = 'Edit'

      if (codeMirrorEditor) {
        codeMirrorEditor.setContent(result.content)
        codeMirrorEditor.clearLockedLines()
        codeMirrorEditor.disableEditing()
      }
    } else {
      alert(`Error reading file: ${result.error}`)
    }
  } catch (error) {
    console.error('Error opening file:', error)
    alert(`Error opening file: ${error.message}`)
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

saveFileBtn.addEventListener('click', async () => {
  if (!currentOpenFile) return
  try {
    const content = codeMirrorEditor.editorView.state.doc.toString()
    const result = await window.fileManager.writeFile(currentOpenFile, content)
    if (result.success) {
      hasUnsavedChanges = false
      showToast('File saved successfully!')
    } else {
      showToast(`Error saving file: ${result.error}`, true)
    }
  } catch (error) {
    console.error('Error saving file:', error)
    showToast(`Error saving file: ${error.message}`, true)
  }
})

toggleEditBtn.addEventListener('click', () => {
  if (!currentOpenFile) return

  if (!codeMirrorEditor) return

  isEditMode = !isEditMode

  if (isEditMode) {
    codeMirrorEditor.enableEditing()
    toggleEditBtn.textContent = 'Preview'
  } else {
    codeMirrorEditor.disableEditing()
    toggleEditBtn.textContent = 'Edit'
  }
})

// codeMirrorEditor.addEventListener('input', () => {
//   if (currentOpenFile) {
//     hasUnsavedChanges = true
//   }
// })

extractBtn.addEventListener('click', async () => {
  if (!currentOpenFile) {
    showToast('Please open a file first', true)
    return
  }

  if (!codeMirrorEditor) {
    showToast('CodeMirror editor not found', true)
    return
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
      codeMirrorEditor.lockSelectedLines()
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
