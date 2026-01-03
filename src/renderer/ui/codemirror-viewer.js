// SPDX-FileCopyrightText: 2025 The Increvise Project Contributors
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
  constructor(originalStart, originalEnd, currentStart, currentEnd, childPath, childContent) {
    // Original range in database
    this.originalStart = originalStart
    this.originalEnd = originalEnd
    // Current range after line shifts from editing
    this.currentStart = currentStart
    this.currentEnd = currentEnd
    // Associated child note path
    this.childPath = childPath
    // Dynamic content from child note
    this.childContent = childContent || ''
    this.childLineCount = childContent ? childContent.split('\n').length : 0
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
  let currentLineOffset = 0
  const adjustedRanges = []

  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i]
    const originalSpan = range.end - range.start + 1
    const actualSpan = range.lineCount

    const adjustedRange = {
      ...range,
      adjustedStart: range.start + currentLineOffset,
      adjustedEnd: range.start + currentLineOffset + actualSpan - 1,
      offset: currentLineOffset,
    }

    adjustedRanges.push(adjustedRange)

    const offsetChange = actualSpan - originalSpan
    currentLineOffset += offsetChange
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
        // Track line number changes for locked ranges in edito mode
        if (this.isEditable) {
          this.updateLockedRangesForChanges(update.changes, update.startState.doc, update.state.doc)

          // Dispatch a custom event to notify that the document has changed
          this.dispatchEvent(
            new CustomEvent('content-changed', {
              bubbles: true,
              composed: true,
              detail: { hasChanges: true },
            })
          )
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
  lockLineRanges(ranges, useDynamicContent = true) {
    if (!this.editorView || !ranges || ranges.length === 0) {
      return { success: false, error: 'No editor or no ranges' }
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

        const lockRange = new LockedRange(
          original.start, // originalStart
          original.end, // originalEnd
          adjusted.adjustedStart, // currentStart (after offset)
          adjusted.adjustedEnd, // currentEnd (after offset)
          original.path, // childPath
          original.content // childContent
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

      return { success: true }
    }
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

  // Get original content without temporary expansion lines
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
        // If range is entirely after the change, shift both start and end
        if (range.currentStart > changeStartLine) {
          range.currentStart += lineDelta
          range.currentEnd += lineDelta
          hasChanges = true
        }
        // When lines are inserted/deleted within a locked range, only adjust end
        // This is not expected to be happening, but handle it just in case
        else if (range.currentEnd >= changeStartLine && range.currentStart < changeStartLine) {
          range.currentEnd += lineDelta
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

  // Confirm range updates after successful save
  confirmRangeUpdates() {
    for (let range of this.lockedRanges) {
      range.originalStart = range.currentStart
      range.originalEnd = range.currentEnd
    }
    this.hasRangeChanges = false
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
