// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { basename } from './path'

export function extractOrigFilename(filename) {
  if (!filename.includes(' -- ')) {
    const match = basename(filename).match(/(.+?)(\.(\w+))??$/)
    const origFilename = match[1]
    return origFilename
  } else {
    // regex adapted from https://github.com/novoid/filetags
    const match = basename(filename).match(/(.+?) -- (.+?)(\.(\w+))??$/)

    const origFilename = match[1]
    return origFilename
  }
}
