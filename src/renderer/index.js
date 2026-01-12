// SPDX-FileCopyrightText: 2025 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

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

initializeResizeHandles()
setupExternalLinkInterceptor()
