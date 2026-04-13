// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// MarkdownViewer.js
import { LitElement, html, css } from 'lit'
import { marked } from 'marked'
import { basename, extname } from './path.js'

// Track source positions by counting lines
class SourcePositionTracker {
  constructor(markdown) {
    this.source = markdown
    this.lines = markdown.split('\n')
    this.tokenPositions = new Map()
  }

  // Find line range for a given raw text
  findLineRange(raw) {
    if (!raw) return { start: 1, end: 1 }

    // Find the position of this raw text in source
    const index = this.source.indexOf(raw)
    if (index === -1) return { start: 1, end: 1 }

    // Count newlines before this position for start line
    const beforeText = this.source.substring(0, index)
    const startLine = (beforeText.match(/\n/g) || []).length + 1

    // Count newlines within the raw text for end line
    const newlinesInToken = (raw.match(/\n/g) || []).length
    const endLine = startLine + newlinesInToken

    return { start: startLine, end: endLine }
  }
}

// Custom renderer that adds source line numbers to all HTML tags
class LineNumberRenderer extends marked.Renderer {
  constructor(options, tracker) {
    super(options)
    this.tracker = tracker
  }

  // Helper to add data-line-start and data-line-end attributes
  addLineAttrs(raw) {
    const range = this.tracker.findLineRange(raw)
    return ` data-line-start="${range.start}" data-line-end="${range.end}"`
  }

  heading(token) {
    const text = this.parser.parseInline(token.tokens)
    const lineAttrs = this.addLineAttrs(token.raw)
    const tag = 'h' + token.depth
    return `<${tag}${lineAttrs}>${text}</${tag}>\n`
  }

  paragraph(token) {
    const text = this.parser.parseInline(token.tokens)
    const lineAttrs = this.addLineAttrs(token.raw)
    return `<p${lineAttrs}>${text}</p>\n`
  }

  blockquote(token) {
    const body = this.parser.parse(token.tokens)
    const lineAttrs = this.addLineAttrs(token.raw)
    return `<blockquote${lineAttrs}>\n${body}</blockquote>\n`
  }

  list(token) {
    const lineAttrs = this.addLineAttrs(token.raw)
    const type = token.ordered ? 'ol' : 'ul'
    const startatt = token.ordered && token.start !== 1 ? ' start="' + token.start + '"' : ''
    const body = token.items
      .map((item) => {
        return this.listitem(item)
      })
      .join('')
    return `<${type}${startatt}${lineAttrs}>\n${body}</${type}>\n`
  }

  listitem(item) {
    const lineAttrs = this.addLineAttrs(item.raw)
    let text = ''
    if (item.task) {
      const checkbox = `<input ${item.checked ? 'checked="" ' : ''}disabled="" type="checkbox">`
      if (item.loose) {
        if (item.tokens.length > 0 && item.tokens[0].type === 'paragraph') {
          item.tokens[0].text = checkbox + ' ' + item.tokens[0].text
          if (
            item.tokens[0].tokens &&
            item.tokens[0].tokens.length > 0 &&
            item.tokens[0].tokens[0].type === 'text'
          ) {
            item.tokens[0].tokens[0].text = checkbox + ' ' + item.tokens[0].tokens[0].text
          }
        } else {
          item.tokens.unshift({
            type: 'text',
            raw: checkbox + ' ',
            text: checkbox + ' ',
          })
        }
      } else {
        text += checkbox + ' '
      }
    }
    text += this.parser.parse(item.tokens, item.loose)
    return `<li${lineAttrs}>${text}</li>\n`
  }

  code(token) {
    const lineAttrs = this.addLineAttrs(token.raw)
    const lang = token.lang || ''
    const langClass = lang ? ` class="language-${lang}"` : ''
    const escapedCode = token.text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
    return `<pre${lineAttrs}><code${langClass}>${escapedCode}</code></pre>\n`
  }

