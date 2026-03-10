// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// File Manager Lit component
// Manages workspace history, file tree, and folder selection

import { LitElement, html, css } from 'lit'
import { LionDrawer } from '@lion/ui/drawer.js'
import '@lion/ui/button.js'
import '@lion/ui/define/lion-icon.js'
import '@shoelace-style/shoelace/dist/components/split-panel/split-panel.js'
import './WorkspaceManager.js'

const EVENT = {
  TRANSITION_END: 'transitionend',
  TRANSITION_START: 'transitionstart',
}

class SidebarDrawer extends LionDrawer {
  static get styles() {
    return [
      ...super.styles,
      css`
        :host {
          display: flex;
          --min-width: 30px;
          --max-width: 20vw;
          --max-height: unset;
          background-color: var(--bg-sidebar);
          border-right: 1px solid var(--border-color);
        }

        .container {
          display: flex;
          flex-direction: column;
          height: 100%;
          width: 100%;
        }

        .headline-container {
          padding: 12px 16px;
          border-bottom: 1px solid var(--border-color);
          background-color: var(--toolbar-bg);
        }

        .content-container {
          display: flex;
          height: 100%;
        }
      `,
    ]
  }

  // The source function forgets to check the source of the event, all transition event inside the content node would trigger this
  _waitForTransition({ contentNode }) {
    return new Promise((resolve) => {
      const transitionStarted = (event) => {
        // Check if the event is from the contentNode itself, not its children
        if (event.target !== contentNode) {
          return
        }
        contentNode.removeEventListener(EVENT.TRANSITION_START, transitionStarted)
        this.transitioning = true
      }
      contentNode.addEventListener(EVENT.TRANSITION_START, transitionStarted)

      const transitionEnded = (event) => {
        // Check if the event is from the contentNode itself, not its children
        if (event.target !== contentNode) {
          return
        }
        contentNode.removeEventListener(EVENT.TRANSITION_END, transitionEnded)
        this.transitioning = false
        resolve()
      }
      contentNode.addEventListener(EVENT.TRANSITION_END, transitionEnded)
    })
  }
}

export class FileManager extends LitElement {
  static properties = {
    currentRootPath: { type: String, state: true },
    isAllWorkspacesMode: { type: Boolean, state: true },
    treeData: { type: Array, state: true },
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      background-color: var(--bg-sidebar);
    }

    /* .sidebar-header {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color);
      background-color: var(--toolbar-bg);
    } */

