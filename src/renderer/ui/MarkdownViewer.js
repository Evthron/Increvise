// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// MarkdownViewer.js
import { LitElement, html, css } from 'lit'
import { marked } from 'marked'

// Configure marked to use GitHub Flavored Markdown (GFM) for tables and other features
marked.setOptions({
  gfm: true,
  breaks: true,
  tables: true,
})

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
    // Match pattern: rangeStart-rangeEnd-name
    const match = layer.match(/^(\d+)-(\d+)-(.+)$/)
    if (!match) return null

    parsed.push({
      rangeStart: parseInt(match[1]),
      rangeEnd: parseInt(match[2]),
      name: match[3],
    })
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
  // This regex removes all HTML tags including their attributes
  const plainText = extractedText.replace(/<[^>]*>/g, '').trim()

  // Generate name from first 3 words of extracted text - optimized
  let words = ''
  const text = plainText
  let wordCount = 0
  let currentWord = ''

  for (let i = 0; i < text.length && wordCount < 3; i++) {
    const char = text[i]
    const lower = char.toLowerCase()
    const isAlphaNum = (lower >= 'a' && lower <= 'z') || (lower >= '0' && lower <= '9')

    if (isAlphaNum) {
      currentWord += lower
    } else if (currentWord.length > 0) {
      if (words) words += '-'
      words += currentWord
      currentWord = ''
      wordCount++
    }
  }
  // Add last word if exists
  if (currentWord.length > 0 && wordCount < 3) {
    if (words) words += '-'
    words += currentWord
  }

  if (!parentLayers) {
    // Parent is a top-level file - extract name from filename (as fallback)
    let parentName = ''
    wordCount = 0
    currentWord = ''

    for (let i = 0; i < parentFileName.length && wordCount < 3; i++) {
      const char = parentFileName[i]
      const lower = char.toLowerCase()
      const isAlphaNum = (lower >= 'a' && lower <= 'z') || (lower >= '0' && lower <= '9')

      if (isAlphaNum || char === '-') {
        currentWord += lower
      } else if (currentWord.length > 0) {
        if (parentName) parentName += '-'
        parentName += currentWord
        currentWord = ''
        wordCount++
      }
    }
    if (currentWord.length > 0 && wordCount < 3) {
      if (parentName) parentName += '-'
      parentName += currentWord
    }

    // For HTML/semantic extractions (rangeStart/rangeEnd = 0), use words from content with 0-0 prefix
    // For text-line extractions, use range-based naming with parent name as fallback
    if (rangeStart === 0 && rangeEnd === 0) {
      return `0-0-${words || parentName || 'note'}`
    } else {
      return `${rangeStart}-${rangeEnd}-${parentName || words || 'note'}`
    }
  } else {
    // Flat structure: keep all parent layers, append new layer
    const allLayers = [...parentLayers, { rangeStart, rangeEnd, name: words || 'note' }]
    return allLayers.map((l) => `${l.rangeStart}-${l.rangeEnd}-${l.name}`).join('.')
  }
}

export class MarkdownViewer extends LitElement {
  static properties = {
    isLoading: { type: Boolean },
    errorMessage: { type: String },
    content: { type: String },
    showLinkDialog: { type: Boolean },
    previewUrl: { type: String },
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
      margin: 0 auto;
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
      background-color: rgba(100, 100, 100, 0.1);
      border-left: 3px solid #999;
      padding-left: 0.5rem;
      opacity: 0.6;
      pointer-events: none;
      user-select: none;
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
    this.markdownSource = '' // Store raw markdown source for extraction
    this.showLinkDialog = false
    this.previewUrl = ''
    this.extractedTexts = [] // Store extracted content for locking
    this._linkHandler = (event) => {
      const anchor = event.composedPath().find((n) => n?.tagName === 'A')
      const href = anchor?.getAttribute?.('href') || ''
      const isExternal = /^https?:\/\//i.test(href) || href.startsWith('//')
      if (anchor && isExternal) {
        event.preventDefault()
        this.openLinkDialog(href)
      }
    }
  }

