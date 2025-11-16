// SPDX-FileCopyrightText: 2025 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

import '../renderer/ui/editor.js'
import '../renderer/ui/fileTree.js'
import '../renderer/ui/revisionList.js'
import { initializeResizeHandles } from '../renderer/ui/resize.js'
import { loadRecentWorkspaces } from '../renderer/ui/workspace.js'

initializeResizeHandles()
loadRecentWorkspaces()
