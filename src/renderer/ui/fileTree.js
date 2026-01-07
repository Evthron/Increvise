// SPDX-FileCopyrightText: 2025 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// File tree UI logic extracted from renderer.js
// Handles rendering and interaction with the file/directory/note tree

const treeContainer = document.getElementById('tree-container')

// Get reference to editor panel component
function getEditorPanel() {
  return document.querySelector('editor-panel')
}

/**
 * Renders the file/directory/note tree in the UI.
 * @param {Array} tree - The tree data structure.
 * @param {HTMLElement} container - The container to render into.
 */
export function renderTree(tree, container = treeContainer) {
  container.innerHTML = ''
  const ul = document.createElement('ul')
  tree.forEach((item) => {
    const li = document.createElement('li')
    const treeItem = document.createElement('div')
    treeItem.classList.add('tree-item')

    if (item.type === 'directory') {
      treeItem.classList.add('directory')
      const expandIcon = document.createElement('span')
      expandIcon.classList.add('tree-expand-icon')
      expandIcon.textContent = '\u25b6'
      treeItem.appendChild(expandIcon)
      const icon = document.createElement('span')
      icon.classList.add('tree-icon')
      icon.textContent = '\ud83d\udcc1'
      treeItem.appendChild(icon)
      const label = document.createElement('span')
      label.classList.add('tree-label')
      label.textContent = item.name
      treeItem.appendChild(label)
    } else if (item.type === 'pdf-parent') {
      // PDF file with extracts
      treeItem.classList.add('pdf-parent')
      const expandIcon = document.createElement('span')
      expandIcon.classList.add('tree-expand-icon')
      expandIcon.textContent = '\u25b6'
      treeItem.appendChild(expandIcon)
      const icon = document.createElement('span')
      icon.classList.add('tree-icon')
      icon.textContent = '\ud83d\udcdd' // 📝 PDF icon
      treeItem.appendChild(icon)
      const label = document.createElement('span')
      label.classList.add('tree-label')
      label.textContent = item.name
      treeItem.appendChild(label)
      const addBtn = document.createElement('button')
      addBtn.textContent = '+'
      addBtn.classList.add('add-file-btn')
      window.fileManager
        .checkFileInQueue(item.path, window.currentWorkspaceLibraryId)
        .then((result) => {
          if (result.inQueue) {
            addBtn.textContent = '\u2713'
            addBtn.disabled = true
          }
        })
      addBtn.onclick = async (e) => {
        e.stopPropagation()
        const result = await window.fileManager.addFileToQueue(
          item.path,
          window.currentWorkspaceLibraryId
        )
        if (result.success) {
          addBtn.textContent = '\u2713'
          addBtn.disabled = true
        } else {
          if (result.alreadyExists) {
            addBtn.textContent = '\u2713'
            addBtn.disabled = true
          } else {
            alert(`Error: ${result.error}`)
          }
        }
      }
      treeItem.appendChild(addBtn)
    } else if (item.type === 'note-parent') {
      treeItem.classList.add('note-parent')
      const expandIcon = document.createElement('span')
      expandIcon.classList.add('tree-expand-icon')
      expandIcon.textContent = '\u25b6'
      treeItem.appendChild(expandIcon)
      const icon = document.createElement('span')
      icon.classList.add('tree-icon')
      icon.textContent = '\ud83d\udcc4'
      treeItem.appendChild(icon)
      const label = document.createElement('span')
      label.classList.add('tree-label')
      label.textContent = item.name
      treeItem.appendChild(label)
      const addBtn = document.createElement('button')
      addBtn.textContent = '+'
      addBtn.classList.add('add-file-btn')
      window.fileManager
        .checkFileInQueue(item.path, window.currentWorkspaceLibraryId)
        .then((result) => {
          if (result.inQueue) {
            addBtn.textContent = '\u2713'
            addBtn.disabled = true
          }
        })
      addBtn.onclick = async (e) => {
        e.stopPropagation()
        const result = await window.fileManager.addFileToQueue(
          item.path,
          window.currentWorkspaceLibraryId
        )
        if (result.success) {
          addBtn.textContent = '\u2713'
          addBtn.disabled = true
        } else {
          if (result.alreadyExists) {
            addBtn.textContent = '\u2713'
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
        expandIcon.textContent = '\u25b6'
        treeItem.appendChild(expandIcon)
      } else {
        const spacer = document.createElement('span')
        spacer.classList.add('tree-expand-icon')
        treeItem.appendChild(spacer)
      }
      const icon = document.createElement('span')
      icon.classList.add('tree-icon')
      icon.textContent = '\ud83d\udcdd'
      treeItem.appendChild(icon)
      const prefix = document.createElement('span')
      prefix.classList.add('note-child-prefix')
      prefix.textContent = '\u21b3 '
      treeItem.appendChild(prefix)
      const label = document.createElement('span')
      label.classList.add('tree-label')
      label.textContent = item.name
      treeItem.appendChild(label)
      const addBtn = document.createElement('button')
      addBtn.textContent = '+'
      addBtn.classList.add('add-file-btn')
      window.fileManager
        .checkFileInQueue(item.path, window.currentWorkspaceLibraryId)
        .then((result) => {
          if (result.inQueue) {
            addBtn.textContent = '\u2713'
            addBtn.disabled = true
          }
        })
      addBtn.onclick = async (e) => {
        e.stopPropagation()
        const result = await window.fileManager.addFileToQueue(
          item.path,
          window.currentWorkspaceLibraryId
        )
        if (result.success) {
          addBtn.textContent = '\u2713'
          addBtn.disabled = true
        } else {
          if (result.alreadyExists) {
            addBtn.textContent = '\u2713'
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
      icon.textContent = '\ud83d\udcc4'
      treeItem.appendChild(icon)
      const label = document.createElement('span')
      label.classList.add('tree-label')
      label.textContent = item.name
      treeItem.appendChild(label)
      const addBtn = document.createElement('button')
      addBtn.textContent = '+'
      addBtn.classList.add('add-file-btn')
      window.fileManager
        .checkFileInQueue(item.path, window.currentWorkspaceLibraryId)
        .then((result) => {
          if (result.inQueue) {
            addBtn.textContent = '\u2713'
            addBtn.disabled = true
          }
        })
      addBtn.onclick = async (e) => {
        e.stopPropagation()
        const result = await window.fileManager.addFileToQueue(
          item.path,
          window.currentWorkspaceLibraryId
        )
        if (result.success) {
          addBtn.textContent = '\u2713'
          addBtn.disabled = true
        } else {
          if (result.alreadyExists) {
            addBtn.textContent = '\u2713'
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

      // Directory expansion/collapse and file/note open logic
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
      } else if (item.type === 'pdf-parent') {
        // Open PDF file and toggle extract list
        const editorPanel = getEditorPanel()
        if (editorPanel) await editorPanel.openFile(item.path)
        document.querySelectorAll('.tree-item').forEach((el) => el.classList.remove('selected'))
        treeItem.classList.add('selected')

        const expandIcon = treeItem.querySelector('.tree-expand-icon')
        if (!li.dataset.loaded && item.children && item.children.length > 0) {
          const subUl = document.createElement('ul')
          subUl.classList.add('pdf-extracts')
          renderTree(item.children, subUl)
          li.appendChild(subUl)
          li.dataset.loaded = true
          expandIcon.classList.add('expanded')
        } else if (li.dataset.loaded) {
          const subUl = li.querySelector('ul.pdf-extracts')
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
      } else if (item.type === 'note-parent') {
        const editorPanel = getEditorPanel()
        if (editorPanel) await editorPanel.openFile(item.path)
        document.querySelectorAll('.tree-item').forEach((el) => el.classList.remove('selected'))
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
        const editorPanel = getEditorPanel()
        if (editorPanel) await editorPanel.openFile(item.path)
        document.querySelectorAll('.tree-item').forEach((el) => el.classList.remove('selected'))
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
        const editorPanel = getEditorPanel()
        if (editorPanel) await editorPanel.openFile(item.path)
        document.querySelectorAll('.tree-item').forEach((el) => el.classList.remove('selected'))
        treeItem.classList.add('selected')
      }
    })
    ul.appendChild(li)
  })
  container.appendChild(ul)
}
