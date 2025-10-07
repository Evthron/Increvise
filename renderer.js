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
    if (item.type === 'directory' && item.children) {
      const subUl = document.createElement('ul')
      renderTree(item.children, subUl)
      li.appendChild(subUl)
      li.addEventListener('click', () => {
        subUl.style.display = subUl.style.display === 'none' ? 'block' : 'none'
      })
    }
    ul.appendChild(li)
  })
  container.appendChild(ul)
}
