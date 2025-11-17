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
    this.content = '// 默認內容\nconsole.log("Hello, World!");'
    this.language = 'javascript'
    this.editorView = null
    this.lockedLines = new Set() // 儲存已鎖定的行號
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

    // 創建添加鎖定行的 Effect
    const addLockedLineEffect = StateEffect.define()

    // 儲存鎖定行的 StateField
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
            value = Decoration.set(decorations)
          }
        }
        return value
      },
      provide: (f) => EditorView.decorations.from(f),
    })

    // 整行選取擴展（檢查鎖定狀態）
    const lineSelectionExtension = EditorState.transactionFilter.of((tr) => {
      if (!tr.selection || !tr.isUserEvent('select')) {
        return tr
      }

      const { main } = tr.selection
      const doc = tr.state.doc

      const lineFrom = doc.lineAt(main.from)
      const lineTo = doc.lineAt(main.to)

      // 檢查是否嘗試選取已鎖定的行
      for (let i = lineFrom.number; i <= lineTo.number; i++) {
        if (this.lockedLines.has(i)) {
          // 如果包含鎖定的行，取消這次選取
          return []
        }
      }

      if (main.from !== lineFrom.from || main.to !== lineTo.to) {
        return [
          tr,
          {
            selection: EditorSelection.single(lineFrom.from, lineTo.to),
          },
        ]
      }

      return tr
    })

    // 滑鼠點擊選取整行（檢查鎖定狀態）
    const lineClickHandler = EditorView.domEventHandlers({
      mousedown: (event, view) => {
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
        if (pos !== null) {
          const line = view.state.doc.lineAt(pos)
          const lineNum = line.number

          // 檢查是否點擊已鎖定的行
          if (this.lockedLines.has(lineNum)) {
            event.preventDefault()
            return true
          }

          view.dispatch({
            selection: EditorSelection.single(line.from, line.to),
          })
        }
        return false
      },
      // 禁止拖放操作
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

    // 儲存擴展以便後續重新配置
    this.lineSelectionExtension = lineSelectionExtension
    this.lineClickHandler = lineClickHandler

    // 整行高亮樣式（包含鎖定行樣式）
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
        backgroundColor: '#2d4a3e !important', // 綠色背景表示已鎖定
        borderLeft: '3px solid #4ade80', // 左邊綠色邊框
      },
    })

    // 獲取語言模式
    const languageExtension = this.getLanguageExtension()

    // 儲存 addLockedLineEffect 以便後續使用
    this.addLockedLineEffect = addLockedLineEffect

    // 創建編輯器狀態
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

    // 創建編輯器視圖
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

  // 提供公共方法獲取選中的行
  getSelectedLines() {
    if (!this.editorView) return []

    const { main } = this.editorView.state.selection
    const doc = this.editorView.state.doc
    const lineFrom = doc.lineAt(main.from)
    const lineTo = doc.lineAt(main.to)

    const lines = []
    for (let i = lineFrom.number; i <= lineTo.number; i++) {
      const line = doc.line(i)
      lines.push({
        number: i,
        text: line.text,
        from: line.from,
        to: line.to,
      })
    }

    return lines
  }

  // 鎖定當前選中的行
  lockSelectedLines() {
    if (!this.editorView) return []

    const selectedLines = this.getSelectedLines()
    if (selectedLines.length === 0) return []

    // 添加到鎖定行集合
    const lineNumbers = selectedLines.map((l) => l.number)
    lineNumbers.forEach((num) => this.lockedLines.add(num))

    // 更新編輯器裝飾
    this.editorView.dispatch({
      effects: this.addLockedLineEffect.of(Array.from(this.lockedLines)),
    })

    // 清除當前選取
    this.editorView.dispatch({
      selection: EditorSelection.single(0, 0),
    })

    return selectedLines
  }

  // 獲取所有已鎖定的行
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

  // 清除所有鎖定
  clearLockedLines() {
    this.lockedLines.clear()
    if (this.editorView) {
      this.editorView.dispatch({
        effects: this.addLockedLineEffect.of([]),
      })
    }
  }

  // 提供公共方法設置內容
  setContent(newContent) {
    this.content = newContent
  }

  // 啟用編輯模式
  enableEditing() {
    if (!this.editorView || this.isEditable) return

    this.isEditable = true
    this.editorView.dispatch({
      effects: [
        this.editableCompartment.reconfigure([
          EditorState.readOnly.of(false),
          EditorView.editable.of(true),
        ]),
        this.lineSelectionCompartment.reconfigure([]), // 禁用整行選取
      ],
    })
  }

  // 禁用編輯模式
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
        ]), // 重新啟用整行選取
      ],
    })
  }

  // 檢查是否處於編輯模式
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

// 註冊自定義元素
customElements.define('codemirror-viewer', CodeMirrorViewer)