  table(token) {
    const lineAttrs = this.addLineAttrs(token.raw)

    let thead = '<thead>\n<tr>'
    token.header.forEach((cell, i) => {
      const align = token.align[i]
      const alignAttr = align ? ` align="${align}"` : ''
      thead += `<th${alignAttr}>${this.parser.parseInline(cell.tokens)}</th>`
    })
    thead += '</tr>\n</thead>\n'

    let tbody = ''
    if (token.rows.length > 0) {
      tbody += '<tbody>\n'
      token.rows.forEach((row) => {
        tbody += '<tr>'
        row.forEach((cell, i) => {
          const align = token.align[i]
          const alignAttr = align ? ` align="${align}"` : ''
          tbody += `<td${alignAttr}>${this.parser.parseInline(cell.tokens)}</td>`
        })
        tbody += '</tr>\n'
      })
      tbody += '</tbody>\n'
    }

    return `<table${lineAttrs}>\n${thead}${tbody}</table>\n`
  }

  hr(token) {
    const lineAttrs = this.addLineAttrs(token.raw)
    return `<hr${lineAttrs}>\n`
  }

  strong(token) {
    const text = this.parser.parseInline(token.tokens)
    return `<strong>${text}</strong>`
  }

  em(token) {
    const text = this.parser.parseInline(token.tokens)
    return `<em>${text}</em>`
  }

  codespan(token) {
    return `<code>${token.text}</code>`
  }

  link(token) {
    const text = this.parser.parseInline(token.tokens)
    return `<a href="${token.href}"${token.title ? ` title="${token.title}"` : ''}>${text}</a>`
  }

  image(token) {
    return `<img src="${token.href}" alt="${token.text}"${token.title ? ` title="${token.title}"` : ''}>`
  }
}

/**
 * Convert markdown to HTML with source line numbers
 * @param {string} markdown - Markdown text to convert
 * @returns {string} HTML with data-line-start and data-line-end attributes
 */
