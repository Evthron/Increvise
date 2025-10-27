const selectFolderBtn = document.getElementById('select-folder')
const treeContainer = document.getElementById('tree-container')
const reviseFilesBtn = document.getElementById('revise-files')
const revisionList = document.getElementById('revision-list')
const revisionControls = document.getElementById('revision-controls')
const currentFileName = document.getElementById('current-file-name')
const workspaceHistoryList = document.getElementById('workspace-history-list')

const editorToolbar = document.getElementById('editor-toolbar')
const currentFilePath = document.getElementById('current-file-path')
const fileEditor = document.getElementById('file-editor')
const filePreview = document.getElementById('file-preview')
const saveFileBtn = document.getElementById('save-file-btn')
const toggleEditBtn = document.getElementById('toggle-edit-btn')
const extractBtn = document.getElementById('extract-btn')
const toast = document.getElementById('toast')

let currentRootPath = null
let currentFolderPath = null
let revisionFiles = []
let currentRevisionIndex = 0

let currentOpenFile = null
let isEditMode = false
let hasUnsavedChanges = false

function showToast(message, isError = false) {
  toast.textContent = message
  toast.classList.toggle('error', isError)
  toast.classList.add('show')
  
  setTimeout(() => {
    toast.classList.remove('show')
  }, 3000)
}

if (!selectFolderBtn) {
  console.error('Select folder button not found in the DOM')
}

async function loadRecentWorkspaces() {
  try {
    const workspaces = await window.fileManager.getRecentWorkspaces()
    displayWorkspaceHistory(workspaces)
  } catch (error) {
    console.error('Error loading recent workspaces:', error)
  }
}

