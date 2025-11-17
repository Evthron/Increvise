// SPDX-FileCopyrightText: 2025 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Editor UI logic extracted from renderer.js
// Handles file editor, preview, and related events

const fileEditor = document.getElementById('file-editor')
const filePreview = document.getElementById('file-preview')
const currentFilePath = document.getElementById('current-file-path')
const saveFileBtn = document.getElementById('save-file-btn')
const toggleEditBtn = document.getElementById('toggle-edit-btn')
const extractBtn = document.getElementById('extract-btn')
const editorToolbar = document.getElementById('editor-toolbar')

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
    const result = await window.fileManager.readFile(filePath)
    if (result.success) {
      currentOpenFile = filePath
      filePreview.textContent = result.content
      fileEditor.value = result.content
      currentFilePath.textContent = filePath
      editorToolbar.classList.remove('hidden')
      filePreview.classList.remove('hidden')
      fileEditor.classList.add('hidden')
      isEditMode = false
      hasUnsavedChanges = false
      toggleEditBtn.textContent = 'Edit'
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
  if (!isEditMode || !currentOpenFile) {
    extractBtn.disabled = true
    return
  }
  const selectedText = fileEditor.value.substring(
    fileEditor.selectionStart,
    fileEditor.selectionEnd
  )
  extractBtn.disabled = selectedText.trim().length === 0
}

saveFileBtn.addEventListener('click', async () => {
  if (!currentOpenFile) return
  try {
    const content = fileEditor.value
    const result = await window.fileManager.writeFile(currentOpenFile, content)
    if (result.success) {
      hasUnsavedChanges = false
      filePreview.textContent = content
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
  isEditMode = !isEditMode
  if (isEditMode) {
    filePreview.classList.add('hidden')
    fileEditor.classList.remove('hidden')
    toggleEditBtn.textContent = 'Preview'
    fileEditor.focus()
  } else {
    fileEditor.classList.add('hidden')
    filePreview.classList.remove('hidden')
    toggleEditBtn.textContent = 'Edit'
  }
})

fileEditor.addEventListener('input', () => {
  if (currentOpenFile) {
    hasUnsavedChanges = true
  }
})

fileEditor.addEventListener('mouseup', updateExtractButtonState)
fileEditor.addEventListener('keyup', updateExtractButtonState)
fileEditor.addEventListener('select', updateExtractButtonState)

extractBtn.addEventListener('click', async () => {
  if (!isEditMode || !currentOpenFile) {
    showToast('Please enter edit mode first', true)
    return
  }
  const selectedText = fileEditor.value.substring(
    fileEditor.selectionStart,
    fileEditor.selectionEnd
  )
  if (!selectedText.trim()) {
    showToast('Please select text to extract', true)
    return
  }
  try {
    const result = await window.fileManager.extractNote(currentOpenFile, selectedText)
    if (result.success) {
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