function markdownToHtml(markdown, includeLineNumbers = true) {
  const tracker = new SourcePositionTracker(markdown)
  const renderer = new LineNumberRenderer({}, tracker)

  marked.setOptions({
    gfm: true,
    breaks: true,
    tables: true,
    renderer: includeLineNumbers ? renderer : new marked.Renderer(),
  })

  return marked.parse(markdown)
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

export class MarkdownViewer extends LitElement {
  static properties = {
    isLoading: { type: Boolean },
    errorMessage: { type: String },
    content: { type: String },
    showLinkDialog: { type: Boolean },
    previewUrl: { type: String },
    renderedHtml: { type: String, state: true },
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      background: var(--viewer-bg, #fff);
      color: var(--viewer-foreground, #111);
      position: relative;
    }

    .loading-message,
    .error-message,
    .empty-message {
      padding: 1rem;
      text-align: center;
      color: var(--viewer-muted, #666);
      flex: 0 0 auto;
    }

    .error-message {
      color: var(--viewer-error, #b00020);
    }

    .markdown-viewer {
      flex: 1 1 auto;
      overflow: auto;
      padding: 1rem;
      max-width: 900px;
      margin: 0;
      font-size: 1rem;
      line-height: 1.5;
    }
    /* Basic markdown styles */
    .markdown-viewer h1,
    .markdown-viewer h2,
    .markdown-viewer h3 {
      margin-top: 1.25rem;
      margin-bottom: 0.5rem;
    }
    .markdown-viewer p {
      margin: 0.5rem 0;
    }
    .markdown-viewer pre {
      background: #f6f8fa;
      padding: 0.75rem;
      border-radius: 6px;
      overflow: auto;
    }
    .markdown-viewer code {
      background: #f3f4f6;
      padding: 0.1rem 0.25rem;
      border-radius: 4px;
      font-family:
        ui-monospace, SFMono-Regular, Menlo, Monaco, 'Roboto Mono', 'Courier New', monospace;
    }
    img {
      max-width: 100%;
      height: auto;
    }

    /* Table styles */
    .markdown-viewer table {
      border-collapse: collapse;
      width: 100%;
      margin: 1rem 0;
      display: table;
      overflow-x: auto;
    }
    .markdown-viewer table thead {
      background-color: #f6f8fa;
    }
    .markdown-viewer table th,
    .markdown-viewer table td {
      border: 1px solid #d0d7de;
      padding: 0.5rem 0.75rem;
      text-align: left;
    }
    .markdown-viewer table th {
      font-weight: 600;
      border-bottom: 2px solid #d0d7de;
    }
    .markdown-viewer table tr:nth-child(even) {
      background-color: #f6f8fa;
    }
    .markdown-viewer table tr:hover {
      background-color: #f0f3f6;
    }

    /* Locked/extracted content styles */
    .extracted-content {
      background: linear-gradient(
        to right,
        rgba(255, 237, 213, 0.5) 0%,
        rgba(255, 237, 213, 0.2) 100%
      );
      border-left: 4px solid #ff9800;
      padding-left: 0.75rem;
      margin-left: -0.25rem;
      border-radius: 0 4px 4px 0;
      box-shadow: 0 1px 3px rgba(255, 152, 0, 0.1);
      user-select: none;
      pointer-events: auto;
      transition: all 0.2s ease;
      position: relative;
    }

    .extracted-controls {
      position: absolute;
      top: 4px;
      right: 4px;
      display: inline-flex;
      gap: 4px;
      pointer-events: auto;
    }

    .extracted-toggle,
    .extracted-open,
    .extracted-replace {
      position: absolute;
      background: rgba(255, 152, 0, 0.15);
      border: 1px solid rgba(255, 152, 0, 0.3);
      border-radius: 4px;
      padding: 2px 8px;
      font-size: 0.75rem;
      cursor: pointer;
      pointer-events: auto;
      user-select: none;
      color: #e65100;
      transition: all 0.2s ease;
    }

    .extracted-toggle,
    .extracted-open,
    .extracted-replace {
      position: static;
    }

    .extracted-toggle:hover,
    .extracted-open:hover,
    .extracted-replace:hover {
      background: rgba(255, 152, 0, 0.3);
    }

    .extracted-toggle.active {
      background: rgba(76, 175, 80, 0.15);
      border-color: rgba(76, 175, 80, 0.3);
      color: #2e7d32;
    }

    .extracted-recursive-content {
      pointer-events: auto;
      user-select: text;
    }

    .selected-content {
      background: linear-gradient(
        to right,
        rgba(225, 225, 213, 0.5) 0%,
        rgba(225, 225, 213, 0.2) 100%
      );
      border-left: 4px solid #50b01d;
      padding-left: 0.75rem;
      margin-left: -0.25rem;
      border-radius: 0 4px 4px 0;
      box-shadow: 0 1px 3px rgba(255, 152, 0, 0.1);
    }

    .link-dialog-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
    }

    .link-dialog {
      background: #fff;
      color: #111;
      padding: 1rem;
      border-radius: 8px;
      width: min(800px, 90vw);
      max-height: 80vh;
      overflow: auto;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
    }

    .link-url {
      font-size: 0.9rem;
      word-break: break-all;
      color: #2563eb;
      margin: 0.25rem 0 0.75rem;
    }

    .preview {
      background: #f3f4f6;
      padding: 0.75rem;
      border-radius: 6px;
      max-height: 40vh;
      overflow: auto;
      margin-bottom: 0.75rem;
      border: 1px solid #e5e7eb;
    }

    .preview.loading {
      font-style: italic;
      color: #6b7280;
    }

    .dialog-actions {
      display: flex;
      gap: 0.5rem;
      justify-content: flex-end;
    }

    .dialog-actions button {
      padding: 0.35rem 0.8rem;
      border: 1px solid #d1d5db;
      background: #fff;
      cursor: pointer;
    }
  `

  constructor() {
    super()
    this.isLoading = false
    this.errorMessage = ''
    this.content = ''
    this.renderedHtml = ''
    this.markdownSource = '' // Store raw markdown source for extraction
    this.showLinkDialog = false
    this.previewUrl = ''
    this.extractedTexts = [] // Store extracted content for locking (legacy text-based)
    this.extractedRanges = [] // Store extracted line ranges: [{start, end, path}, ...]
    this.renderModes = new Map() // path -> 'original' | 'recursive'
    this._extractedElements = new Map() // path -> elements[]
    this._extractedOriginals = new WeakMap() // element -> { html, start, end }
    this._toggleHosts = new Map() // path -> element
    this._linkHandler = (event) => {
      const anchor = event.composedPath().find((n) => n?.tagName === 'A')
      const href = anchor?.getAttribute?.('href') || ''
      const isExternal = /^https?:\/\//i.test(href) || href.startsWith('//')
      if (anchor && isExternal) {
        event.preventDefault()
        this.openLinkDialog(href)
      }
    }
    // Track drag selection state
    this._isDragging = false
    this._dragStartLine = null
    this._dragEndLine = null

    // Mouse down handler - start drag selection
    this._mouseDownHandler = (event) => {
      const path = event.composedPath()

      // Find the first element with line numbers in the event path
      const element = path.find(
        (el) =>
          el.nodeType === 1 &&
          el.hasAttribute &&
          el.hasAttribute('data-line-start') &&
          el.hasAttribute('data-line-end')
      )

      if (!element || element.classList.contains('extracted-content')) {
        return
      }

      this._isDragging = true
      this._dragStartLine = parseInt(element.getAttribute('data-line-start'))
      this._dragEndLine = parseInt(element.getAttribute('data-line-end'))
    }

    // Mouse move handler - update drag selection
    this._mouseMoveHandler = (event) => {
      if (!this._isDragging) return

      const path = event.composedPath()
      const element = path.find(
        (el) =>
          el.nodeType === 1 &&
          el.hasAttribute &&
          el.hasAttribute('data-line-start') &&
          el.hasAttribute('data-line-end')
      )

      if (!element) return

      this._dragEndLine = parseInt(element.getAttribute('data-line-end'))

      // Update selection highlights in real-time
      this._updateDragSelection()
    }

    // Mouse up handler - finish drag selection
    this._mouseUpHandler = () => {
      if (!this._isDragging) return

      this._isDragging = false
      this._updateDragSelection()
    }
  }

  /**
   * Update drag selection highlighting
   * Highlights all elements within the dragged range
   */
  _updateDragSelection() {
    const viewer = this.shadowRoot?.querySelector('.markdown-viewer')
    if (!viewer) return

    let minLine = Math.min(this._dragStartLine, this._dragEndLine)
    let maxLine = Math.max(this._dragStartLine, this._dragEndLine)

    // Find all elements with line numbers
    const elements = viewer.querySelectorAll('[data-line-start][data-line-end]')

    // Check if selection range contains any extracted content
    // If so, adjust the range to stop before the extracted content
    let foundExtracted = false
    let adjustedMaxLine = maxLine

    elements.forEach((el) => {
      const elStart = parseInt(el.getAttribute('data-line-start'))
      const elEnd = parseInt(el.getAttribute('data-line-end'))

      // Check if this element is extracted and overlaps with selection
      if (el.classList.contains('extracted-content')) {
        const overlaps = elStart <= maxLine && elEnd >= minLine

        if (overlaps && !foundExtracted) {
          // Found extracted content in selection range
          foundExtracted = true
          // Adjust max line to stop before this extracted element
          if (this._dragEndLine > this._dragStartLine) {
            // Dragging forward - stop before extracted content
            adjustedMaxLine = Math.min(adjustedMaxLine, elStart - 1)
          } else {
            // Dragging backward - stop before extracted content
            minLine = Math.max(minLine, elEnd + 1)
          }
        }
      }
    })

    // If we found extracted content, update the drag end line and stop dragging
    if (foundExtracted) {
      if (this._dragEndLine > this._dragStartLine) {
        this._dragEndLine = adjustedMaxLine
      } else {
        this._dragStartLine = minLine
      }
      maxLine = adjustedMaxLine
      this._isDragging = false
    }

    // Apply selection to elements
    elements.forEach((el) => {
      // Skip extracted content
      if (el.classList.contains('extracted-content')) {
        return
      }

      const elStart = parseInt(el.getAttribute('data-line-start'))
      const elEnd = parseInt(el.getAttribute('data-line-end'))

      // Check if this element overlaps with the selected range
      const overlaps = elStart <= maxLine && elEnd >= minLine

      if (overlaps) {
        el.classList.add('selected-content')
      } else {
        el.classList.remove('selected-content')
      }
    })
  }

  /**
   * Clear all selected content
   */
  clearSelectedContent() {
    const viewer = this.shadowRoot?.querySelector('.markdown-viewer')
    if (!viewer) return

    viewer.querySelectorAll('.selected-content').forEach((el) => {
      el.classList.remove('selected-content')
    })

    this._dragStartLine = null
    this._dragEndLine = null
  }

  /**
   * Extract the content selected by drag selection (based on line numbers)
   * @param {string} filePath - The file path to extract from
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async extractSelection(filePath) {
    // Check if there's a drag selection
    if (this._dragStartLine === null || this._dragEndLine === null) {
      return { success: false, error: 'No content selected' }
    }

    if (!filePath) {
      return { success: false, error: 'File path not provided' }
    }

    if (!this.markdownSource) {
      return { success: false, error: 'No markdown source available' }
    }

    // Calculate line range
    const minLine = Math.min(this._dragStartLine, this._dragEndLine)
    const maxLine = Math.max(this._dragStartLine, this._dragEndLine)

    // Extract the selected lines from the markdown source
    const lines = this.markdownSource.split('\n')
    const selectedLines = lines.slice(minLine - 1, maxLine) // Line numbers are 1-indexed
    const selectedText = selectedLines.join('\n').trim()

    if (!selectedText) {
      return { success: false, error: 'No text selected' }
    }

    const libraryId = window.currentFile.libraryId

    try {
      // Generate child note filename with line range
      const childFileName = generateChildNoteName(filePath, minLine, maxLine, selectedText)

      // Extract note with generated filename and line numbers
      const result = await window.fileManager.extractNote(
        filePath,
        selectedText,
        childFileName,
        minLine,
        maxLine,
        libraryId
      )

      // Check if extraction was successful
      if (!result.success) {
        return { success: false, error: result.error || 'Unknown extraction error' }
      }

      // Clear the selection after successful extraction
      this.clearSelectedContent()

      return { success: true }
    } catch (error) {
      console.error('Failed to extract drag selection:', error)
      return { success: false, error: error.message }
    }
  }

  async replaceRangeWithChildContent(childPath) {
    if (!this.currentFilePath) {
      return { success: false, error: 'Parent file path not set' }
    }

    if (!childPath) {
      return { success: false, error: 'Child path not provided' }
    }

    const libraryId = window.currentFile.libraryId
    if (!libraryId) {
      return { success: false, error: 'Library ID not set' }
    }

    const result = await window.fileManager.replaceChildRangeWithChildContent(
      this.currentFilePath,
      childPath,
      libraryId
    )

    if (!result?.success) {
      return { success: false, error: result?.error || 'Replace failed' }
    }

    const reload = await window.fileManager.readFile(this.currentFilePath)
    if (!reload?.success) {
      return { success: false, error: reload?.error || 'Failed to reload parent content' }
    }

    this.setMarkdown(reload.content)
    await this.loadAndLockExtractedContent(this.currentFilePath)

    return { success: true }
  }

  /**
   * Apply highlighting to extracted ranges after rendering
   */
  applyExtractedHighlighting() {
    if (this.extractedRanges.length === 0) {
      return
    }

    // Wait for next render cycle
    setTimeout(() => {
      const viewer = this.shadowRoot?.querySelector('.markdown-viewer')
      if (!viewer) {
        console.error('❌ Markdown viewer element not found')
        return
      }

      // Find all elements with line numbers
      const elements = viewer.querySelectorAll('[data-line-start][data-line-end]')

      this._extractedElements.clear()
      this._toggleHosts.clear()
      elements.forEach((el) => {
        const elStart = parseInt(el.getAttribute('data-line-start'))
        const elEnd = parseInt(el.getAttribute('data-line-end'))

        // Check if this element overlaps with any extracted range
        const isExtracted = this.extractedRanges.some((range) => {
          const overlaps = elStart <= range.end && elEnd >= range.start
          return overlaps
        })

        if (isExtracted) {
          el.classList.add('extracted-content')
          // Add toggle button
          this._addExtractedToggle(el, elStart, elEnd)
        } else {
          el.classList.remove('extracted-content')
        }
      })
      this._applyRecursiveRendering()
    }, 0)
  }

  /**
   * Add a toggle button to an extracted content element
   */
  _addExtractedToggle(el, elStart, elEnd) {
    // Remove existing toggle if any
    const existingControls = el.querySelector('.extracted-controls')
    if (existingControls) existingControls.remove()

    // Find the matching range to get the child note path
    const range = this.extractedRanges.find((r) => elStart <= r.end && elEnd >= r.start)
    if (!range) return

    // Track extracted elements for this path
    const existing = this._extractedElements.get(range.path) || []
    if (!existing.includes(el)) {
      this._extractedElements.set(range.path, [...existing, el])
    }

    // Store original HTML for restoration
    if (!this._extractedOriginals.has(el)) {
      this._extractedOriginals.set(el, {
        html: el.innerHTML,
        start: elStart,
        end: elEnd,
      })
    }

    const mode = this.renderModes.get(range.path) || 'original'

    const existingHost = this._toggleHosts.get(range.path)
    if (existingHost && existingHost !== el) {
      return
    }
    this._toggleHosts.set(range.path, el)

    const controls = document.createElement('div')
    controls.className = 'extracted-controls'

    const toggle = document.createElement('button')
    toggle.className = `extracted-toggle${mode === 'recursive' ? ' active' : ''}`
    toggle.textContent = mode === 'recursive' ? 'Recursive' : 'Original'
    toggle.addEventListener('click', (e) => {
      e.stopPropagation()
      e.preventDefault()
      this.toggleRenderMode(range.path)
    })

    const openBtn = document.createElement('button')
    openBtn.className = 'extracted-open'
    openBtn.textContent = 'Open'
    openBtn.addEventListener('click', async (e) => {
      e.stopPropagation()
      e.preventDefault()
      const rootPath = window.currentFile?.rootPath || ''
      const fullPath = rootPath ? `${rootPath}/${range.path}` : range.path
      const editorPanel = document.querySelector('editor-panel')
      if (editorPanel) {
        await editorPanel.openFile(fullPath)
      }
    })

    const replaceBtn = document.createElement('button')
    replaceBtn.className = 'extracted-replace'
    replaceBtn.textContent = 'Replace'
    replaceBtn.addEventListener('click', async (e) => {
      e.stopPropagation()
      e.preventDefault()
      const result = await this.replaceRangeWithChildContent(range.path)
      const editorPanel = document.querySelector('editor-panel')
      if (editorPanel && editorPanel._showToast) {
        if (result.success) {
          editorPanel._showToast('Replaced source range with child content')
          editorPanel._refreshFileManager()
        } else {
          editorPanel._showToast(result.error || 'Failed to replace source range', true)
        }
      }
    })

    controls.appendChild(toggle)
    controls.appendChild(openBtn)
    controls.appendChild(replaceBtn)

    el.style.position = 'relative'
    el.appendChild(controls)
  }

  /**
   * Reset all internal state
   */
  _resetState() {
    this.extractedTexts = []
    this.extractedRanges = []
    this.renderModes.clear()
    this._extractedElements.clear()
    this._extractedOriginals = new WeakMap()
    this._toggleHosts.clear()
    this._isDragging = false
    this._dragStartLine = null
    this._dragEndLine = null
  }

  /**
   * Load and lock extracted content from file
   * @param {string} filePath - The file path to load ranges from
   */
  async loadAndLockExtractedContent(filePath) {
    this._resetState()
    try {
      const rangesResult = await window.fileManager.getChildRanges(
        filePath,
        window.currentFile.libraryId,
        false
      )
      if (rangesResult && rangesResult.length > 0) {
        this.extractedRanges = rangesResult
          .filter((r) => {
            const hasLineStart = r.start !== null && !isNaN(r.start)
            const hasLineEnd = r.end != null && !isNaN(r.end)
            return hasLineStart && hasLineEnd
          })
          .map((r) => ({
            start: parseInt(r.start),
            end: parseInt(r.end),
            path: r.path,
          }))

        this.extractedRanges.forEach((range) => {
          this.renderModes.set(range.path, 'recursive')
        })

        if (this.content) {
          const content = this.content
          this.renderedHtml = ''
          this.requestUpdate()
          await this.updateComplete
          this.setMarkdown(content)
        }
      } else {
        this.clearLockedContent()
      }
    } catch (error) {
      console.error('Error loading extracted content:', error)
      this.clearLockedContent()
    }
  }

  /**
   * Clear all locked content
   */
  clearLockedContent() {
    this._resetState()

    // Remove highlighting from all elements
    const viewer = this.shadowRoot?.querySelector('.markdown-viewer')
    if (viewer) {
      viewer.querySelectorAll('.extracted-content').forEach((el) => {
        el.classList.remove('extracted-content')
        el.classList.remove('extracted-recursive-content')
        const controls = el.querySelector('.extracted-controls')
        if (controls) controls.remove()
      })
    }

    this.requestUpdate()
  }

  /**
   * Toggle render mode for an extracted block
   * @param {string} path - The child note file path
   */
  toggleRenderMode(path) {
    const current = this.renderModes.get(path) || 'original'
    this.renderModes.set(path, current === 'original' ? 'recursive' : 'original')
    this._updateToggleForPath(path)
    this._applyRecursiveRendering()
  }

  /**
   * Update toggle label and state for a specific extracted path
   * @param {string} path - The child note file path
   */
  _updateToggleForPath(path) {
    const mode = this.renderModes.get(path) || 'original'
    const elements = this._extractedElements.get(path) || []

    elements.forEach((el) => {
      const toggle = el.querySelector('.extracted-toggle')
      if (!toggle) return
      toggle.classList.toggle('active', mode === 'recursive')
      toggle.textContent = mode === 'recursive' ? 'Recursive' : 'Original'
    })
  }

  /**
   * Recursively fetch content of a child note and its own children
   * @param {string} childPath - The child note file path
   * @returns {Promise<string>} - Rendered markdown content
   */
  async _fetchChildContent(childPath, visited = new Set()) {
    const rootPath = window.currentFile?.rootPath || ''
    const resolvedPath = rootPath ? `${rootPath}/${childPath}` : childPath
    const key = resolvedPath || childPath
    if (visited.has(key)) return ''
    visited.add(key)
    try {
      // Read the child note's content
      const result = await window.fileManager.readFile(resolvedPath)
      if (!result || !result.success) return ''
      const content = typeof result.content === 'string' ? result.content : ''
      if (!content) return ''

      // Get the child note's own extracted ranges
      const childRangesResult = await window.fileManager.getChildRanges(
        resolvedPath,
        window.currentFile.libraryId,
        false
      )

      if (!childRangesResult || childRangesResult.length === 0) {
        // No children, return content as-is
        return content
      }

      // Has children - render recursively
      // Parse the content to find extracted blocks, then recursively replace
      let rendered = content
      const validRanges = childRangesResult
        .filter((r) => r.start !== null && r.end !== null)
        .map((r) => ({
          start: parseInt(r.start),
          end: parseInt(r.end),
          path: r.path,
          content: r.content,
          mode: this.renderModes.get(r.path) || 'original',
        }))

      // For each child range in recursive mode, replace its content
      for (const range of validRanges) {
        if (range.mode === 'recursive') {
          const childContent = await this._fetchChildContent(range.path, visited)
          if (childContent) {
            // Replace the lines in the content
            const lines = rendered.split('\n')
            const before = lines.slice(0, range.start - 1)
            const after = lines.slice(range.end)
            rendered = [...before, childContent, ...after].join('\n')
          }
        } else if (typeof range.content === 'string' && range.content.length > 0) {
          // Use stored child content when not recursive
          const lines = rendered.split('\n')
          const before = lines.slice(0, range.start - 1)
          const after = lines.slice(range.end)
          rendered = [...before, range.content, ...after].join('\n')
        }
      }

      return rendered
    } catch (error) {
      console.error(`Failed to fetch child content for ${childPath}:`, error)
      return ''
    }
  }

  /**
   * Apply recursive rendering to extracted blocks that are in recursive mode
   * Replaces the content of extracted blocks with their rendered child content
   */
  async _applyRecursiveRendering() {
    const viewer = this.shadowRoot?.querySelector('.markdown-viewer')
    if (!viewer) return

    for (const range of this.extractedRanges) {
      const mode = this.renderModes.get(range.path) || 'original'
      const elements = this._extractedElements.get(range.path) || []

      if (mode === 'recursive') {
        // Fetch and render child content
        const childContent = await this._fetchChildContent(range.path)
        if (!childContent) continue

        // Render the child content as markdown (no line numbers)
        const renderedHtml = markdownToHtml(childContent, false)

        elements.forEach((el, index) => {
          const controls = el.querySelector('.extracted-controls')
          if (index === 0) {
            el.innerHTML = renderedHtml
          } else {
            el.innerHTML = ''
          }
          if (controls) {
            el.appendChild(controls)
          }
          el.classList.add('extracted-recursive-content')
          el.removeAttribute('data-line-start')
          el.removeAttribute('data-line-end')
        })
      } else {
        // Restore original HTML and attributes
        elements.forEach((el) => {
          const original = this._extractedOriginals.get(el)
          if (!original) return
          el.innerHTML = original.html
          el.classList.remove('extracted-recursive-content')
          el.setAttribute('data-line-start', original.start)
          el.setAttribute('data-line-end', original.end)
          this._addExtractedToggle(el, original.start, original.end)
        })
      }
    }
  }

  // Intercept clicks on external links to open them in a dialog/pop up
  connectedCallback() {
    super.connectedCallback()
    this.addEventListener('click', this._linkHandler, true)

    // Add drag selection handlers
    this.addEventListener('mousedown', this._mouseDownHandler, false)
    this.addEventListener('mousemove', this._mouseMoveHandler, false)
    this.addEventListener('mouseup', this._mouseUpHandler, false)
  }

  // Clean up event listener when element is removed
  disconnectedCallback() {
    this.removeEventListener('click', this._linkHandler, true)
    this.removeEventListener('mousedown', this._mouseDownHandler, false)
    this.removeEventListener('mousemove', this._mouseMoveHandler, false)
    this.removeEventListener('mouseup', this._mouseUpHandler, false)
    super.disconnectedCallback()
  }

  /**
   * Set markdown content
   * @param {string} content - raw markdown text
   */
  setMarkdown(content) {
    this.markdownSource = content // Store raw markdown for extraction
    this.content = content
    // Render markdown to HTML synchronously
    this.renderedHtml = markdownToHtml(content, true)
    this.requestUpdate()
    // Apply line-based highlighting after render
    this.applyExtractedHighlighting()
  }

  setCurrentFilePath(filePath) {
    this.currentFilePath = filePath
  }

  // Open link dialog, self explanatory
  openLinkDialog(url) {
    this.previewUrl = url
    this.showLinkDialog = true
  }

  // close link dialog, self explanatory
  closeLinkDialog() {
    this.showLinkDialog = false
  }

  // Open link externally in a new tab/window
  chooseOpenExternal() {
    if (this.previewUrl) window.open(this.previewUrl, '_blank')
    this.showLinkDialog = false
  }

  // similar to the one in pdf viewer but renders markdown here]
  // first check if isLoading is true, then show loading message;
  // then check if errorMessage is set, then show error message;
  // then check if content is empty, then show no content message;
  // Once all are done i.e. is actual fine and complete,
  // render the markdown content to HTML and display it
  render() {
    if (this.isLoading) {
      return html`<div class="loading-message">Loading content...</div>`
    }

    if (this.errorMessage) {
      return html`<div class="error-message">${this.errorMessage}</div>`
    }

    if (!this.content) {
      return html`<div class="empty-message">No content</div>`
    }

    return html`
      <div class="markdown-viewer" .innerHTML=${this.renderedHtml}></div>
      ${this.showLinkDialog
        ? html`
            <div class="link-dialog-backdrop" @click=${this.closeLinkDialog}>
              <div class="link-dialog" @click=${(e) => e.stopPropagation()}>
                <h3>Open Link</h3>
                <p class="link-url">${this.previewUrl}</p>
                <div class="dialog-actions">
                  <button @click=${this.chooseOpenExternal}>Open externally</button>
                  <button @click=${this.closeLinkDialog}>Cancel</button>
                </div>
              </div>
            </div>
          `
        : ''}
    `
  }
}

customElements.define('markdown-viewer', MarkdownViewer)
export default MarkdownViewer
