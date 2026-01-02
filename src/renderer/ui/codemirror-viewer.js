// SPDX-FileCopyrightText: 2025 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { LitElement, html, css } from 'lit'
import { EditorView, lineNumbers, highlightActiveLine, Decoration } from '@codemirror/view'
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

class LockedRange {
  constructor(originalStart, originalEnd, currentStart, currentEnd, childPath) {
    //
    this.originalStart = originalStart
    this.originalEnd = originalEnd
    this.currentStart = currentStart
    this.currentEnd = currentEnd
    this.childPath = childPath
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

    // Store addLockedLineEffect for later use
    this.addLockedLineEffect = addLockedLineEffect

    // Create the editor state
    const startState = EditorState.create({
      doc: this.content,
      extensions: [
        basicSetup,
        markdown(),
        languageExtension,
        lockedLinesField,
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
      ],
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
    })
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
  // Ranges data is from database, format: [{start: 10, end: 15, path: 'note.md'}, {start: 20, end: 25, path: 'note2.md'}]
  lockLineRanges(ranges) {
    if (!this.editorView || !ranges || ranges.length === 0) return

    // Clear existing data from last document load
    this.lockedLines.clear()
    this.lockedRanges = []

    // Store complete range information for tracking
    for (let range of ranges) {
      const lockRange = new LockedRange(
        range.start,
        range.end,
        range.start, // currontStart and end initially same as original
        range.end,
        range.path // Associated child note path
      )
      this.lockedRanges.push(lockRange)

      // Populate lockedLines Set for rendering
      for (let i = range.start; i <= range.end; i++) {
        this.lockedLines.add(i)
      }
    }

    // Update UI with all locked lines
    this.editorView.dispatch({
      effects: this.addLockedLineEffect.of(Array.from(this.lockedLines)),
    })

    this.hasRangeChanges = false
    console.log('Locked line ranges:', ranges)
    console.log('Total locked lines:', this.lockedLines.size)
  }

  // Public method to set content
  setContent(newContent) {
    this.content = newContent
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
