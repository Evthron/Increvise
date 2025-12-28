// SPDX-FileCopyrightText: 2025 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

import './ui/editor.js'
import './ui/fileTree.js'
import './ui/revisionList.js'
import { initFeedbackButtons } from './ui/feedbackButtons.js'
import { initializeResizeHandles } from './ui/resize.js'
import { loadRecentWorkspaces } from './ui/workspace.js'
import './ui/codemirror-viewer.js'
import './ui/pdfViewer.js'

initializeResizeHandles()
loadRecentWorkspaces()
initFeedbackButtons()
