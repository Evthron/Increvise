// SPDX-FileCopyrightText: 2025 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Feedback buttons - handles the logic for revision feedback workflow
// Manages state and coordinates between revision list and feedback controls

let revisionFiles = []
let currentRevisionIndex = 0

function showToast(message, isError = false) {
  const toast = document.getElementById('toast')
  toast.textContent = message
  toast.classList.toggle('error', isError)
  toast.classList.add('show')
  setTimeout(() => {
    toast.classList.remove('show')
  }, 3000)
}

export function initFeedbackButtons() {
  const reviseFilesBtn = document.getElementById('revise-files')
  const revisionListElement = document.querySelector('revision-list')
  const revisionControls = document.getElementById('revision-controls')
  const currentFileName = document.getElementById('current-file-name')

  // Handle "Revise Files Today" button click
  reviseFilesBtn.addEventListener('click', async () => {
    try {
      const result = await window.fileManager.getAllFilesForRevision()
      if (result.success && result.files.length > 0) {
        revisionFiles = result.files
        currentRevisionIndex = 0

        // Update the revision list component
        if (revisionListElement) {
          revisionListElement.files = result.files
          revisionListElement.currentIndex = 0
        }

        showRevisionFile(0)

        // Set the current file's library ID before opening
        window.currentFileLibraryId = result.files[0].library_id
        console.log('Opening first revision file from library:', result.files[0].library_id)

        const { openFile } = await import('./editor.js')
        await openFile(result.files[0].file_path)

        // Update workspace stats
        const workspaceCounts = {}
        for (const file of result.files) {
          workspaceCounts[file.workspacePath] = (workspaceCounts[file.workspacePath] || 0) + 1
        }
        for (const [workspacePath, count] of Object.entries(workspaceCounts)) {
          await window.fileManager.updateWorkspaceStats(workspacePath, count, count)
        }
      } else if (result.success && result.files.length === 0) {
        showToast('No files due for revision today! 🎉')
        if (revisionListElement) {
          revisionListElement.files = []
        }
      } else {
        showToast(`Error: ${result.error}`, true)
      }
    } catch (error) {
      console.error('Error getting revision files:', error)
      showToast('Error loading revision files', true)
    }
  })

  // Handle file selection from revision list
  document.addEventListener('file-selected', async (e) => {
    const { index } = e.detail
    currentRevisionIndex = index

    // Set the current file's library ID before opening
    if (revisionFiles[index]) {
      window.currentFileLibraryId = revisionFiles[index].library_id
      console.log('Selected revision file from library:', revisionFiles[index].library_id)
    }

    showRevisionFile(index)

    // Open the selected file
    const { openFile } = await import('./editor.js')
    await openFile(revisionFiles[index].file_path)
  })

  // Handle feedback buttons
  document.addEventListener('click', async (e) => {
    if (e.target.classList.contains('feedback-btn')) {
      const feedback = e.target.dataset.feedback
      const currentFile = revisionFiles[currentRevisionIndex]
      if (!currentFile) return

      try {
        const result = await window.fileManager.updateRevisionFeedback(
          currentFile.dbPath,
          currentFile.library_id,
          currentFile.relative_path,
          feedback
        )

        if (result.success) {
          // Remove the reviewed file
          revisionFiles.splice(currentRevisionIndex, 1)

          // Update the revision list component
          if (revisionListElement) {
            revisionListElement.files = revisionFiles
          }

          // Update workspace stats
          const workspaceCounts = {}
          for (const file of revisionFiles) {
            workspaceCounts[file.workspacePath] = (workspaceCounts[file.workspacePath] || 0) + 1
          }
          for (const [workspacePath, count] of Object.entries(workspaceCounts)) {
            await window.fileManager.updateWorkspaceStats(workspacePath, count, count)
          }

          if (revisionFiles.length > 0) {
            // Adjust index if needed
            if (currentRevisionIndex >= revisionFiles.length) {
              currentRevisionIndex = revisionFiles.length - 1
            }

            // Update component index
            if (revisionListElement) {
              revisionListElement.currentIndex = currentRevisionIndex
            }

            showRevisionFile(currentRevisionIndex)

            // Set the current file's library ID before opening
            window.currentFileLibraryId = revisionFiles[currentRevisionIndex].library_id
            console.log(
              'Opening next revision file from library:',
              revisionFiles[currentRevisionIndex].library_id
            )

            const { openFile } = await import('./editor.js')
            await openFile(revisionFiles[currentRevisionIndex].file_path)
          } else {
            // All files reviewed
            showToast('All files reviewed! Great job! 🎉')
            revisionControls.style.display = 'none'
            const { hideToolbar } = await import('./toolbar.js')
            hideToolbar()
            const filePreview = document.getElementById('file-preview')
            if (filePreview) {
              filePreview.textContent = ''
            }
          }
        } else {
          showToast(`Error: ${result.error}`, true)
        }
      } catch (error) {
        console.error('Error updating feedback:', error)
        showToast('Error updating feedback', true)
      }
    }
  })

  function showRevisionFile(index) {
    if (index >= revisionFiles.length) return
    const file = revisionFiles[index]
    const fileName = file.file_path.split('/').pop()
    const workspaceName = file.workspacePath ? file.workspacePath.split('/').pop() : 'Unknown'
    currentFileName.innerHTML = `
      <div class="current-file-header">
        <div class="current-file-title">${fileName}</div>
        <div class="current-file-meta">
          <span class="file-meta-item">
            <span class="meta-icon">📁</span>
            <span>${workspaceName}</span>
          </span>
          <span class="file-meta-separator">•</span>
          <span class="file-meta-item">
            <span class="meta-icon">📊</span>
            <span>${index + 1} of ${revisionFiles.length}</span>
          </span>
        </div>
      </div>
    `
    revisionControls.style.display = 'block'
  }
}
