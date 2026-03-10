// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Import Shoelace themes based on user's color scheme preference
import { icons } from '@lion/ui/icon.js'
import { resolveIcon } from './ui/icons/iconResolver.js'
import './ui/EditorPanel.js'
import './ui/FileManager.js'
import './ui/FileTree.js'
import './ui/revisionList.js'
import './ui/FeedbackBar.js'
import { initializeResizeHandles } from './ui/resize.js'
import './ui/codemirror-viewer.js'
import './ui/pdfViewer.js'
import './ui/HTMLViewer.js'
import './ui/MarkdownViewer.js'
import './ui/VideoViewer.js'
import './ui/FlashcardViewer.js'
import { setupExternalLinkInterceptor } from './ui/linkInterceptor.js'
import { setBasePath } from '@shoelace-style/shoelace/dist/utilities/base-path.js'

// Set the base path to the folder you copied Shoelace's assets to
setBasePath('node_modules/@shoelace-style/shoelace/dist')

// Register icon resolver for icon components
icons.addIconResolver('increvise', resolveIcon)

// Listen for color scheme changes and update theme dynamically
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  if (e.matches) {
    document.documentElement.classList.add('sl-theme-dark')
  } else {
    document.documentElement.classList.remove('sl-theme-dark')
  }
})

// Initialize platform-specific features
async function initPlatform() {
  // Check if running on Capacitor (mobile)
  if (typeof window !== 'undefined' && window.Capacitor) {
    const { initMobilePlatform } = await import('../mobile/init.js')
    const result = await initMobilePlatform()
    if (!result.success) {
      console.error('[Platform] Mobile platform initialization failed:', result.error)
      alert('Failed to initialize mobile platform: ' + result.error)
    }
  }
}

// Initialize platform first, then UI
initPlatform().then(() => {
  initializeResizeHandles()
  setupExternalLinkInterceptor()
})