    .headline-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--text-secondary);
      letter-spacing: 0.5px;
      margin: 0;
    }

    .sidebar-content {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }
  `

  constructor() {
    super()
    this.currentRootPath = null
    this.isAllWorkspacesMode = false
    this.treeData = []
    // Detect if running on mobile (Capacitor)
    this.isMobile = typeof window !== 'undefined' && window.Capacitor !== undefined
  }

  async connectedCallback() {
    super.connectedCallback()
    // Listen for workspace selection events from WorkspaceManager
    this.addEventListener('workspace-selected', this._handleWorkspaceSelected)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.removeEventListener('workspace-selected', this._handleWorkspaceSelected)
  }

  _handleWorkspaceSelected = async (event) => {
    const { folderPath, isAllWorkspacesMode } = event.detail

    if (isAllWorkspacesMode) {
      await this.openAllWorkspaces()
    } else {
      await this.openWorkspace(folderPath)
    }
  }

  render() {
    return html`
      <sidebar-drawer
        opened
        @opened-changed=${(ev) => {
          const sidebarDrawer = this.shadowRoot.querySelector('sidebar-drawer')
          const contentNode = sidebarDrawer.shadowRoot.querySelector('.content-container')
          if (contentNode) {
            contentNode.style.setProperty('display', ev.target.opened ? '' : 'none')
          }
        }}
      >
        <div class="headline" slot="headline">
          <h3 class="headline-title">File Manager</h3>
        </div>
        <lion-button slot="invoker">
          <lion-icon
            icon-id="increvise:misc:arrowLeft"
            style="width: 16px; height: 16px;"
          ></lion-icon>
        </lion-button>
        <div slot="content">
          <sl-split-panel vertical style="height: 100%">
            <div
              slot="start"
              style="height: 100%; width: 100%; background: var(--sl-color-neutral-50); display: flex; overflow: hidden;"
            >
              <div class="sidebar-content">
                <file-tree
                  .treeData=${this.treeData}
                  .disabled=${this.isAllWorkspacesMode}
                ></file-tree>
              </div>
            </div>
            <div
              slot="end"
              style="height: 100%; width: 100%; background: var(--sl-color-neutral-50); display: flex; overflow: hidden;"
            >
              <workspace-manager></workspace-manager>
            </div>
          </sl-split-panel>
        </div>
      </sidebar-drawer>
    `
  }

  async openWorkspace(folderPath) {
    try {
      // Stop current revision workflow before switching workspace
      const feedbackBar = document.querySelector('feedback-bar')
      if (feedbackBar) {
        feedbackBar.stopRevisionWorkflow()
      }

      // Update state
      this.currentRootPath = folderPath
      this.isAllWorkspacesMode = false

      // Update WorkspaceManager component
      const workspaceManager = this.shadowRoot.querySelector('workspace-manager')
      if (workspaceManager) {
        workspaceManager.selectSingleWorkspace(folderPath)
      }

      // Update global window properties
      window.currentRootPath = folderPath
      window.isAllWorkspacesMode = false

      // Dispatch event
      window.dispatchEvent(
        new CustomEvent('workspace-mode-changed', {
          detail: { isAll: false, path: folderPath },
        })
      )

      // Single workspace mode
      await this._openSingleWorkspace(folderPath)
    } catch (error) {
      console.error('Error opening workspace:', error)
      alert(`Error opening workspace: ${error.message}`)
    }

    // Register add button guard for ALL workspaces mode
    this._registerAddButtonGuard()
  }

  async openAllWorkspaces() {
    try {
      // Stop current revision workflow before switching workspace
      const feedbackBar = document.querySelector('feedback-bar')
      if (feedbackBar) {
        feedbackBar.stopRevisionWorkflow()
      }

      // Update state
      this.currentRootPath = null
      this.isAllWorkspacesMode = true

      // Update WorkspaceManager component
      const workspaceManager = this.shadowRoot.querySelector('workspace-manager')
      if (workspaceManager) {
        workspaceManager.selectAllWorkspaces()
      }

      // Update global window properties for backward compatibility
      window.currentRootPath = null
      window.isAllWorkspacesMode = true

      // Dispatch event
      window.dispatchEvent(
        new CustomEvent('workspace-mode-changed', {
          detail: { isAll: true, path: null },
        })
      )

      // Open all workspaces combined view
      await this._openAllWorkspaces()
    } catch (error) {
      console.error('Error opening all workspaces:', error)
      alert(`Error opening all workspaces: ${error.message}`)
    }

    // Register add button guard for ALL workspaces mode
    this._registerAddButtonGuard()
  }

  async refreshCurrentWorkspace() {
    if (!this.isAllWorkspacesMode && !this.currentRootPath) {
      console.warn('No workspace is currently open')
      return
    }

    try {
      if (this.isAllWorkspacesMode) {
        await this._openAllWorkspaces()
      } else {
        // Refresh the directory tree for single workspace
        const result = await window.fileManager.getDirectoryTree(
          this.currentRootPath,
          window.currentWorkspaceLibraryId
        )

        if (!result.success) {
          console.error('Failed to refresh directory tree:', result.error)
          alert(`Failed to refresh dir：${result.error}`)
          return
        }

        this.treeData = result.data

        // Also refresh the revision list
        const revisionList = document.querySelector('revision-list')
        if (revisionList) {
          await revisionList.refreshFileList()
        }
      }
    } catch (error) {
      console.error('Error refreshing workspace:', error)
    }
  }

  async _openAllWorkspaces() {
    try {
      const workspaces = await window.fileManager.getRecentWorkspaces()
      const combined = []

      // Loop through each workspace and get its directory tree
      for (const ws of workspaces) {
        const result = await window.fileManager.getDirectoryTree(ws.folder_path, ws.library_id)

        if (!result.success) {
          console.error(`Failed to load workspace ${ws.folder_path}:`, result.error)
          continue // Skip this workspace but continue with others
        }

        const nodes = Array.isArray(result.data)
          ? result.data
          : Array.isArray(result.data?.children)
            ? result.data.children
            : []
        combined.push(...nodes)
      }

      this.treeData = combined

      // Refresh workspace list in WorkspaceManager
      const workspaceManager = this.shadowRoot.querySelector('workspace-manager')
      if (workspaceManager) {
        await workspaceManager.loadRecentWorkspaces()
      }

      const revisionList = document.querySelector('revision-list')

      if (revisionList) {
        // Use refreshFileList to respect the current view mode
        await revisionList.refreshFileList()

        // Auto-start revision workflow if files are available
        const filteredFiles = revisionList.getFilteredFiles()
        if (filteredFiles.length > 0) {
          const feedbackBar = document.querySelector('feedback-bar')
          if (feedbackBar) {
            await feedbackBar.startRevisionWorkflow(filteredFiles)
          }
        }
      }
    } catch (error) {
      console.error('Error loading combined workspace view:', error)
      alert(`Error loading combined view: ${error.message}`)
      console.error('Error loading combined workspace view:', error)
    }
  }

  async _openSingleWorkspace(folderPath) {
    // Database and tree setup
    // On mobile, skip createDatabase as workspace DB is already opened during import
    if (!this.isMobile) {
      const dbResult = await window.fileManager.createDatabase(folderPath)
      if (dbResult.success) {
        console.log('Database ready at:', dbResult.path)
        window.currentWorkspaceLibraryId = dbResult.libraryId
        console.log('Workspace Library ID:', dbResult.libraryId)
      } else {
        console.warn('Database setup warning:', dbResult.error)
      }
    } else {
      // On mobile, folderPath is actually the DB name
      // Extract library_id from the workspace DB
      try {
        const { sqliteAdapter } = await import('../../adapters/sqlite-adapter.js')
        const library = await sqliteAdapter.getOne(
          folderPath,
          'SELECT library_id FROM library LIMIT 1'
        )
        if (library) {
          window.currentWorkspaceLibraryId = library.library_id
          console.log('Mobile Workspace Library ID:', library.library_id)
        } else {
          console.error('No library found in workspace DB:', folderPath)
        }
      } catch (error) {
        console.error('Error getting library ID from workspace:', error)
      }
    }

    await window.fileManager.recordWorkspace(folderPath)
    console.log('Workspace recorded in central database')

    // On mobile, skip directory tree loading (read-only mode)
    if (!this.isMobile) {
      try {
        const result = await window.fileManager.getDirectoryTree(
          folderPath,
          window.currentWorkspaceLibraryId
        )

        if (!result.success) {
          console.error('Failed to load directory tree:', result.error)
          alert(`Failed to load directory tree: ${result.error}`)
          this.treeData = []
        } else {
          console.log('Directory tree received:', result.data)
          this.treeData = result.data
        }
      } catch (error) {
        console.error('Error fetching directory tree:', error)
        alert(`Error fetching directory tree:：${error.message}`)
        this.treeData = []
      }
    } else {
      // Mobile: no directory tree, just empty array
      this.treeData = []
      console.log('[Mobile] Skipped directory tree loading (read-only mode)')
    }

    // Refresh workspace list in WorkspaceManager
    const workspaceManager = this.shadowRoot.querySelector('workspace-manager')
    if (workspaceManager) {
      await workspaceManager.loadRecentWorkspaces()
    }

    const revisionList = document.querySelector('revision-list')

    if (revisionList) {
      // Use refreshFileList to respect the current view mode
      await revisionList.refreshFileList()

      // Auto-start revision workflow if files are available
      const filteredFiles = revisionList.getFilteredFiles()
      if (filteredFiles.length > 0) {
        const feedbackBar = document.querySelector('feedback-bar')
        if (feedbackBar) {
          await feedbackBar.startRevisionWorkflow(filteredFiles)
        }
      }
    }
  }

  _registerAddButtonGuard() {
    if (!window.__addGuardRegistered) {
      document.addEventListener('click', (e) => {
        const btn = e.target.closest('.add-file-btn, [data-action="add-file"]')
        if (!btn) return
        if (window.isAllWorkspacesMode) {
          e.preventDefault()
          this._showToast('Cannot add files in All Workspaces view')
        }
      })
      window.__addGuardRegistered = true
    }
  }

  _showToast(message) {
    const toast = document.getElementById('toast')
    if (toast) {
      toast.textContent = message
      toast.classList.add('show')
      setTimeout(() => toast.classList.remove('show'), 1800)
    }
  }
}

customElements.define('file-manager', FileManager)
customElements.define('sidebar-drawer', SidebarDrawer)