function displayWorkspaceHistory(workspaces) {
  workspaceHistoryList.innerHTML = ''
  
  if (!workspaces || workspaces.length === 0) {
    return
  }
  
  workspaces.forEach(workspace => {
    const item = document.createElement('div')
    item.classList.add('workspace-item')
    
    const name = document.createElement('div')
    name.classList.add('workspace-name')
    name.textContent = workspace.folder_name
    name.title = workspace.folder_path
    
    const meta = document.createElement('div')
    meta.classList.add('workspace-meta')
    
    const lastOpened = new Date(workspace.last_opened)
    const timeAgo = getTimeAgo(lastOpened)
    meta.textContent = timeAgo
    
    const stats = document.createElement('div')
    stats.classList.add('workspace-stats')
    if (workspace.files_due_today > 0) {
      stats.textContent = `${workspace.files_due_today} due`
    }
    
    item.appendChild(name)
    item.appendChild(meta)
    if (workspace.files_due_today > 0) {
      item.appendChild(stats)
    }
    
    item.addEventListener('click', async () => {
      await openWorkspace(workspace.folder_path)
    })
    
    workspaceHistoryList.appendChild(item)
  })
}

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000)
  
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w ago`
  return `${Math.floor(seconds / 2592000)}mo ago`
}

async function openWorkspace(folderPath) {
  try {
    currentRootPath = folderPath
    
    const dbResult = await window.fileManager.createDatabase(folderPath)
    if (dbResult.success) {
      console.log('Database ready at:', dbResult.path)
    } else {
      console.warn('Database setup warning:', dbResult.error)
    }
    
    await window.fileManager.recordWorkspace(folderPath)
    console.log('Workspace recorded in central database')
    
    const tree = await window.fileManager.getDirectoryTree(folderPath)
    console.log('Directory tree received:', tree)
    renderTree(tree, treeContainer)
    
    await loadRecentWorkspaces()
  } catch (error) {
    console.error('Error opening workspace:', error)
    alert(`Error opening workspace: ${error.message}`)
  }
}

selectFolderBtn.addEventListener('click', async () => {
  console.log('Open folder button clicked')
  try {
    const folderPath = await window.fileManager.selectFolder()
    console.log('Folder path received:', folderPath)
    if (folderPath) {
      await openWorkspace(folderPath)
    } else {
      console.warn('No folder selected')
    }
  } catch (error) {
    console.error('Error setting up folder:', error)
  }
})

reviseFilesBtn.addEventListener('click', async () => {
  console.log('Revise files button clicked')
  try {
    const result = await window.fileManager.getAllFilesForRevision()
    console.log('Files for revision from all workspaces:', result)
    
    if (result.success && result.files.length > 0) {
      revisionFiles = result.files
      currentRevisionIndex = 0
      displayRevisionList(result.files)
      showRevisionFile(0)
      await openFile(result.files[0].file_path)
      
      const workspaceCounts = {}
      for (const file of result.files) {
        workspaceCounts[file.workspacePath] = (workspaceCounts[file.workspacePath] || 0) + 1
      }
      
      for (const [workspacePath, count] of Object.entries(workspaceCounts)) {
        await window.fileManager.updateWorkspaceStats(workspacePath, count, count)
      }
      console.log('Workspace stats updated in central database')
    } else if (result.success && result.files.length === 0) {
      alert('No files due for revision today!')
      revisionList.innerHTML = '<p>No files due for revision today! 🎉</p>'
    } else {
      alert(`Error: ${result.error}`)
    }
  } catch (error) {
    console.error('Error getting revision files:', error)
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
        currentFile.note_id,
        feedback
      )
      
      if (result.success) {
        console.log('Feedback updated:', result.message)
        
        revisionFiles.splice(currentRevisionIndex, 1)
        
        displayRevisionList(revisionFiles)
        
        const workspaceCounts = {}
        for (const file of revisionFiles) {
          workspaceCounts[file.workspacePath] = (workspaceCounts[file.workspacePath] || 0) + 1
        }
        
        for (const [workspacePath, count] of Object.entries(workspaceCounts)) {
          await window.fileManager.updateWorkspaceStats(workspacePath, count, count)
        }
        
        if (revisionFiles.length > 0) {
          if (currentRevisionIndex >= revisionFiles.length) {
            currentRevisionIndex = revisionFiles.length - 1
          }
          showRevisionFile(currentRevisionIndex)
          await openFile(revisionFiles[currentRevisionIndex].file_path)
        } else {
          alert('All files reviewed! Great job! 🎉')
          revisionControls.style.display = 'none'
          revisionList.innerHTML = '<p>All files reviewed! 🎉</p>'
          editorToolbar.classList.add('hidden')
          filePreview.textContent = ''
          currentOpenFile = null
        }
      } else {
        alert(`Error: ${result.error}`)
      }
    } catch (error) {
      console.error('Error updating feedback:', error)
    }
  }
})

function displayRevisionList(files) {
  revisionList.innerHTML = ''
  
  const header = document.createElement('div')
  header.classList.add('revision-list-header')
  header.innerHTML = `
    <div class="revision-count">${files.length} file${files.length !== 1 ? 's' : ''}</div>
    <div class="revision-subtitle">Due for review</div>
  `
  revisionList.appendChild(header)
  
  if (files.length === 0) {
    const emptyState = document.createElement('div')
    emptyState.classList.add('empty-state')
    emptyState.innerHTML = `
      <div class="empty-icon">🎉</div>
      <div class="empty-text">All caught up!</div>
      <div class="empty-subtext">No files due for revision</div>
    `
    revisionList.appendChild(emptyState)
    return
  }
  
  const groupedFiles = {}
  files.forEach(file => {
    const workspace = file.workspacePath || 'Unknown'
    if (!groupedFiles[workspace]) {
      groupedFiles[workspace] = []
    }
    groupedFiles[workspace].push(file)
  })
  
  const listContainer = document.createElement('div')
  listContainer.classList.add('revision-list-container')
  
  Object.entries(groupedFiles).forEach(([workspace, workspaceFiles]) => {
    const workspaceGroup = document.createElement('div')
    workspaceGroup.classList.add('workspace-group')
    
    const workspaceHeader = document.createElement('div')
    workspaceHeader.classList.add('workspace-group-header')
    const workspaceName = workspace.split('/').pop()
    workspaceHeader.innerHTML = `
      <span class="workspace-icon">📁</span>
      <span class="workspace-group-name">${workspaceName}</span>
      <span class="workspace-file-count">${workspaceFiles.length}</span>
    `
    workspaceGroup.appendChild(workspaceHeader)
    
    workspaceFiles.forEach((file, fileIndex) => {
      const globalIndex = files.indexOf(file)
      const item = document.createElement('div')
      item.classList.add('revision-item')
      if (globalIndex === currentRevisionIndex) {
        item.classList.add('active')
      }
      
      const fileName = file.file_path.split('/').pop()
      const filePath = file.file_path
      
      const difficultyColor = file.difficulty > 0.6 ? '#ff3b30' : file.difficulty > 0.3 ? '#ff9500' : '#34c759'
      const difficultyLabel = file.difficulty > 0.6 ? 'Hard' : file.difficulty > 0.3 ? 'Medium' : 'Easy'
      
      item.innerHTML = `
        <div class="revision-item-main">
          <div class="revision-item-icon">📄</div>
          <div class="revision-item-content">
            <div class="revision-item-name" title="${filePath}">${fileName}</div>
            <div class="revision-item-meta">
              <span class="revision-meta-item">
                <span class="meta-icon">🔄</span>
                <span>${file.review_count} review${file.review_count !== 1 ? 's' : ''}</span>
              </span>
              <span class="revision-meta-item">
                <span class="meta-dot" style="background-color: ${difficultyColor}"></span>
                <span>${difficultyLabel}</span>
              </span>
            </div>
          </div>
        </div>
      `
      
      item.addEventListener('click', async () => {
        document.querySelectorAll('.revision-item').forEach(el => el.classList.remove('active'))
        item.classList.add('active')
        currentRevisionIndex = globalIndex
        showRevisionFile(globalIndex)
        await openFile(file.file_path)
      })
      
      workspaceGroup.appendChild(item)
    })
    
    listContainer.appendChild(workspaceGroup)
  })
  
  revisionList.appendChild(listContainer)
}

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

function renderTree(tree, container) {
  container.innerHTML = ''
  const ul = document.createElement('ul')
  tree.forEach(item => {
    const li = document.createElement('li')
    
    const treeItem = document.createElement('div')
    treeItem.classList.add('tree-item')
    
    if (item.type === 'directory') {
      treeItem.classList.add('directory')
      
      const expandIcon = document.createElement('span')
      expandIcon.classList.add('tree-expand-icon')
      expandIcon.textContent = '▶'
      treeItem.appendChild(expandIcon)
      
      const icon = document.createElement('span')
      icon.classList.add('tree-icon')
      icon.textContent = '📁'
      treeItem.appendChild(icon)
      
      const label = document.createElement('span')
      label.classList.add('tree-label')
      label.textContent = item.name
      treeItem.appendChild(label)
      
    } else if (item.type === 'note-parent') {
      treeItem.classList.add('note-parent')
      
      const expandIcon = document.createElement('span')
      expandIcon.classList.add('tree-expand-icon')
      expandIcon.textContent = '▶'
      treeItem.appendChild(expandIcon)
      
      const icon = document.createElement('span')
      icon.classList.add('tree-icon')
      icon.textContent = '📄'
      treeItem.appendChild(icon)
      
      const label = document.createElement('span')
      label.classList.add('tree-label')
      label.textContent = item.name
      treeItem.appendChild(label)
      
      const addBtn = document.createElement('button')
      addBtn.textContent = '+'
      addBtn.classList.add('add-file-btn')
      
      window.fileManager.checkFileInQueue(item.path).then(result => {
        if (result.inQueue) {
          addBtn.textContent = '✓'
          addBtn.disabled = true
        }
      })
      
      addBtn.onclick = async (e) => {
        e.stopPropagation()
        
        const result = await window.fileManager.addFileToQueue(item.path)
        if (result.success) {
          addBtn.textContent = '✓'
          addBtn.disabled = true
        } else {
          if (result.alreadyExists) {
            addBtn.textContent = '✓'
            addBtn.disabled = true
          } else {
            alert(`Error: ${result.error}`)
          }
        }
      }
      treeItem.appendChild(addBtn)
      
    } else if (item.type === 'note-child') {
      treeItem.classList.add('note-child')
      
      if (item.children && item.children.length > 0) {
        const expandIcon = document.createElement('span')
        expandIcon.classList.add('tree-expand-icon')
        expandIcon.textContent = '▶'
        treeItem.appendChild(expandIcon)
      } else {
        const spacer = document.createElement('span')
        spacer.classList.add('tree-expand-icon')
        treeItem.appendChild(spacer)
      }
      
      const icon = document.createElement('span')
      icon.classList.add('tree-icon')
      icon.textContent = '📝'
      treeItem.appendChild(icon)
      
      const prefix = document.createElement('span')
      prefix.classList.add('note-child-prefix')
      prefix.textContent = '↳ '
      treeItem.appendChild(prefix)
      
      const label = document.createElement('span')
      label.classList.add('tree-label')
      label.textContent = item.name
      treeItem.appendChild(label)
      
      const addBtn = document.createElement('button')
      addBtn.textContent = '+'
      addBtn.classList.add('add-file-btn')
      
      window.fileManager.checkFileInQueue(item.path).then(result => {
        if (result.inQueue) {
          addBtn.textContent = '✓'
          addBtn.disabled = true
        }
      })
      
      addBtn.onclick = async (e) => {
        e.stopPropagation()
        
        const result = await window.fileManager.addFileToQueue(item.path)
        if (result.success) {
          addBtn.textContent = '✓'
          addBtn.disabled = true
        } else {
          if (result.alreadyExists) {
            addBtn.textContent = '✓'
            addBtn.disabled = true
          } else {
            alert(`Error: ${result.error}`)
          }
        }
      }
      treeItem.appendChild(addBtn)
      
    } else {
      treeItem.classList.add('file')
      
      const spacer = document.createElement('span')
      spacer.classList.add('tree-expand-icon')
      treeItem.appendChild(spacer)
      
      const icon = document.createElement('span')
      icon.classList.add('tree-icon')
      icon.textContent = '📄'
      treeItem.appendChild(icon)
      
      const label = document.createElement('span')
      label.classList.add('tree-label')
      label.textContent = item.name
      treeItem.appendChild(label)
      
      const addBtn = document.createElement('button')
      addBtn.textContent = '+'
      addBtn.classList.add('add-file-btn')
      
      window.fileManager.checkFileInQueue(item.path).then(result => {
        if (result.inQueue) {
          addBtn.textContent = '✓'
          addBtn.disabled = true
        }
      })
      
      addBtn.onclick = async (e) => {
        e.stopPropagation()
        
        const result = await window.fileManager.addFileToQueue(item.path)
        if (result.success) {
          addBtn.textContent = '✓'
          addBtn.disabled = true
        } else {
          if (result.alreadyExists) {
            addBtn.textContent = '✓'
            addBtn.disabled = true
          } else {
            alert(`Error: ${result.error}`)
          }
        }
      }
      treeItem.appendChild(addBtn)
    }
    
    li.appendChild(treeItem)

    treeItem.addEventListener('click', async (event) => {
      event.stopPropagation()
      
      if (item.type === 'directory') {
        const expandIcon = treeItem.querySelector('.tree-expand-icon')
        if (!li.dataset.loaded) {
          try {
            const children = await window.fileManager.getDirectoryTree(item.path)
            const subUl = document.createElement('ul')
            renderTree(children, subUl)
            li.appendChild(subUl)
            li.dataset.loaded = true
            expandIcon.classList.add('expanded')
            const icon = treeItem.querySelector('.tree-icon')
            icon.textContent = '📂'
          } catch (error) {
            console.error('Error loading children:', error)
          }
        } else {
          const subUl = li.querySelector('ul')
          if (subUl) {
            const isHidden = subUl.style.display === 'none'
            subUl.style.display = isHidden ? 'block' : 'none'
            if (isHidden) {
              expandIcon.classList.add('expanded')
              const icon = treeItem.querySelector('.tree-icon')
              icon.textContent = '📂'
            } else {
              expandIcon.classList.remove('expanded')
              const icon = treeItem.querySelector('.tree-icon')
              icon.textContent = '📁'
            }
          }
        }
        
      } else if (item.type === 'note-parent') {
        await openFile(item.path)
        document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('selected'))
        treeItem.classList.add('selected')
        
        const expandIcon = treeItem.querySelector('.tree-expand-icon')
        if (!li.dataset.loaded && item.children && item.children.length > 0) {
          const subUl = document.createElement('ul')
          subUl.classList.add('note-children')
          renderTree(item.children, subUl)
          li.appendChild(subUl)
          li.dataset.loaded = true
          expandIcon.classList.add('expanded')
        } else if (li.dataset.loaded) {
          const subUl = li.querySelector('ul.note-children')
          if (subUl) {
            const isHidden = subUl.style.display === 'none'
            subUl.style.display = isHidden ? 'block' : 'none'
            if (isHidden) {
              expandIcon.classList.add('expanded')
            } else {
              expandIcon.classList.remove('expanded')
            }
          }
        }
        
      } else if (item.type === 'note-child') {
        await openFile(item.path)
        document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('selected'))
        treeItem.classList.add('selected')
        
        if (item.children && item.children.length > 0) {
          const expandIcon = treeItem.querySelector('.tree-expand-icon')
          if (!li.dataset.loaded) {
            const subUl = document.createElement('ul')
            subUl.classList.add('note-children')
            renderTree(item.children, subUl)
            li.appendChild(subUl)
            li.dataset.loaded = true
            expandIcon.classList.add('expanded')
          } else {
            const subUl = li.querySelector('ul.note-children')
            if (subUl) {
              const isHidden = subUl.style.display === 'none'
              subUl.style.display = isHidden ? 'block' : 'none'
              if (isHidden) {
                expandIcon.classList.add('expanded')
              } else {
                expandIcon.classList.remove('expanded')
              }
            }
          }
        }
        
      } else if (item.type === 'file') {
        await openFile(item.path)
        document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('selected'))
        treeItem.classList.add('selected')
      }
    })
    ul.appendChild(li)
  })
  container.appendChild(ul)
}

async function openFile(filePath) {
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
      
      revisionControls.classList.remove('hidden')
    } else {
      alert(`Error reading file: ${result.error}`)
    }
  } catch (error) {
    console.error('Error opening file:', error)
    alert(`Error opening file: ${error.message}`)
  }
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
  
  const confirm = window.confirm(`Extract selected text to a new note?\n\nThis will create a new numbered file in the note's folder.`)
  if (!confirm) return
  
  try {
    const result = await window.fileManager.extractNote(currentOpenFile, selectedText)
    
    if (result.success) {
      showToast(`Note extracted to ${result.fileName}`)
      
      if (currentRootPath) {
        const tree = await window.fileManager.getDirectoryTree(currentRootPath)
        renderTree(tree, treeContainer)
      }
    } else {
      showToast(`Error: ${result.error}`, true)
    }
  } catch (error) {
    console.error('Error extracting note:', error)
    showToast(`Error extracting note: ${error.message}`, true)
  }
})

loadRecentWorkspaces()
