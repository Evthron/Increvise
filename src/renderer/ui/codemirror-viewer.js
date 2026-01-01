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
    this.isEditable = false
    this.editableCompartment = new Compartment()
    this.lineSelectionCompartment = new Compartment()
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

    // Save the extensions so they can be reconfigured later
    this.lineSelectionExtension = lineSelectionExtension
    this.lineClickHandler = lineClickHandler

    // Whole-line highlight theme (includes locked line style)
    const lineHighlightTheme = EditorView.theme({
      '.cm-selectionBackground': {
        backgroundColor: '#3d5a80 !important',
      },
      '.cm-line': {
        paddingLeft: '4px',
        paddingRight: '4px',
      },
      '&.cm-focused .cm-selectionBackground': {
        backgroundColor: '#4a6fa5 !important',
      },
      '.cm-locked-line': {
        backgroundColor: '#2aae40 !important', // green background indicates locked
        borderLeft: '3px solid #4ade80', // green left border
      },
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
        this.lineSelectionCompartment.of([lineSelectionExtension, lineClickHandler]),
        lineHighlightTheme,
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

  // Lock multiple line ranges from database
  // ranges: [{start: 10, end: 15}, {start: 20, end: 25}]
  lockLineRanges(ranges) {
    if (!this.editorView || !ranges || ranges.length === 0) return

    // Add all ranges to lockedLines set
    for (let range of ranges) {
      for (let i = range.start; i <= range.end; i++) {
        this.lockedLines.add(i)
      }
    }

    // Update UI with all locked lines
    this.editorView.dispatch({
      effects: this.addLockedLineEffect.of(Array.from(this.lockedLines)),
    })

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
        this.lineSelectionCompartment.reconfigure([]), // disable whole-line selection
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
        ]), // re-enable whole-line selection
      ],
    })
  }

  // Check whether the viewer is in edit mode
  isEditMode() {
    return this.isEditable
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
