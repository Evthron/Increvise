// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Toolbar management utilities

const editorToolbar = document.getElementById('editor-toolbar')

/**
 * Hides the editor toolbar
 */
export function hideToolbar() {
  if (editorToolbar) {
    editorToolbar.classList.add('hidden')
  }
}

/**
 * Shows the editor toolbar
 */
export function showToolbar() {
  if (editorToolbar) {
    editorToolbar.classList.remove('hidden')
  }
}
