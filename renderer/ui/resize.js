// SPDX-FileCopyrightText: 2025 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Resize handle logic extracted from renderer.js
// Handles sidebar and list panel resizing

const STORAGE_KEYS = {
  SIDEBAR_WIDTH: 'increvise-sidebar-width',
  LIST_PANEL_WIDTH: 'increvise-list-panel-width',
}

export function initializeResizeHandles() {
  const sidebar = document.querySelector('.sidebar')
  const listPanel = document.querySelector('.list-panel')
  const resizeHandles = document.querySelectorAll('.resize-handle')

  const savedSidebarWidth = localStorage.getItem(STORAGE_KEYS.SIDEBAR_WIDTH)
  const savedListPanelWidth = localStorage.getItem(STORAGE_KEYS.LIST_PANEL_WIDTH)

  if (savedSidebarWidth) {
    sidebar.style.width = savedSidebarWidth + 'px'
  }
  if (savedListPanelWidth) {
    listPanel.style.width = savedListPanelWidth + 'px'
  }

  resizeHandles.forEach((handle) => {
    let startX = 0
    let startWidth = 0
    let targetPanel = null

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault()
      const panelType = handle.dataset.resize
      if (panelType === 'sidebar') {
        targetPanel = sidebar
      } else if (panelType === 'list-panel') {
        targetPanel = listPanel
      }
      startX = e.clientX
      startWidth = targetPanel.offsetWidth
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      const onMouseMove = (e) => {
        const delta = e.clientX - startX
        const newWidth = Math.max(
          parseInt(getComputedStyle(targetPanel).minWidth),
          Math.min(parseInt(getComputedStyle(targetPanel).maxWidth), startWidth + delta)
        )
        targetPanel.style.width = newWidth + 'px'
      }
      const onMouseUp = () => {
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        if (panelType === 'sidebar') {
          localStorage.setItem(STORAGE_KEYS.SIDEBAR_WIDTH, targetPanel.offsetWidth)
        } else if (panelType === 'list-panel') {
          localStorage.setItem(STORAGE_KEYS.LIST_PANEL_WIDTH, targetPanel.offsetWidth)
        }
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    })
  })
}