  /**
   * Close any unclosed HTML tags using a stack-based approach
   * Needed because when selecting partial content from rendered markdown,
   * the HTML fragment may have unclosed tags that need to be closed
   * before converting back to markdown format
   * Yes this is basically the one in HTMLViewer.js but needed here too
   * @param {string} html - HTML string that may have unclosed tags
   * @returns {string} HTML with all tags properly closed
   */
  closeMissingTags(html) {
    // These have no closing tags so when we meet them we dont push to stack and skip them directly
    const voidElements = new Set([
      'area',
      'base',
      'col',
      'embed',
      'hr',
      'img',
      'input',
      'link',
      'meta',
      'param',
      'source',
      'track',
      'wbr',
    ])

    // Stack to keep track of open tags
    const stack = []
    const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/g

    let match
    // Loop through the html string to find open tags AND closing tags
    while ((match = tagRegex.exec(html)) !== null) {
      const [fullMatch, tagName] = match
      const lowerTag = tagName.toLowerCase()

      if (voidElements.has(lowerTag)) {
        // Skip void elements
        continue
      }

      if (fullMatch.startsWith('</')) {
        // Closing tag, pop if matches top of stack
        if (stack.length > 0 && stack[stack.length - 1] === lowerTag) {
          stack.pop()
        }
      } else {
        // Opening tag: push to stack
        stack.push(lowerTag)
      }
    }

    // Append the remaining unclosed tags in the stack to the end of the html string
    let result = html
    while (stack.length > 0) {
      const openTag = stack.pop()
      result += `</${openTag}>`
    }

    return result
  }

  /**
   * Convert HTML back to markdown format
   * Uses tag handlers for clean, maintainable conversion
   * The reason this exists is that when you select partial content from rendered markdown,
   * we are actually selecting the HTML fragment and we need to convert this back to markdown for extraction
   * @param {string} html - HTML string to convert
   * @returns {string} Markdown representation
   */
  htmlToMarkdown(html) {
    const temp = document.createElement('div')
    temp.innerHTML = html

    // Tag handler functions for clean organization, they will be referenced later
    const handlers = {
      // level = number like 1 to 6 and # repeat based on level
      // like heading 1 = #, heading 2 = ## etc
      // the children is the inner text content like Title, Section or whatever words you think is appropriate
      // e.g. heading(1, 'Title') => '# Title\n\n' ; heading(2, 'Section') => '## Section\n\n' etc
      heading: (level, children) => `${'#'.repeat(level)} ${children}\n\n`,

      // wraps children text with market
      // like maybe bold then **children** or italic then *children*, or strikethrough then ~~children~~
      format: (marker, children) => `${marker}${children}${marker}`,

      // converts <a> tags to markdown link format
      // reads href and title attributes, include title if exists
      link: (node, children) => {
        const href = node.getAttribute('href') || ''
        const title = node.getAttribute('title')
        return title ? `[${children}](${href} "${title}")` : `[${children}](${href})`
      },

      // tbh the rest are basically what they do but anyways
      // converts <img> tags to markdown image format aka alt
      image: (node) => {
        const src = node.getAttribute('src') || ''
        const alt = node.getAttribute('alt') || ''
        const title = node.getAttribute('title')
        return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`
      },

      // convert inline <code> tags to markdown inline code format like `code` something like that
      code: (node, children) => {
        if (node.parentElement?.tagName.toLowerCase() === 'pre') return children
        return `\`${children}\``
      },

      // convert <pre><code> blocks to markdown code block format
      // tries to detect language from class like js or python etc
      codeBlock: (node, children) => {
        const codeEl = node.querySelector('code')
        const lang =
          codeEl?.className
            .split(' ')
            .find((c) => c.startsWith('language-'))
            ?.replace('language-', '') || ''
        return lang ? `\`\`\`${lang}\n${children}\n\`\`\`\n\n` : `\`\`\`\n${children}\n\`\`\`\n\n`
      },

      // convert <li> items to markdown list format
      list: (node, children) => {
        const parent = node.parentElement
        const isOrdered = parent?.tagName.toLowerCase() === 'ol'
        if (isOrdered) {
          const index = Array.from(parent.children).indexOf(node) + 1
          return `${index}. ${children}\n`
        }
        // Task list check
        const firstChild = node.firstChild
        if (firstChild?.nodeName === 'INPUT' && firstChild.type === 'checkbox') {
          const checked = firstChild.checked ? 'x' : ' '
          const text = Array.from(node.childNodes)
            .slice(1)
            .map((n) => this.processNode(n))
            .join('')
          return `- [${checked}]${text}\n`
        }
        return `- ${children}\n`
      },
    }

    // Main node processor, recursive as call itself for each child nodes
    this.processNode = (node) => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent
      if (node.nodeType !== Node.ELEMENT_NODE) return ''

      const tag = node.tagName.toLowerCase()
      const children = Array.from(node.childNodes)
        .map((n) => this.processNode(n))
        .join('')

      // Map tags to handlers
      const tagMap = {
        // intuitive and mentioned already above
        h1: () => handlers.heading(1, children),
        h2: () => handlers.heading(2, children),
        h3: () => handlers.heading(3, children),
        h4: () => handlers.heading(4, children),
        h5: () => handlers.heading(5, children),
        h6: () => handlers.heading(6, children),
        p: () => `${children}\n\n`,
        strong: () => handlers.format('**', children),
        b: () => handlers.format('**', children),
        em: () => handlers.format('*', children),
        i: () => handlers.format('*', children),
        del: () => handlers.format('~~', children),
        s: () => handlers.format('~~', children),
        strike: () => handlers.format('~~', children),
        code: () => handlers.code(node, children),
        pre: () => handlers.codeBlock(node, children),
        a: () => handlers.link(node, children),
        img: () => handlers.image(node),
        ul: () => `${children}\n`,
        ol: () => `${children}\n`,
        li: () => handlers.list(node, children),
        blockquote: () => `> ${children}\n\n`,
        hr: () => `---\n\n`,
        br: () => '\n',
        table: () => this.processTable(node),
        thead: () => '',
        tbody: () => '',
        tr: () => '',
        td: () => '',
        th: () => '',
      }

      // if tagMap[tag] exists, call the function and return result, else return children as is
      return tagMap[tag] ? tagMap[tag]() : children
    }

