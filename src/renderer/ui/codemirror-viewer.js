// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { LitElement, html, css } from 'lit'
import {
  EditorView,
  lineNumbers,
  highlightActiveLine,
  Decoration,
  WidgetType,
} from '@codemirror/view'
import {
  EditorState,
  EditorSelection,
  StateField,
  StateEffect,
  Compartment,
} from '@codemirror/state'
import { javascript } from '@codemirror/lang-javascript'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { basicSetup } from 'codemirror'
import { isolateHistory } from '@codemirror/commands'

class LockedRange {
  constructor(
    originalStart,
    originalEnd,
    currentStart,
    currentEnd,
    childPath,
    childContent,
    offset = 0,
    originalSpan = null
  ) {
    // Original range in database (always reflects the actual lines in parent file)
    this.originalStart = originalStart
    this.originalEnd = originalEnd
    // Current range after line shifts from editing (visual position in editor)
    this.currentStart = currentStart
    this.currentEnd = currentEnd
    // Associated child note path
    this.childPath = childPath
    // Dynamic content from child note
    this.childContent = childContent || ''
    this.childLineCount = childContent ? childContent.split('\n').length : 0
    // Offset for dynamic content expansion (how many lines added/removed)
    this.offset = offset
    // Original span in parent file (end - start + 1)
    // This is needed to correctly calculate original range after line shifts
    this.originalSpan = originalSpan !== null ? originalSpan : originalEnd - originalStart + 1
  }

  // Update child content and recalculate line count
  updateContent(newContent) {
    this.childContent = newContent
    this.childLineCount = newContent ? newContent.split('\n').length : 0
  }
}

// Calculate line offsets for dynamic expansion/contraction
// Takes ranges with lineCount and returns adjusted positions
function calculateLineOffsets(ranges) {
  const adjustedRanges = []

  console.log('[calculateLineOffsets] Input ranges:', ranges.length)

  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i]
    const originalSpan = range.end - range.start + 1
    const actualSpan = range.lineCount

    // CRITICAL FIX: Each range should start at its original position in parent file
    // and expand/contract in place, without affecting subsequent ranges' start positions
    const adjustedStart = range.start
    const adjustedEnd = range.start + actualSpan - 1

    console.log(`[calculateLineOffsets] Range ${i}:`, {
      path: range.path,
      dbRange: `${range.start}-${range.end}`,
      originalSpan,
      actualSpan,
      adjustedRange: `${adjustedStart}-${adjustedEnd}`,
      offset: 0, // No cumulative offset needed
    })

    const adjustedRange = {
      ...range,
      adjustedStart: adjustedStart,
      adjustedEnd: adjustedEnd,
      offset: 0, // Each range expands in place
    }

    adjustedRanges.push(adjustedRange)
  }

  return adjustedRanges
}

// Widget for displaying child note content in place of locked lines
class ChildContentWidget extends WidgetType {
  constructor(range) {
    super()
    this.range = range
  }

  toDOM() {
    const container = document.createElement('div')
    container.className = 'child-content-block depth-1'

    // Badge showing child note filename (clickable)
    const badge = document.createElement('div')
    badge.className = 'child-badge'

    // Extract filename from path
    const filename = this.range.childPath.split('/').pop()
    badge.textContent = `📄 ${filename}`
    badge.title = this.range.childPath // Show full path on hover

    badge.onclick = (e) => {
      e.preventDefault()
      e.stopPropagation()
      // Dispatch custom event to open child note
      window.dispatchEvent(
        new CustomEvent('open-child-note', {
          detail: { path: this.range.childPath },
        })
      )
    }

    container.appendChild(badge)

    // Content display (multiple lines, preserved formatting)
    const contentDiv = document.createElement('pre')
    contentDiv.className = 'child-content-text'
    contentDiv.textContent = this.range.childContent
    container.appendChild(contentDiv)

    return container
  }

  // Widget equality check for performance optimization
  eq(other) {
    return (
      other instanceof ChildContentWidget &&
      other.range.childPath === this.range.childPath &&
      other.range.childContent === this.range.childContent
    )
  }

  // Ignore events on the widget (let parent handle)
  ignoreEvent() {
    return false
  }
}

/**
 * Helper: Get basename of a file path
 * @param {string} filePath - Full file path
 * @param {string} ext - Optional extension to remove
 * @returns {string} - Base name
 */
function basename(filePath, ext) {
  const parts = filePath.replace(/\\/g, '/').split('/')
  let name = parts[parts.length - 1] || ''
  if (ext && name.endsWith(ext)) {
    name = name.slice(0, -ext.length)
  }
  return name
}

/**
 * Helper: Get file extension
 * @param {string} filePath - Full file path
 * @returns {string} - Extension including dot (e.g., '.md')
 */
function extname(filePath) {
  const name = basename(filePath)
  const lastDot = name.lastIndexOf('.')
  return lastDot === -1 ? '' : name.slice(lastDot)
}

/**
 * Parse a hierarchical note filename
 * Format: rangeStart-rangeEnd-layer1Name.rangeStart-rangeEnd-layer2Name.md
 * Example: "10-20-introduction-to.15-18-core-concepts.md"
 * @param {string} fileName - The note filename without extension
 * @returns {Array|null} - Array of layer objects [{rangeStart, rangeEnd, name}, ...] or null
 */
