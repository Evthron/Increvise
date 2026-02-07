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
    expandedNodes: { type: Map, state: true },
    selectedPath: { type: String, state: true },
  }

  static styles = css`
    :host {
      display: block;
      width: 100%;
      margin-top: 12px;
      font-size: 12px;
      min-height: 100px;
    }

    ul {
      list-style: none;
      padding-left: 0;
      margin: 0;
    }

    ul ul {
      padding-left: 16px;
    }

    li {
      margin: 0;
      padding: 0;
    }

    .tree-item {
      display: flex;
      align-items: center;
      padding: 4px 8px;
      margin: 1px 0;
      border-radius: 4px;
      cursor: pointer;
      user-select: none;
      transition: background-color 0.1s ease;
      gap: 6px;
    }

    .tree-item:hover {
      background-color: rgba(0, 0, 0, 0.05);
    }

    .tree-item.selected {
      background-color: rgba(0, 122, 255, 0.1);
    }

    .tree-item.directory .tree-label {
      font-weight: 500;
    }

    .tree-item.file .tree-label {
      font-weight: 400;
    }

    .tree-item.note-parent {
      background-color: rgba(255, 204, 0, 0.08);
      border-radius: 4px;
    }

    .tree-item.note-parent .tree-label {
      font-weight: 600;
      color: var(--text-primary);
    }

    .tree-item.note-parent:hover {
      background-color: rgba(255, 204, 0, 0.15);
    }

    .tree-item.note-child {
      background-color: rgba(0, 122, 255, 0.05);
      border-radius: 4px;
    }

    .tree-item.note-child .tree-label {
      color: var(--text-primary);
    }

    .tree-item.note-child:hover {
      background-color: rgba(0, 122, 255, 0.12);
    }

    .note-children {
      border-left: 2px solid rgba(0, 122, 255, 0.3);
      margin-left: 24px;
      padding-left: 8px;
    }

    .tree-icon {
      flex-shrink: 0;
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      color: var(--text-secondary);
    }

    .tree-expand-icon {
      flex-shrink: 0;
      width: 12px;
      height: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 8px;
      color: var(--text-secondary);
      transition: transform 0.15s ease;
    }

    .tree-expand-icon.expanded {
      transform: rotate(90deg);
    }

    .tree-label {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 12px;
      color: var(--text-primary);
    }

    .note-child-prefix {
      color: var(--accent-color);
      font-weight: 600;
      font-size: 11px;
    }

    .add-file-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      width: 20px;
      height: 20px;
      padding: 0;
      font-size: 14px;
      font-weight: 600;
      background-color: var(--accent-color);
      color: white;
      border: none;
      border-radius: 3px;
      cursor: pointer;
      transition: all 0.15s ease;
      margin-left: auto;
    }

    .add-file-btn:hover:not(:disabled) {
      background-color: var(--accent-hover);
      transform: scale(1.05);
    }

    .add-file-btn:disabled {
      background-color: #34c759;
      cursor: not-allowed;
      opacity: 0.8;
    }

    .add-file-btn.hidden {
      display: none;
    }
  `

  constructor() {
    super()
    this.treeData = []
    this.disabled = false
    this.expandedNodes = new Map()
    this.selectedPath = null
  }

  render() {
    if (!this.treeData || this.treeData.length === 0) {
      return html`<div style="padding: 1rem; text-align: center; color: #999;">
        No files to display
      </div>`
    }

    return html`<ul>
      ${this.treeData.map((item) => this._renderTreeItem(item))}
    </ul>`
  }

  _renderTreeItem(item) {
    const isExpanded = this.expandedNodes.has(item.path)
    const isSelected = this.selectedPath === item.path
    const hasChildren = item.children && item.children.length > 0

    return html`
      <li>
        ${this._renderTreeNode(item, isExpanded, isSelected, hasChildren)}
        ${isExpanded && hasChildren
          ? html`<ul>
              ${item.children.map((child) => this._renderTreeItem(child))}
            </ul>`
          : ''}
      </li>
    `
  }

  _renderTreeNode(item, isExpanded, isSelected, hasChildren) {
    const itemClass = `tree-item ${isSelected ? 'selected' : ''} ${item.type || ''}`

    return html`
      <div class=${itemClass} @click=${(e) => this._handleItemClick(e, item)}>
        ${this._renderExpandIcon(item, isExpanded, hasChildren)} ${this._renderIcon(item)}
        ${item.type === 'note-child' ? html`<span class="note-child-prefix">↳ </span>` : ''}
        <span class="tree-label">${item.name}</span>
        ${this._renderAddButton(item)}
      </div>
    `
  }

  _renderExpandIcon(item, isExpanded, hasChildren) {
    if (item.type === 'directory' || item.type === 'pdf-parent' || item.type === 'note-parent') {
      return html`<span
        class="tree-expand-icon ${isExpanded ? 'expanded' : ''}"
        @click=${(e) => this._handleExpandClick(e, item)}
        >▶</span
      >`
    } else if (item.type === 'note-child' && hasChildren) {
      return html`<span
        class="tree-expand-icon ${isExpanded ? 'expanded' : ''}"
        @click=${(e) => this._handleExpandClick(e, item)}
        >▶</span
      >`
    }
    return html`<span class="tree-expand-icon"></span>`
  }

  _renderIcon(item) {
    let icon = '📄'
    if (item.type === 'directory') {
      icon = this.expandedNodes.has(item.path) ? '📂' : '📁'
    } else if (item.type === 'pdf-parent') {
      icon = '📝'
    } else if (item.type === 'note-parent' || item.type === 'note-child') {
      icon = '📄'
    }
    return html`<span class="tree-icon">${icon}</span>`
  }

  _renderAddButton(item) {
    // Don't show add button for directories or if disabled
    if (item.type === 'directory' || this.disabled) {
      return ''
    }

    // Check if file is already in queue
    const inQueue = item._inQueue || false
    const buttonText = inQueue ? '✓' : '+'

    return html`
      <button
        class="add-file-btn ${this.disabled ? 'hidden' : ''}"
        ?disabled=${inQueue}
        @click=${(e) => this._handleAddClick(e, item)}
      >
        ${buttonText}
      </button>
    `
  }

  async _handleExpandClick(e, item) {
    e.stopPropagation()

    const isExpanded = this.expandedNodes.has(item.path)

    if (!isExpanded) {
      // Load children if not loaded (for directories)
      if (item.type === 'directory' && (!item.children || item.children.length === 0)) {
        try {
          const result = await window.fileManager.getDirectoryTree(item.path, item.library_id)

          if (!result.success) {
            console.error('Failed to load directory:', result.error)
            alert(`Failed to load directory: ${result.error}`)
            return
          }

          item.children = result.data
        } catch (error) {
          console.error('Error loading children:', error)
          alert(`Error loading children: ${error.message}`)
          return
        }
      }
      this.expandedNodes.set(item.path, true)
    } else {
      this.expandedNodes.delete(item.path)
    }

    this.requestUpdate()
  }

  async _handleItemClick(e, item) {
    e.stopPropagation()

    // Only open files, not directories
    if (item.type !== 'directory') {
      this.selectedPath = item.path

      // Set the file's library ID before opening
      if (item.library_id) {
        window.currentFileLibraryId = item.library_id
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
      // Use the file's own library_id instead of workspace library_id
      const libraryId = item.library_id || window.currentWorkspaceLibraryId
      console.log('Adding file to queue with library ID:', libraryId)

      const result = await window.fileManager.addFileToQueue(item.path, libraryId)

      if (result.success || result.alreadyExists) {
        item._inQueue = true
        this.requestUpdate()

        // Dispatch event to notify other components that a file was added to queue
        window.dispatchEvent(
          new CustomEvent('file-added-to-queue', {
            detail: { filePath: item.path, libraryId: libraryId },
          })
        )
      } else {
        alert(`Error: ${result.error}`)
        console.error('Error adding file to queue:', result.error)
      }
    } catch (error) {
      console.error('Error adding file to queue:', error)

      alert(`Error: ${error.message}`)
      console.error('Error adding file to queue:', error)
    }
  }

  async updated(changedProperties) {
    super.updated(changedProperties)

    // Check queue status for all items when tree data changes
    if (changedProperties.has('treeData') && this.treeData.length > 0) {
      await this._checkQueueStatus(this.treeData)
    }
  }

  async _checkQueueStatus(items) {
    for (const item of items) {
      if (item.type !== 'directory' && item.path) {
        try {
          const result = await window.fileManager.checkFileInQueue(
            item.path,
            window.currentWorkspaceLibraryId
          )
          if (result.inQueue) {
            item._inQueue = true
          }
        } catch (error) {
          console.error('Error checking queue status:', error)
        }
      }

      if (item.children && item.children.length > 0) {
        await this._checkQueueStatus(item.children)
      }
    }
    this.requestUpdate()
  }
}

customElements.define('file-tree', FileTree)
