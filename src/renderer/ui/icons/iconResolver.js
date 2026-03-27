// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

export function resolveIcon(iconset, name) {
  switch (iconset) {
    case 'misc':
      return import('./iconset-misc.js').then((module) => module[name])
    default:
      throw new Error(`Unknown iconset: ${iconset}`)
  }
}