function parseNoteFileName(fileName) {
  // Split by dots to get each layer
  const layers = fileName.split('.')
  const parsed = []

  for (const layer of layers) {
    // Match pattern: [optional p/l prefix]start-end[_ or end]name
    // Examples: "10-20_intro" (with underscore), "10-20" (range only, ends here), "notes" (no range)
    // If there's no underscore, the range must be at the end of the string
    const match = layer.match(/^[pl]?(\d+)-(\d+)(?:_|$)(.*)/)
    if (!match) {
      // No range found - treat as null range with name
      parsed.push({
        rangeStart: null,
        rangeEnd: null,
        name: layer,
      })
    } else {
      parsed.push({
        rangeStart: parseInt(match[1]),
        rangeEnd: parseInt(match[2]),
        name: match[3],
      })
    }
  }

  return parsed.length > 0 ? parsed : null
}

/**
 * Generate filename for a new child note
 * @param {string} parentFilePath - Path to parent note file
 * @param {number} rangeStart - Start line of extracted text
 * @param {number} rangeEnd - End line of extracted text
 * @param {string} extractedText - The extracted text to generate name from
 * @returns {string} - New filename without extension
 */
function generateChildNoteName(parentFilePath, rangeStart, rangeEnd, extractedText) {
  const parentFileName = basename(parentFilePath, extname(parentFilePath))
  const parentLayers = parseNoteFileName(parentFileName)

  // Strip HTML tags to get plain text for naming
  const plainText = extractedText.replace(/<[^>]*>/g, '').trim()

  // Configuration for name generation
  const MIN_LENGTH = 10 // Minimum character count (strict)
  const SOFT_MAX_LENGTH = 20 // Soft maximum - can exceed to complete a word
  const HARD_MAX_LENGTH = 30 // Hard maximum - never exceed

  /**
   * Generate a clean, multi-language compatible name from text
   * Supports: Latin, CJK (Chinese/Japanese/Korean), Cyrillic, etc.
   */
  /**
   * Generate a clean, multi-language compatible name from text
   * Supports: Latin, CJK (Chinese/Japanese/Korean), Cyrillic, etc.
   *
   * Strategy for CJK:
   * - Use punctuation as phrase boundaries
   * - After MIN_LENGTH characters, stop at next punctuation mark
   * - Don't add hyphens between CJK characters
   *
   * Strategy for Latin:
   * - Use spaces as word boundaries
   * - Add hyphens between words
   */
  function generateNameFromText(text) {
    if (!text || text.length === 0) return ''

    // Helper function to check if character is CJK
    function isCJKChar(code) {
      return (
        (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
        (code >= 0x3400 && code <= 0x4dbf) || // CJK Extension A
        (code >= 0x20000 && code <= 0x2a6df) || // CJK Extension B
        (code >= 0xf900 && code <= 0xfaff) || // CJK Compatibility Ideographs
        (code >= 0x3040 && code <= 0x309f) || // Hiragana
        (code >= 0x30a0 && code <= 0x30ff) || // Katakana
        (code >= 0xac00 && code <= 0xd7af) // Hangul
      )
    }

    // Helper function to check if character is CJK punctuation
    function isCJKPunct(char) {
      return /[。，、；：！？]/.test(char)
    }

    // First pass: clean the text
    let cleaned = text
      .replace(/["""''`]/g, '') // Remove quotes
      .replace(/[<>{}[\]()]/g, '') // Remove brackets
      .replace(/[*_~`|\\#]/g, '') // Remove markdown/special chars (including #)
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()

    if (cleaned.length === 0) return ''

    // Build the filename character by character
    let result = ''
    let lastWasCJK = false
    let lastWasSpace = false
    let reachedMin = false
    let reachedSoftMax = false

    for (let i = 0; i < cleaned.length; i++) {
      const char = cleaned[i]
      const code = char.charCodeAt(0)
      const isCJK = isCJKChar(code)
      const isPunct = isCJKPunct(char) || /[.,;:!?]/.test(char)

      // If we've reached minimum length and hit punctuation, stop
      if (reachedMin && isPunct) {
        break
      }

      // If we've exceeded soft max and hit a word boundary (space/punct), stop
      if (reachedSoftMax && (isPunct || char === ' ')) {
        break
      }

      // Skip punctuation (don't add to filename)
      if (isPunct) {
        lastWasSpace = true // Treat punctuation as word boundary
        continue
      }

      // Handle spaces
      if (char === ' ') {
        lastWasSpace = true
        continue
      }

      // Check if we would exceed hard maximum
      if (result.length >= HARD_MAX_LENGTH) {
        break
      }

      // Add separator if needed
      if (result.length > 0 && lastWasSpace) {
        // Only add hyphen between non-CJK words
        if (!isCJK && !lastWasCJK) {
          result += '-'
        }
        lastWasSpace = false
      }

      // Add the character (lowercase for Latin, keep CJK as-is)
      if (isCJK) {
        result += char
      } else {
        result += char.toLowerCase()
      }

      lastWasCJK = isCJK

      // Check if we've reached minimum length (count actual characters, not hyphens)
      const contentLength = result.replace(/-/g, '').length

      if (contentLength >= MIN_LENGTH) {
        reachedMin = true
      }

      // Check if we've exceeded soft max (including hyphens)
      if (result.length >= SOFT_MAX_LENGTH) {
        reachedSoftMax = true
      }
    }

    return result
  }

  const words = generateNameFromText(plainText)

  // Check if parent is truly a top-level file (no layers with ranges, or only null range)
  const isTopLevel =
    !parentLayers ||
    (parentLayers.length === 1 &&
      parentLayers[0].rangeStart === null &&
      parentLayers[0].rangeEnd === null)

  if (isTopLevel) {
    // Parent is a top-level file - extract name from filename (as fallback)
    const parentName = generateNameFromText(parentFileName) || parentFileName.substring(0, 20)

    // For HTML/semantic extractions (rangeStart/rangeEnd = 0), use words from content with 0-0 prefix
    // For text-line extractions, use range-based naming with parent name as fallback
    // For null ranges, omit the range prefix entirely
    if (rangeStart === null && rangeEnd === null) {
      return words || parentName || 'note'
    } else {
      return `${rangeStart}-${rangeEnd}_${words || parentName || 'note'}`
    }
  } else {
    // Flat structure: keep all parent layers, append new layer
    const allLayers = [...parentLayers, { rangeStart, rangeEnd, name: words || 'note' }]
    return allLayers
      .map((l) => {
        // Omit range prefix for null values
        if (l.rangeStart === null && l.rangeEnd === null) {
          return l.name
        }
        return `${l.rangeStart}-${l.rangeEnd}_${l.name}`
      })
      .join('.')
  }
}

export class CodeMirrorViewer extends LitElement {
  static properties = {
    content: { type: String },
    language: { type: String },
  }

  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      overflow: auto;
    }

    #editor-container {
      width: 100%;
      height: 100%;
    }
  `

  constructor() {
    super()
    this.content = '// Default content\nconsole.log("Hello, World!");'
    this.language = 'javascript'
    this.editorView = null
    this.lockedLines = new Set() // store locked line numbers
    this.lockedRanges = [] // store LockedRange objects
    this.hasRangeChanges = false // flag to indicate if ranges need database update
    this.isEditable = false
    this.hasUnsavedChanges = false
    this.editableCompartment = new Compartment()
    this.lineSelectionCompartment = new Compartment()
    this.themeCompartment = new Compartment() // for switching between preview/edit themes
    this.originalContentLength = 0 // track original content length before expansion
  }

  firstUpdated() {
    this.initializeEditor()
  }

  updated(changedProperties) {
    if (changedProperties.has('content') && this.editorView) {
      this.updateContent()
    }
  }

  initializeEditor() {
    const container = this.shadowRoot.getElementById('editor-container')

    // Create an effect for adding locked lines
    const addLockedLineEffect = StateEffect.define()

    // StateField that stores locked line decorations
    const lockedLinesField = StateField.define({
      create() {
        return Decoration.none
      },
      update(value, tr) {
        value = value.map(tr.changes)
        for (let effect of tr.effects) {
          if (effect.is(addLockedLineEffect)) {
            const decorations = []
            for (let lineNum of effect.value) {
              const line = tr.state.doc.line(lineNum)
              decorations.push(
                Decoration.line({
                  attributes: { class: 'cm-locked-line' },
                }).range(line.from)
              )
            }
            // Ranges must be added sorted by `from` position and `startSide`
            decorations.sort((a, b) => a.from - b.from)
            value = Decoration.set(decorations)
          }
        }
        return value
      },
      provide: (f) => EditorView.decorations.from(f),
    })

    // Create an effect for updating dynamic content (child note content display)
    const updateDynamicContentEffect = StateEffect.define()

    // StateField that stores dynamic content decorations
    // This replaces locked lines with child note content widgets
    const dynamicContentField = StateField.define({
      create() {
        return Decoration.none
      },
      update(decorations, tr) {
        decorations = decorations.map(tr.changes)

        for (let effect of tr.effects) {
          if (effect.is(updateDynamicContentEffect)) {
            const allDecorations = []

            for (let i = 0; i < effect.value.length; i++) {
              const range = effect.value[i]

              // Insert widget at the start of the range to show child content
              const startLine = tr.state.doc.line(range.currentStart)
              allDecorations.push(
                Decoration.widget({
                  widget: new ChildContentWidget(range),
                  side: -1, // Insert before the line
                  block: true, // Block-level widget (takes full line height)
                }).range(startLine.from)
              )

              // Hide all original locked lines by adding a class
              for (let lineNum = range.currentStart; lineNum <= range.currentEnd; lineNum++) {
                const line = tr.state.doc.line(lineNum)
                allDecorations.push(
                  Decoration.line({
                    attributes: { class: 'hidden-original-line' },
                  }).range(line.from)
                )
              }
            }

            // Sort decorations by position
            allDecorations.sort((a, b) => a.from - b.from || a.startSide - b.startSide)
            decorations = Decoration.set(allDecorations, true)
          }
        }

        return decorations
      },
      provide: (f) => EditorView.decorations.from(f),
    })

    // Whole-line selection extension (checks lock status)
    const lineSelectionExtension = EditorState.transactionFilter.of((tr) => {
      if (!tr.selection || !tr.isUserEvent('select')) {
        return tr
      }

      const { main } = tr.selection
      const doc = tr.state.doc

      // Convert charcter positions to line numbers
      const lineFrom = doc.lineAt(main.from)
      const lineTo = doc.lineAt(main.to)

      // Only set limit when start selection from allows clicking on extracted lines
      if (!this.lockedLines.has(lineFrom.number)) {
        // Selection cannot go into extracted lines
        for (let i = lineFrom.number; i <= lineTo.number; i++) {
          if (this.lockedLines.has(lineTo.number)) {
            return []
          }
        }
      }
      // Check whether the selection attempts to include locked lines
      for (let i = lineFrom.number; i <= lineTo.number; i++) {
        if (this.lockedLines.has(i)) {
          // If the selection includes locked lines, cancel this selection
          return []
        }
      }

      return [
        tr,
        {
          selection: EditorSelection.single(lineFrom.from, lineTo.to),
        },
      ]
    })

    // Mouse click selects the entire line (checks lock status)
    const lineClickHandler = EditorView.domEventHandlers({
      mousedown: (event, view) => {
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
        if (pos !== null) {
          const line = view.state.doc.lineAt(pos)
          const lineNum = line.number

          view.dispatch({
            selection: EditorSelection.single(line.from, line.to),
          })
        }
        return false
      },
    })

    const preventDragDropHandler = EditorView.domEventHandlers({
      // Prevent drag-and-drop operations
      dragstart(event, view) {
        event.preventDefault()
        return true
      },
      drop(event, view) {
        event.preventDefault()
        return true
      },
      dragover(event, view) {
        event.preventDefault()
        return true
      },
    })

    // Edit mode change filter, to prevents modifications to locked lines
    // allows selection, but blocks text changes
    const editModeChangeFilter = EditorState.changeFilter.of((tr) => {
      // Allow non-text-change transactions (like selection)
      if (!tr.docChanged) {
        return true
      }

      const oldDoc = tr.startState.doc
      const affectedRanges = []

      // Collect all affected ranges (fromA/toA are positions in the old document)
      tr.changes.iterChangedRanges((fromA, toA) => {
        affectedRanges.push({ from: fromA, to: toA })
      })

      // Check if any affected range touches locked lines in the old document
      for (let range of affectedRanges) {
        const lineFrom = oldDoc.lineAt(range.from)
        const lineTo = oldDoc.lineAt(range.to)

        for (let i = lineFrom.number; i <= lineTo.number; i++) {
          if (this.lockedLines.has(i)) {
            return false
          }
        }
      }

      return true
    })

    // Edit mode drag/drop handler - prevents drag from/drop to locked lines
    const editModeDragDropHandler = EditorView.domEventHandlers({
      dragstart: (event, view) => {
        // Get the position being dragged from
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
        if (pos !== null) {
          const line = view.state.doc.lineAt(pos)
          if (this.lockedLines.has(line.number)) {
            event.preventDefault()
            return true
          }
        }

        // Check if selection being dragged includes locked lines
        const { main } = view.state.selection
        const doc = view.state.doc
        const lineFrom = doc.lineAt(main.from)
        const lineTo = doc.lineAt(main.to)

        for (let i = lineFrom.number; i <= lineTo.number; i++) {
          if (this.lockedLines.has(i)) {
            event.preventDefault()
            return true
          }
        }

        return false
      },
      drop: (event, view) => {
        // Get the drop target position
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
        if (pos !== null) {
          const line = view.state.doc.lineAt(pos)
          if (this.lockedLines.has(line.number)) {
            event.preventDefault()
            return true
          }
        }
        return false
      },
      dragover: (event, view) => {
        // Get the position being dragged over
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
        if (pos !== null) {
          const line = view.state.doc.lineAt(pos)
          if (this.lockedLines.has(line.number)) {
            event.preventDefault()
            return true
          }
        }
        return false
      },
    })

    // Save the extensions so they can be reconfigured later
    this.lineSelectionExtension = lineSelectionExtension
    this.lineClickHandler = lineClickHandler
    this.preventDragDropHandler = preventDragDropHandler
    this.editModeChangeFilter = editModeChangeFilter
    this.editModeDragDropHandler = editModeDragDropHandler

    const previewModeTheme = EditorView.theme({
      '.cm-selectionBackground': {
        backgroundColor: 'rgba(75, 100, 160, 0.6)',
      },
      '.cm-line': {
        paddingLeft: '4px',
        paddingRight: '4px',
      },
      '&.cm-focused .cm-selectionBackground': {
        backgroundColor: 'rgba(75, 111, 170, 0.6) !important',
      },
      '.cm-locked-line': {
        backgroundColor: '#e2f4e5 !important',
        borderLeft: '3px solid #4ade80',
      },
      // Hide original locked lines when showing dynamic content
      '.hidden-original-line': {
        display: 'none !important',
        height: '0 !important',
        overflow: 'hidden !important',
      },
      // Child content block styling
      '.child-content-block': {
        margin: '4px 0',
        borderRadius: '4px',
        overflow: 'hidden',
        padding: '8px',
      },
      // Nesting depth colors (4 levels)
      '.child-content-block.depth-1': {
        backgroundColor: '#e2f4e5',
        borderLeft: '3px solid #4ade80',
      },
      '.child-content-block.depth-2': {
        backgroundColor: '#c8e6d0',
        borderLeft: '5px solid #3b9b5e',
      },
      '.child-content-block.depth-3': {
        backgroundColor: '#aed9b8',
        borderLeft: '7px solid #2d7a47',
      },
      '.child-content-block.depth-4': {
        backgroundColor: '#95c9a0',
        borderLeft: '9px solid #1f5a31',
      },
      // Badge styling
      '.child-badge': {
        display: 'inline-block',
        backgroundColor: '#4ade80',
        color: 'white',
        padding: '2px 8px',
        borderRadius: '3px',
        fontSize: '0.85em',
        fontWeight: 'bold',
        cursor: 'pointer',
        marginBottom: '4px',
        userSelect: 'none',
      },
      '.child-badge:hover': {
        backgroundColor: '#22c55e',
      },
      // Content text styling
      '.child-content-text': {
        padding: '4px 0',
        margin: 0,
        fontFamily: 'inherit',
        whiteSpace: 'pre-wrap',
        lineHeight: '1.5',
        fontSize: 'inherit',
      },
    })

    const editModeTheme = EditorView.theme({
      '.cm-selectionBackground': {
        backgroundColor: 'rgba(75, 100, 160, 0.6)',
      },
      '.cm-line': {
        paddingLeft: '4px',
        paddingRight: '4px',
      },
      '&.cm-focused .cm-selectionBackground': {
        backgroundColor: 'rgba(75, 111, 170, 0.6) !important',
      },
      '.cm-locked-line': {
        // Don't use backgroundColor, it covers selection. Use background-image instead
        borderLeft: '3px solid #4ade80', // thick green left border
        backgroundImage:
          'linear-gradient(90deg, rgba(42, 174, 64, 0.15) 0%, rgba(42, 174, 64, 0.08) 100%)', // subtle green gradient overlay
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat',
      },
      // Hide original locked lines when showing dynamic content
      '.hidden-original-line': {
        display: 'none !important',
        height: '0 !important',
        overflow: 'hidden !important',
      },
      // Child content block styling (same as preview mode)
      '.child-content-block': {
        margin: '4px 0',
        borderRadius: '4px',
        overflow: 'hidden',
        padding: '8px',
      },
      '.child-content-block.depth-1': {
        backgroundColor: '#e2f4e5',
        borderLeft: '3px solid #4ade80',
      },
      '.child-content-block.depth-2': {
        backgroundColor: '#c8e6d0',
        borderLeft: '5px solid #3b9b5e',
      },
      '.child-content-block.depth-3': {
        backgroundColor: '#aed9b8',
        borderLeft: '7px solid #2d7a47',
      },
      '.child-content-block.depth-4': {
        backgroundColor: '#95c9a0',
        borderLeft: '9px solid #1f5a31',
      },
      '.child-badge': {
        display: 'inline-block',
        backgroundColor: '#4ade80',
        color: 'white',
        padding: '2px 8px',
        borderRadius: '3px',
        fontSize: '0.85em',
        fontWeight: 'bold',
        cursor: 'pointer',
        marginBottom: '4px',
        userSelect: 'none',
      },
      '.child-badge:hover': {
        backgroundColor: '#22c55e',
      },
      '.child-content-text': {
        padding: '4px 0',
        margin: 0,
        fontFamily: 'inherit',
        whiteSpace: 'pre-wrap',
        lineHeight: '1.5',
        fontSize: 'inherit',
      },
    })

    this.previewModeTheme = previewModeTheme
    this.editModeTheme = editModeTheme

    // Track document changes for line shift detection and unsaved changes
    const trackChangesExtension = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        // Track line number changes for locked ranges in edit mode
        if (this.isEditable) {
          this.updateLockedRangesForChanges(update.changes, update.startState.doc, update.state.doc)

          this.hasUnsavedChanges = true
        }
      }
    })

    // Get language mode
    const languageExtension = this.getLanguageExtension()

    // Store effects for later use
    this.addLockedLineEffect = addLockedLineEffect
    this.updateDynamicContentEffect = updateDynamicContentEffect

    // Store extensions for later reuse (when clearing history)
    this.baseExtensions = [
      basicSetup,
      markdown(),
      languageExtension,
      lockedLinesField,
      dynamicContentField, // Add dynamic content field
      trackChangesExtension,
      this.lineSelectionCompartment.of([
        lineSelectionExtension,
        lineClickHandler,
        preventDragDropHandler,
      ]),
      this.themeCompartment.of(previewModeTheme),
      EditorView.lineWrapping,
      highlightActiveLine(),
      this.editableCompartment.of([EditorState.readOnly.of(true), EditorView.editable.of(false)]),
    ]

    // Create the editor state
    const startState = EditorState.create({
      doc: this.content,
      extensions: this.baseExtensions,
    })

    // Create the editor view
    this.editorView = new EditorView({
      state: startState,
      parent: container,
    })
  }

  getLanguageExtension() {
    switch (this.language) {
      case 'javascript':
      case 'js':
        return javascript()
      default:
        return javascript()
    }
  }

  updateContent() {
    if (!this.editorView) return

    this.editorView.dispatch({
      changes: {
        from: 0,
        to: this.editorView.state.doc.length,
        insert: this.content,
      },
      annotations: [isolateHistory.of('full')],
    })
  }

  // Clear undo history by recreating the editor state
  clearHistory() {
    if (!this.editorView) return

    const currentContent = this.editorView.state.doc.toString()

    // Create a new state with the same extensions but fresh history
    const newState = EditorState.create({
      doc: currentContent,
      extensions: this.baseExtensions,
    })

    // Replace the state - this clears all history
    this.editorView.setState(newState)

    // Re-apply locked lines and dynamic content if any exist
    if (this.lockedRanges.length > 0) {
      // Check if we have dynamic content
      const hasDynamicContent = this.lockedRanges[0].childContent !== ''

      if (hasDynamicContent) {
        try {
          // Validate that line numbers are within document bounds
          const docLines = this.editorView.state.doc.lines

          // Check if all ranges are valid
          let allRangesValid = true
          for (let range of this.lockedRanges) {
            if (range.currentStart < 1 || range.currentEnd > docLines) {
              console.error(
                '[clearHistory] Invalid range detected:',
                `${range.currentStart}-${range.currentEnd}`,
                'in',
                docLines,
                'line document'
              )
              allRangesValid = false
              break
            }
          }

          if (allRangesValid) {
            this.applyDynamicContent(this.lockedRanges)
          } else {
            console.warn('[clearHistory] Skipping re-apply due to invalid range')
            // Clear invalid ranges
            this.lockedRanges = []
            this.lockedLines.clear()
          }
        } catch (error) {
          console.error('[clearHistory] Error re-applying dynamic content:', error)
        }
      } else {
        try {
          // Validate line numbers
          const docLines = this.editorView.state.doc.lines
          const validLines = Array.from(this.lockedLines).filter(
            (line) => line >= 1 && line <= docLines
          )

          if (validLines.length !== this.lockedLines.size) {
            console.warn(
              '[clearHistory] Some locked lines are invalid:',
              this.lockedLines.size - validLines.length,
              'out of bounds'
            )
          }

          if (validLines.length > 0) {
            this.editorView.dispatch({
              effects: this.addLockedLineEffect.of(validLines),
            })
          }
        } catch (error) {
          console.error('[clearHistory] Error re-applying locked lines:', error)
        }
      }
    }
  }

  // Public method to get selected lines
  getSelectedLines() {
    if (!this.editorView) return []

    const { main } = this.editorView.state.selection
    const doc = this.editorView.state.doc
    const lineFrom = doc.lineAt(main.from)
    const lineTo = doc.lineAt(main.to)

    const lines = []
    for (let i = lineFrom.number; i <= lineTo.number; i++) {
      if (!this.lockedLines.has(i)) {
        const line = doc.line(i)
        lines.push({
          number: i,
          text: line.text,
          from: line.from,
          to: line.to,
        })
      }
    }

    return lines
  }

  /**
   * Extract selected lines to a new note
   * @param {string} filePath - The file path for extraction
   * @returns {Object} - {success: boolean, error?: string}
   */
  async extractSelection(filePath) {
    // Get selected lines
    const selectedLines = this.getSelectedLines()
    if (!selectedLines || selectedLines.length === 0) {
      return { success: false, error: 'Please select lines to extract' }
    }

    const selectedText = selectedLines.map((line) => line.text).join('\n')
    if (!selectedText.trim()) {
      return { success: false, error: 'Please select text to extract' }
    }

    if (!filePath) {
      return { success: false, error: 'File path not provided' }
    }

    // Extract line numbers for range tracking
    const rangeStart = selectedLines[0].number
    const rangeEnd = selectedLines[selectedLines.length - 1].number
    const libraryId = window.currentFileLibraryId

    if (!libraryId) {
      return { success: false, error: 'Library ID not set' }
    }

    try {
      // Generate child note filename
      const childFileName = generateChildNoteName(filePath, rangeStart, rangeEnd, selectedText)

      // Call extraction API with generated filename
      const result = await window.fileManager.extractNote(
        filePath,
        selectedText,
        childFileName,
        rangeStart,
        rangeEnd,
        libraryId
      )

      // Check if extraction was successful
      if (!result.success) {
        return { success: false, error: result.error || 'Unknown extraction error' }
      }

      await this.lockLineRanges(filePath)
      this.clearHistory()
      return { success: true }
    } catch (error) {
      console.error('Failed to extract note:', error)
      return { success: false, error: error.message }
    }
  }

  // Lock the currently selected lines
  lockSelectedLines() {
    if (!this.editorView) return []

    const selectedLines = this.getSelectedLines()
    if (selectedLines.length === 0) return []

    // First, add the selected line numbers to the lockedLines set
    const lineNumbers = selectedLines.map((l) => l.number)
    lineNumbers.forEach((num) => this.lockedLines.add(num))

    // Then, update editor decorations
    this.editorView.dispatch({
      effects: this.addLockedLineEffect.of(Array.from(this.lockedLines)),
    })

    // Clear the current selection
    this.editorView.dispatch({
      selection: EditorSelection.single(0, 0),
    })
    return selectedLines
  }

  // Get all locked lines
  getLockedLines() {
    if (!this.editorView) return []

    const doc = this.editorView.state.doc
    const lockedLines = []

    for (let lineNum of this.lockedLines) {
      if (lineNum <= doc.lines) {
        const line = doc.line(lineNum)
        lockedLines.push({
          number: lineNum,
          text: line.text,
          from: line.from,
          to: line.to,
        })
      }
    }

    return lockedLines
  }

  // Clear all locked lines
  clearLockedLines() {
    this.lockedLines.clear()
    if (this.editorView) {
      this.editorView.dispatch({
        effects: this.addLockedLineEffect.of([]),
      })
    }
  }

  // Lock multiple line ranges when first load the document
  // Ranges data is from database with child content
  // Format: [{start: 10, end: 15, path: 'note.md', content: '...', lineCount: 5}, ...]
  // Returns: { success: boolean, error?: string }
  async lockLineRanges(filePath, useDynamicContent = true) {
    let ranges
    try {
      ranges = await window.fileManager.getChildRanges(filePath, window.currentFileLibraryId)
    } catch (error) {
      console.error('Failed to get child ranges:', error)
      this.clearLockedLines()
      return { success: false, error: 'Failed to load child ranges' }
    }

    if (!ranges || ranges.length === 0) {
      this.clearLockedLines()
      return { success: true }
    }

    // Clear existing data from last document load
    this.lockedLines.clear()
    this.lockedRanges = []

    if (useDynamicContent) {
      // Step 1: Calculate line offsets for dynamic expansion/contraction
      const adjustedRanges = calculateLineOffsets(ranges)

      // Step 1.5: Check if we need to expand document to fit all ranges
      const docLines = this.editorView.state.doc.lines

      // Find the maximum line number needed
      let maxLineNeeded = docLines
      for (let i = 0; i < adjustedRanges.length; i++) {
        const adjusted = adjustedRanges[i]
        if (adjusted.adjustedEnd > maxLineNeeded) {
          maxLineNeeded = adjusted.adjustedEnd
        }
      }

      // If we need more lines, temporarily expand the document
      if (maxLineNeeded > docLines) {
        const linesToAdd = maxLineNeeded - docLines

        // Get current content
        const currentContent = this.editorView.state.doc.toString()

        // Store original content length for later (when saving)
        this.originalContentLength = currentContent.length

        // Add empty lines at the end
        const emptyLines = '\n'.repeat(linesToAdd)
        const expandedContent = currentContent + emptyLines

        // Update editor content
        this.editorView.dispatch({
          changes: {
            from: 0,
            to: this.editorView.state.doc.length,
            insert: expandedContent,
          },
        })
      } else {
        // No expansion needed, store current length
        this.originalContentLength = this.editorView.state.doc.length
      }

      // Step 1.6: Validate that all adjusted ranges are now within document bounds
      const updatedDocLines = this.editorView.state.doc.lines
      let hasInvalidRange = false
      for (let i = 0; i < adjustedRanges.length; i++) {
        const adjusted = adjustedRanges[i]
        if (
          adjusted.adjustedStart < 1 ||
          adjusted.adjustedEnd > updatedDocLines ||
          adjusted.adjustedStart > adjusted.adjustedEnd
        ) {
          console.error(`[lockLineRanges] Invalid adjusted range ${i}:`)
          console.error(
            '  - Adjusted range:',
            `${adjusted.adjustedStart} to ${adjusted.adjustedEnd}`
          )
          console.error('  - Document lines:', updatedDocLines)
          console.error('  - Original range:', `${ranges[i].start} to ${ranges[i].end}`)
          console.error('  - Line count:', adjusted.lineCount)
          console.error('  - Path:', ranges[i].path)
          console.error('  - Offset:', adjusted.offset)
          hasInvalidRange = true
        }
      }

      if (hasInvalidRange) {
        console.error(
          '[lockLineRanges] Aborting: one or more ranges are invalid even after expansion'
        )
        console.error(
          '[lockLineRanges] This may indicate overlapping ranges or incorrect offset calculation'
        )
        return { success: false, error: 'Invalid line ranges detected' }
      }

      // Step 2: Create LockedRange objects with adjusted positions
      for (let i = 0; i < ranges.length; i++) {
        const original = ranges[i]
        const adjusted = adjustedRanges[i]

        // Calculate original span (actual lines in parent file)
        const originalSpan = original.end - original.start + 1

        const lockRange = new LockedRange(
          original.start, // originalStart
          original.end, // originalEnd
          adjusted.adjustedStart, // currentStart (after offset)
          adjusted.adjustedEnd, // currentEnd (after offset)
          original.path, // childPath
          original.content, // childContent
          adjusted.offset, // offset for dynamic expansion
          originalSpan // original span in parent file
        )
        this.lockedRanges.push(lockRange)

        // Populate lockedLines Set with adjusted line numbers
        for (let lineNum = adjusted.adjustedStart; lineNum <= adjusted.adjustedEnd; lineNum++) {
          this.lockedLines.add(lineNum)
        }
      }

      // Step 3: Apply dynamic content decorations (widgets + hidden lines)
      this.applyDynamicContent(this.lockedRanges)

      return { success: true }
    } else {
      // no dynamic content
      for (let range of ranges) {
        const lockRange = new LockedRange(
          range.start,
          range.end,
          range.start, // currentStart and end initially same as original
          range.end,
          range.path, // Associated child note path
          '', // No content
          1 // Default depth
        )
        this.lockedRanges.push(lockRange)

        // Populate lockedLines Set for rendering
        for (let i = range.start; i <= range.end; i++) {
          this.lockedLines.add(i)
        }
      }

      // Update UI with all locked lines (old style, just highlighting)
      this.editorView.dispatch({
        effects: this.addLockedLineEffect.of(Array.from(this.lockedLines)),
      })
    }
    this.clearHistory()
    return { success: true }
  }

  // Apply dynamic content decorations (called by lockLineRanges)
  applyDynamicContent(lockedRanges) {
    if (!this.editorView || !lockedRanges || lockedRanges.length === 0) {
      return
    }

    // Dispatch effect to update dynamic content decorations
    this.editorView.dispatch({
      effects: this.updateDynamicContentEffect.of(lockedRanges),
    })
  }

  // Get original content without temporary expansion lines. The expansion lines are used for dynamic rendering of child notes.
  getOriginalContent() {
    if (!this.editorView) return ''

    const fullContent = this.editorView.state.doc.toString()

    // If we have stored original length, use it to trim expanded content
    if (this.originalContentLength > 0 && fullContent.length > this.originalContentLength) {
      return fullContent.substring(0, this.originalContentLength)
    }

    // No expansion, return full content
    return fullContent
  }

  // Public method to set content
  setContent(newContent) {
    this.content = newContent

    // Clear all locked lines and dynamic content state when loading new file
    this.lockedLines.clear()
    this.lockedRanges = []
    this.originalContentLength = 0

    // Clear dynamic content decorations by dispatching empty effect
    if (this.editorView) {
      this.editorView.dispatch({
        effects: [this.addLockedLineEffect.of([]), this.updateDynamicContentEffect.of([])],
      })
    }
    this.hasUnsavedChanges = false
  }

  // Enable edit mode
  enableEditing() {
    if (!this.editorView || this.isEditable) return

    this.isEditable = true
    this.editorView.dispatch({
      effects: [
        this.editableCompartment.reconfigure([
          EditorState.readOnly.of(false),
          EditorView.editable.of(true),
        ]),
        this.lineSelectionCompartment.reconfigure([
          this.editModeChangeFilter,
          this.editModeDragDropHandler,
        ]),
        this.themeCompartment.reconfigure(this.editModeTheme),
      ],
    })
  }

  // Disable edit mode
  disableEditing() {
    if (!this.editorView || !this.isEditable) return

    this.isEditable = false
    this.editorView.dispatch({
      effects: [
        this.editableCompartment.reconfigure([
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
        ]),
        this.lineSelectionCompartment.reconfigure([
          this.lineSelectionExtension,
          this.lineClickHandler,
          this.preventDragDropHandler,
        ]), // re-enable whole-line selection
        this.themeCompartment.reconfigure(this.previewModeTheme),
      ],
    })
  }

  // Check whether the viewer is in edit mode
  isEditMode() {
    return this.isEditable
  }

  // Update locked ranges when document changes (for line shift tracking)
  updateLockedRangesForChanges(changes, oldDoc, newDoc) {
    if (this.lockedRanges.length === 0) return

    let hasChanges = false

    changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
      // toA: original end position in old text
      // toB: new end position in new change
      const oldEndLine = oldDoc.lineAt(toA).number
      const newEndLine = newDoc.lineAt(toB).number

      // Calculate how many lines the endlines shifts (added/removed) for each change
      // Only need to consider end line shifts, as previous changes will have adjusted start positions
      const lineDelta = newEndLine - oldEndLine

      if (lineDelta === 0) return // No line count change

      const changeStartLine = oldDoc.lineAt(fromA).number
      for (let range of this.lockedRanges) {
        // CRITICAL FIX: For dynamic content, we need to check against originalStart, not currentStart
        // because the change in parent file affects the original position, not the expanded position
        const referenceStart = range.offset !== 0 ? range.originalStart : range.currentStart

        // If range is entirely after the change, shift both start and end
        if (referenceStart > changeStartLine) {
          range.currentStart += lineDelta
          range.currentEnd += lineDelta

          // For dynamic content, also shift the original range
          // For non-dynamic content, original follows current
          if (range.offset !== 0) {
            range.originalStart += lineDelta
            range.originalEnd += lineDelta
          } else {
            range.originalStart = range.currentStart
            range.originalEnd = range.currentEnd
          }

          hasChanges = true
        }
        // When lines are inserted/deleted within a locked range, only adjust end
        // This is not expected to be happening, but handle it just in case
        else if (range.currentEnd >= changeStartLine && referenceStart < changeStartLine) {
          range.currentEnd += lineDelta

          if (range.offset !== 0) {
            range.originalEnd += lineDelta
          } else {
            range.originalEnd = range.currentEnd
          }

          hasChanges = true
        }
      }
    })

    if (hasChanges) {
      this.hasRangeChanges = true
      this.rebuildLockedLinesSet()
    }
  }

  // Rebuild lockedLines Set from lockedRanges
  rebuildLockedLinesSet() {
    this.lockedLines.clear()

    for (let range of this.lockedRanges) {
      for (let i = range.currentStart; i <= range.currentEnd; i++) {
        this.lockedLines.add(i)
      }
    }

    // Re-render decorations
    if (this.editorView) {
      this.editorView.dispatch({
        effects: this.addLockedLineEffect.of(Array.from(this.lockedLines)),
      })
    }
  }

  // Get range updates that need to be saved to database
  getRangeUpdates() {
    const updates = []

    for (let range of this.lockedRanges) {
      if (range.currentStart !== range.originalStart || range.currentEnd !== range.originalEnd) {
        updates.push({
          childPath: range.childPath,
          originalStart: range.originalStart,
          originalEnd: range.originalEnd,
          newStart: range.currentStart,
          newEnd: range.currentEnd,
        })
      }
    }

    return updates
  }

  async saveFile(filePath) {
    try {
      if (this.hasRangeChanges) {
        const rangeUpdates = this.getRangeUpdates()
        if (rangeUpdates.length > 0) {
          await window.fileManager.updateLockedRanges(
            filePath,
            rangeUpdates,
            window.currentFileLibraryId
          )
        }

        // After saving, the originalStart/End have already been updated correctly
        // in updateLockedRangesForChanges() to reflect the true position in parent file.
        // For dynamic content mode, originalStart/End != currentStart/End due to expansion.
        // For non-dynamic mode, they should be equal.
        // We just need to reset the hasRangeChanges flag.
        this.hasRangeChanges = false
      }
      const content = this.getOriginalContent()
      const result = await window.fileManager.writeFile(filePath, content)
      if (result.success) {
        this.hasUnsavedChanges = false
        return { success: true }
      } else {
        return { success: false, error: result.error }
      }
    } catch (error) {
      console.error('Error saving file:', error)
      return { success: false, error: error.message }
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    if (this.editorView) {
      this.editorView.destroy()
    }
  }

  render() {
    return html`<div id="editor-container"></div>`
  }
}

// Register custom element
customElements.define('codemirror-viewer', CodeMirrorViewer)
