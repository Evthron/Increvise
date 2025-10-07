const selectFolderBtn = document.getElementById('select-folder')
const treeContainer = document.getElementById('tree-container')

if (!selectFolderBtn) {
  console.error('Select folder button not found in the DOM')
}

selectFolderBtn.addEventListener('click', async () => {
  console.log('Select folder button clicked')
  try {
    const folderPath = await window.fileManager.selectFolder()
    console.log('Folder path received:', folderPath)
    if (folderPath) {
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

function renderTree(tree, container) {
  container.innerHTML = ''
  const ul = document.createElement('ul')
  tree.forEach(item => {
    const li = document.createElement('li')
    li.textContent = item.name
    li.classList.add(item.type === 'directory' ? 'directory' : 'file')

    if (item.type === 'directory') {
      li.addEventListener('click', async (event) => {
        event.stopPropagation() // Prevent parent directories from toggling
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
      })
    }
    ul.appendChild(li)
  })
  container.appendChild(ul)
}
