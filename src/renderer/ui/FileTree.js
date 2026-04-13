// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// FileTree Lit component
// Handles rendering and interaction with the file/directory/note tree

import { LitElement, html, css } from 'lit'

export class FileTree extends LitElement {
  static properties = {
    treeData: { type: Array },
    disabled: { type: Boolean },
    selectedPath: { type: String, state: true },
  }

  static styles = css`
    sl-icon,
    sl-icon-button {
      flex-shrink: 0;
    }

    sl-icon-button::part(base) {
      padding-left: 0;
    }
  `

  constructor() {
    super()
    this.treeData = []
    this.disabled = false
    this.selectedPath = null
  }

  render() {
    if (!this.treeData || this.treeData.length === 0) {
      return html`<div style="padding: 1rem; text-align: center; color: #999;">
        No files to display
      </div>`
    }

    return html`
      <sl-tree @sl-selection-change=${this._handleItemClick} @sl-lazy-load=${this._handleLazyLoad}>
        ${this.treeData.map((item) => this._renderTreeItem(item))}
      </sl-tree>
    `
  }

  _handleSelect(e) {
    const selectedItem = e.detail.item
    console.log('Selected dropdown item:', selectedItem)
  }

  _renderTreeItem(item) {
    const hasChildren = item.children && item.children.length > 0
    const isLazyDirectory =
      item.type === 'directory' && (!item.children || item.children.length === 0)

    return html`
      <sl-tree-item ?lazy=${isLazyDirectory} .__itemData=${item}>
        ${this._renderIcon(item)}
        <span class="tree-label">${item.name}</span>
        ${hasChildren ? html` ${item.children.map((child) => this._renderTreeItem(child))} ` : ''}
      </sl-tree-item>
    `
  }

  _renderIcon(item) {
    if (item.type === 'directory') {
      return html`<sl-icon name="folder-fill" style="color: #FFC107"></sl-icon>`
    } else if (!item.inQueue) {
      return html`<sl-icon-button
        name="plus-square-fill"
        style="color: #4354d8"
        @click=${(e) => this._handleAddClick(e, item)}
      ></sl-icon-button>`
    } else if (item.type === 'pdf-parent') {
      return html`<sl-icon name="file-earmark-pdf-fill" style="color: #b61812"></sl-icon>`
    } else if (item.type === 'note-parent' || item.type === 'file') {
      return html`<sl-icon name="file-earmark-fill" style="color: #70affb"></sl-icon>`
    } else if (item.type === 'note-child') {
      return html`<sl-icon name="arrow-return-right" style="color: #70affb"></sl-icon>`
    } else {
      return html`<sl-icon name="file-earmark-fill" style="color: #ffffff"></sl-icon>`
    }
  }

  async _handleLazyLoad(e) {
    const treeItem = e.target
    const item = treeItem.__itemData
    if (!item) return

    try {
      const result = await window.fileManager.getDirectoryTree(item.path, item.library_id)

      if (!result.success) {
        console.error('Failed to load directory:', result.error)
        return
      }

      item.children = result.data
      this.requestUpdate()
    } catch (error) {
      console.error('Error loading children:', error)
    }
  }

  async _handleItemClick(e) {
    const [treeItem] = e.detail.selection
    if (!treeItem) return

    const item = treeItem.__itemData
    if (!item) return

    // Only open files, not directories
    if (item.type !== 'directory') {
      this.selectedPath = item.path

      // Set the file's library ID before opening
      if (item.library_id) {
        window.currentFile.libraryId = item.library_id
        console.log('Setting file library ID from tree item:', item.library_id)
      }

      const editorPanel = document.querySelector('editor-panel')
      if (editorPanel) {
        await editorPanel.openFile(item.path)
      }

      this.requestUpdate()
    }
  }

  async _handleAddClick(e, item) {
    e.stopPropagation()

    try {
      const result = await window.fileManager.addFileToQueue(item.path, item.library_id)
      if (result.success || result.alreadyExists) {
        item.inQueue = true
        this.requestUpdate()

        // Notify revision list to refresh if file was added to queue
        const revisionList = document.querySelector('revision-list')
        if (revisionList) {
          await revisionList.refreshFileList()
        }
      } else {
        alert(`Error: ${result.error}`)
        console.error('Error adding file to queue:', result.error)
      }
    } catch (error) {
      console.error('Error adding file to queue:', error)
      alert(`Error: ${error.message}`)
    }
  }
}

customElements.define('file-tree', FileTree)
