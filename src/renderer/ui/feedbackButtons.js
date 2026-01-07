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
  const revisionListElement = document.querySelector('revision-list')
  const revisionControls = document.getElementById('revision-controls')
  const currentFileName = document.getElementById('current-file-name')

  // Listen for revise-files-requested event from file-manager component
  document.addEventListener('revise-files-requested', async () => {
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

        const editorPanel = document.querySelector('editor-panel')
        if (editorPanel) {
          await editorPanel.openFile(result.files[0].file_path)
        }

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
    const editorPanel = document.querySelector('editor-panel')
    if (editorPanel) {
      await editorPanel.openFile(revisionFiles[index].file_path)
    }
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

            const editorPanel = document.querySelector('editor-panel')
            if (editorPanel) {
              await editorPanel.openFile(revisionFiles[currentRevisionIndex].file_path)
            }
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

  async function updateFileRank(newRank) {
    const file = revisionFiles[currentRevisionIndex]
    if (!file) return

    const clampedRank = Math.max(1, Math.min(100, Math.round(newRank)))

    try {
      const result = await window.fileManager.updateFileRank(
        file.file_path,
        file.library_id,
        clampedRank
      )

      if (result && result.success) {
        file.rank = clampedRank

        // Re-sort files by rank within the same day
        revisionFiles.sort((a, b) => {
          const dateA = new Date(a.due_time)
          const dateB = new Date(b.due_time)
          if (dateA.toDateString() === dateB.toDateString()) {
            return (a.rank || 70) - (b.rank || 70)
          }
          return dateA - dateB
        })

        // Update the revision list component
        if (revisionListElement) {
          revisionListElement.files = revisionFiles
          revisionListElement.currentIndex = revisionFiles.indexOf(file)
        }

        // Update current index
        currentRevisionIndex = revisionFiles.indexOf(file)

        showRevisionFile(currentRevisionIndex)
        showToast(`Rank updated to ${clampedRank}`)
      } else {
        showToast('Failed to update rank', true)
      }
    } catch (error) {
      console.error('Error updating rank:', error)
      showToast('Error updating rank', true)
    }
  }

  function showRevisionFile(index) {
    if (index >= revisionFiles.length) return
    const file = revisionFiles[index]
    const fileName = file.file_path.split('/').pop()
    const workspaceName = file.workspacePath ? file.workspacePath.split('/').pop() : 'Unknown'
    const rank = Math.round(file.rank || 70)

    // Calculate order number within the same day
    const dueDate = new Date(file.due_time).toDateString()
    const sameDayFiles = revisionFiles.filter(
      (f) => new Date(f.due_time).toDateString() === dueDate
    )
    sameDayFiles.sort((a, b) => (a.rank || 70) - (b.rank || 70))
    const orderNumber = sameDayFiles.indexOf(file) + 1

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
          <span class="file-meta-separator">•</span>
          <span class="file-meta-item" title="Order within today's revisions">
            <span class="meta-icon">🔢</span>
            <span>Order #${orderNumber}</span>
          </span>
          <span class="file-meta-separator">•</span>
          <span class="file-meta-item rank-control" title="Priority rank (1-100)">
            <span class="meta-icon">⭐</span>
            <button class="rank-btn rank-decrease" data-action="decrease" title="Decrease rank">−</button>
            <input type="number" class="rank-input" value="${rank}" min="1" max="100" title="Enter rank (1-100)">
            <button class="rank-btn rank-increase" data-action="increase" title="Increase rank">+</button>
          </span>
        </div>
      </div>
    `

    // Add event listeners for rank controls
    const rankInput = currentFileName.querySelector('.rank-input')
    const rankDecrease = currentFileName.querySelector('.rank-decrease')
    const rankIncrease = currentFileName.querySelector('.rank-increase')

    if (rankInput) {
      rankInput.addEventListener('change', (e) => {
        updateFileRank(parseInt(e.target.value))
      })
      rankInput.addEventListener('click', (e) => e.stopPropagation())
    }

    if (rankDecrease) {
      rankDecrease.addEventListener('click', (e) => {
        e.stopPropagation()
        updateFileRank(rank - 1)
      })
    }

    if (rankIncrease) {
      rankIncrease.addEventListener('click', (e) => {
        e.stopPropagation()
        updateFileRank(rank + 1)
      })
    }

    revisionControls.style.display = 'block'
  }
}
