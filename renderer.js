const selectFolderBtn = document.getElementById('select-folder')
const treeContainer = document.getElementById('tree-container')
const createdbbutton = document.getElementById('create-db')
const reviseFilesBtn = document.getElementById('revise-files')
const revisionList = document.getElementById('revision-list')
const revisionControls = document.getElementById('revision-controls')
const currentFileName = document.getElementById('current-file-name')

let currentRootPath = null
let currentFolderPath = null
let revisionFiles = []
let currentRevisionIndex = 0

if (!selectFolderBtn) {
  console.error('Select folder button not found in the DOM')
}

selectFolderBtn.addEventListener('click', async () => {
  console.log('Select folder button clicked')
  try {
    const folderPath = await window.fileManager.selectFolder()
    console.log('Folder path received:', folderPath)
    if (folderPath) {
      currentRootPath = folderPath
      const tree = await window.fileManager.getDirectoryTree(folderPath)
      console.log('Directory tree received:', tree)
      renderTree(tree, treeContainer)
    } else {
      console.warn('No folder selected')
    }
  } catch (error) {
    console.error('Error selecting folder:', error)
  }
})

createdbbutton.addEventListener('click', async () => {
  console.log('Create db button clicked')
  try {
    const folderPath = await window.fileManager.selectFolder()
    console.log('Folder path received:', folderPath)
    if (folderPath) {
      const result = await window.fileManager.createDatabase(folderPath)
      if (result.success) {
        alert(`Database created successfully at: ${result.path}`)
      } else {
        alert(`Failed to create database: ${result.error}`)
      }
      console.log('Database created:', result)
    } else {
      console.warn('No path created')
    }
  } catch (error) {
    console.error('Error selecting folder:', error)
  }
})

reviseFilesBtn.addEventListener('click', async () => {
  console.log('Revise files button clicked')
  try {
    if (!currentRootPath) {
      alert('Please select a folder first')
      return
    }
    
    const result = await window.fileManager.getFilesForRevision(currentRootPath)
    console.log('Files for revision:', result)
    
    if (result.success && result.files.length > 0) {
      revisionFiles = result.files
      currentRevisionIndex = 0
      displayRevisionList(result.files)
      showRevisionFile(0)
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
        // Move to next file
        currentRevisionIndex++
        if (currentRevisionIndex < revisionFiles.length) {
          showRevisionFile(currentRevisionIndex)
        } else {
          alert('All files reviewed! Great job! 🎉')
          revisionControls.style.display = 'none'
          revisionList.innerHTML = '<p>All files reviewed! 🎉</p>'
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
  revisionList.innerHTML = `<p>Files to review today: ${files.length}</p>`
  const ul = document.createElement('ul')
  files.forEach((file, index) => {
    const li = document.createElement('li')
    li.textContent = `${index + 1}. ${file.file_path} (Reviews: ${file.review_count}, Difficulty: ${file.difficulty.toFixed(2)})`
    ul.appendChild(li)
  })
  revisionList.appendChild(ul)
}

function showRevisionFile(index) {
  if (index >= revisionFiles.length) return
  
  const file = revisionFiles[index]
  currentFileName.textContent = `Reviewing (${index + 1}/${revisionFiles.length}): ${file.file_path}`
  revisionControls.style.display = 'block'
}

function renderTree(tree, container) {
  container.innerHTML = ''
  const ul = document.createElement('ul')
  tree.forEach(item => {
    const li = document.createElement('li')
    
    // Create a span for the item name
    const nameSpan = document.createElement('span')
    nameSpan.textContent = item.name
    nameSpan.classList.add(item.type === 'directory' ? 'directory' : 'file')
    
    // Add "Add to Queue" button for files
    if (item.type === 'file') {
      const addBtn = document.createElement('button')
      addBtn.textContent = '+'
      addBtn.classList.add('add-file-btn')
      addBtn.onclick = async (e) => {
        e.stopPropagation()
        
        // Find the parent folder path
        let folderPath = item.path.substring(0, item.path.lastIndexOf('/'))
        
        const result = await window.fileManager.addFileToQueue(item.path, folderPath)
        if (result.success) {
          alert(result.message)
          addBtn.textContent = '✓'
          addBtn.disabled = true
        } else {
          alert(`Error: ${result.error}`)
        }
      }
      li.appendChild(addBtn)
    }
    
    li.appendChild(nameSpan)

    nameSpan.addEventListener('click', async (event) => {
        event.stopPropagation() // Prevent parent directories from toggling
        if (item.type === 'directory') {
            if (!li.dataset.loaded) {
                try {
                const children = await window.fileManager.getDirectoryTree(item.path)
                const subUl = document.createElement('ul')
                renderTree(children, subUl)
                li.appendChild(subUl)
                li.dataset.loaded = true // Mark as loaded
                } catch (error) {
                console.error('Error loading children:', error)
                }
            } else {
                const subUl = li.querySelector('ul')
                if (subUl) {
                subUl.style.display = subUl.style.display === 'none' ? 'block' : 'none'
                }
            }
        }
    })
    ul.appendChild(li)
  })
  container.appendChild(ul)
}