    // use regex to replace multiple newlines with max 2 newlines and trim
    const markdown = this.processNode(temp)
    return markdown.replace(/\n{3,}/g, '\n\n').trim()
  }

  /**
   * Process HTML table to markdown table format
   * @param {HTMLElement} tableNode - The table element
   * @returns {string} Markdown table
   */
  processTable(tableNode) {
    const rows = Array.from(tableNode.querySelectorAll('tr'))
    if (rows.length === 0) return ''

    // collect all cell contents and calculate max widths
    const tableData = []
    const maxWidths = []

    // for each row select all <th> and <td> cells
    // for each cell get text content, trim and escape pipes
    // update maxWidths for each column based on content length
    // math.max to ensure min width of 15 chars which is min col width for readability
    // store row data with isHeader flag
    rows.forEach((row) => {
      const cells = Array.from(row.querySelectorAll('th, td'))
      const rowData = cells.map((cell, idx) => {
        const content = cell.textContent.trim().replace(/\|/g, '\\|')
        maxWidths[idx] = Math.max(maxWidths[idx] || 10, content.length, 15) // Min 15 chars
        return content
      })
      tableData.push({ cells: rowData, isHeader: row.querySelector('th') !== null })
    })

    // build markdown with padded cells, start the output with newline so table separated from prev content
    let markdown = '\n'
    let headerProcessed = false

    // for each row, pad each cell to max width and join with pipes
    // after header row, add separator row with dashes
    // use isHeader flag to determine header row
    tableData.forEach((row, rowIndex) => {
      const paddedCells = row.cells.map((content, idx) => content.padEnd(maxWidths[idx], ' '))
      markdown += `| ${paddedCells.join(' | ')} |\n`

      // Add separator after header
      if ((row.isHeader || rowIndex === 0) && !headerProcessed) {
        const separator = maxWidths.map((width) => '-'.repeat(width)).join(' | ')
        markdown += `| ${separator} |\n`
        headerProcessed = true
      }
    })

    return markdown + '\n'
  }

  /**
   * Clean up formatting markers from partial selections using pairing algorithm
   * Similar to HTML tag stack matching, but for markdown markers
   * @param {string} markdown - Markdown text to clean
   * @returns {string} Cleaned markdown
   */
  cleanPartialFormatting(markdown) {
    // Remove leading/trailing whitespace between markers and content
    // like `** bold text **` => `**bold text**` cuz spaces between markers and text are not valid and cause issues
    markdown = markdown.replace(/^(\*+|_+)\s+/, '$1').replace(/\s+(\*+|_+)$/, '$1')

    // Find all marker sequences at start and end
    const startMarkers = markdown.match(/^(\*+|_+)/)?.[1] || ''
    const endMarkers = markdown.match(/(\*+|_+)$/)?.[1] || ''

    if (!startMarkers && !endMarkers) return markdown // No markers to clean

    // Extract content without edge markers
    const content = markdown.replace(/^(\*+|_+)|(\*+|_+)$/g, '')

    // Check if markers are properly paired (same type and count)
    // tbh most of the time it isnt paired but what if it is then just return
    const markerType = startMarkers[0] || endMarkers[0]
    const isPaired =
      startMarkers.length > 0 &&
      endMarkers.length > 0 &&
      startMarkers[0] === endMarkers[0] &&
      startMarkers.length === endMarkers.length

    if (isPaired) {
      // Markers are balanced very good then just quit
      return markdown
    }

    // Markers are orphaned or unbalanced - determine what to do
    if (startMarkers && endMarkers) {
      // Both exist but unbalanced - use minimum count
      const minCount = Math.min(startMarkers.length, endMarkers.length)
      return markerType.repeat(minCount) + content + markerType.repeat(minCount)
    }
    // e.g. ***hello** we know markertype is *, startmarker length is 3 and end is 2,
    // mincount = Math.min(3,2) = 2, so return **hello**

    // Only one side has markers - remove orphaned markers
    return content
  }

  /**
   * Get currently selected text and convert to markdown format
   * Similar to HTMLViewer's extraction logic so not explained again
   * @returns {Object|null} { text: string, markdown: string, hasSelection: boolean } or null
   */
  getSemanticSelection() {
    const selection = this.shadowRoot?.getSelection?.() || document.getSelection()
    if (!selection?.rangeCount) return null

    const range = selection.getRangeAt(0)
    const selectedText = selection.toString().trim()
    if (!selectedText) return null

    // Extract HTML from rendered markdown
    const extractedFragment = range.cloneContents()
    const tempContainer = document.createElement('div')
    tempContainer.appendChild(extractedFragment)

    let extractedHtml = tempContainer.innerHTML

    // Check if selection is entirely within a single block element (h1-h6, p, li, blockquote, etc.)
    const commonAncestor = range.commonAncestorContainer
    const parentElement =
      commonAncestor.nodeType === Node.TEXT_NODE ? commonAncestor.parentElement : commonAncestor

    // If the extracted HTML is just text (no tags) and parent is a block element, wrap it
    if (extractedHtml && !/^<[a-z]/i.test(extractedHtml.trim())) {
      const parentTag = parentElement?.tagName?.toLowerCase()

      // Preserve structure for these elements even with partial selection
      const structuralElements = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre']
      // Only preserve for full selection
      const contextualElements = ['p', 'li']

      if (parentTag) {
        if (structuralElements.includes(parentTag)) {
          // Always wrap structural elements (headings, blockquotes) to preserve context
          extractedHtml = `<${parentTag}>${extractedHtml}</${parentTag}>`
        } else if (contextualElements.includes(parentTag)) {
          // Only wrap if selecting entire content
          const parentText = parentElement.textContent.trim()
          if (selectedText === parentText) {
            extractedHtml = `<${parentTag}>${extractedHtml}</${parentTag}>`
          }
        }
      }
    }

    // Simplify inline-only selections to avoid over-nesting
    const hasBlockElements = /<(p|div|h[1-6]|ul|ol|table|pre|blockquote)\b/i.test(extractedHtml)
    if (!hasBlockElements) {
      const tempDiv = document.createElement('div')
      tempDiv.innerHTML = extractedHtml
      const strong = tempDiv.querySelector('strong')
      const em = tempDiv.querySelector('em')

      // If nested formatting contains same text as selection, it's likely partial
      if (
        strong &&
        em &&
        strong.textContent.trim() === selectedText &&
        em.textContent.trim() === selectedText
      ) {
        extractedHtml = selectedText
      }
    }

    // Process HTML to markdown
    const closedHtml = this.closeMissingTags(extractedHtml)
    let extractedMarkdown = this.htmlToMarkdown(closedHtml)
    extractedMarkdown = this.cleanPartialFormatting(extractedMarkdown)

    // console.log('📌 Extracted md text:', selectedText);
    // console.log('📌 Extracted md HTML:', extractedHtml);
    // console.log('📌 Extracted md markdown:', extractedMarkdown);

    return {
      text: selectedText,
      markdown: extractedMarkdown,
      hasSelection: true,
    }
  }

  /**
   * Get currently selected text (plain text only)
   * Markdown/HTML are rendered as DOM elements so cannot use codemirror select lines
   * @returns {Object|null} - { text: string, hasSelection: boolean } or null
   */
  getSelectedText() {
    const selection = this.shadowRoot.getSelection()
    if (!selection || selection.rangeCount === 0) {
      return null
    }

    const selectedText = selection.toString().trim()
    if (!selectedText) {
      return null
    }

    return {
      text: selectedText,
      hasSelection: true,
    }
  }

  /**
   * Lock/highlight already extracted content
   * @param {Array<Object>} ranges - Array of objects with extracted_text property
   */
  lockContent(ranges) {
    this.extractedTexts = ranges.map((r) => r.extracted_text || r.text).filter(Boolean)
    this.requestUpdate() // Re-render with locked styling
  }

  /**
   * Load and lock extracted content from file
   * @param {string} filePath - The file path to load ranges from
   */
  async loadAndLockExtractedContent(filePath) {
    try {
      if (!window.currentFileLibraryId) {
        console.warn('No library ID set, cannot load extracted content')
        this.clearLockedContent()
        return
      }

      const rangesResult = await window.fileManager.getChildRanges(
        filePath,
        window.currentFileLibraryId
      )

      if (rangesResult && rangesResult.length > 0) {
        this.lockContent(rangesResult)
      } else {
        this.clearLockedContent()
      }
    } catch (error) {
      console.error('Error loading extracted content:', error)
      this.clearLockedContent()
    }
  }

  async extractSelection(filePath) {
    const selection = this.getSemanticSelection()
    if (!selection || !selection.text) {
      return { success: false, error: 'No text selected' }
    }

    if (!filePath) {
      return { success: false, error: 'File path not provided' }
    }

    const text = selection.markdown || selection.text
    const libraryId = window.currentFileLibraryId

    try {
      // Generate child note filename
      // Preview mode: use rangeStart=0, rangeEnd=0 for semantic extractions
      const childFileName = generateChildNoteName(filePath, 0, 0, text)

      // Extract note with generated filename
      const result = await window.fileManager.extractNote(
        filePath,
        text,
        childFileName,
        0,
        0,
        libraryId
      )

      // Check if extraction was successful
      if (!result.success) {
        return { success: false, error: result.error || 'Unknown extraction error' }
      }

      return { success: true }
    } catch (error) {
      console.error('Failed to extract note:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Clear all locked content
   */
  clearLockedContent() {
    this.extractedTexts = []
    this.requestUpdate()
  }

  // Intercept clicks on external links to open them in a dialog/pop up
  connectedCallback() {
    super.connectedCallback()
    this.addEventListener('click', this._linkHandler, true)
  }

  // Clean up event listener when element is removed
  disconnectedCallback() {
    this.removeEventListener('click', this._linkHandler, true)
    super.disconnectedCallback()
  }

  /**
   * Set markdown content
   * @param {string} content - raw markdown text
   */
  setMarkdown(content) {
    this.markdownSource = content // Store raw markdown for extraction
    this.content = content
    this.requestUpdate()
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

    // Render markdown to HTML with locked content highlighting
    let rendered = marked.parse(this.content || '')

    // Apply locked styling to extracted content
    if (this.extractedTexts.length > 0) {
      this.extractedTexts.forEach((extractedText) => {
        if (extractedText) {
          // Escape special regex characters
          const escapedText = extractedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const regex = new RegExp(`(${escapedText})`, 'gi')
          rendered = rendered.replace(regex, '<span class="extracted-content">$1</span>')
        }
      })
    }

    return html`
      <div class="markdown-viewer" .innerHTML=${rendered}></div>
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
