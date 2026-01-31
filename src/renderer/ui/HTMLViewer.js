// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// HTMLViewer.js
import { LitElement, html, css } from 'lit'
import DOMPurify from 'dompurify'

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

export class HTMLViewer extends LitElement {
  static properties = {
    isLoading: { type: Boolean },
    errorMessage: { type: String },
    content: { type: String },
    showLinkDialog: { type: Boolean },
    previewUrl: { type: String },
    currentFilePath: { type: String },
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      background: var(--viewer-bg, #ffffff);
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

    .html-viewer {
      flex: 1 1 auto;
      overflow: auto;
      padding: 1rem;
    }

    /* Table styles */
    .html-viewer table {
      border-collapse: collapse;
      width: 100%;
      margin: 1rem 0;
      display: table;
      overflow-x: auto;
    }
    .html-viewer table thead {
      background-color: #f6f8fa;
    }
    .html-viewer table th,
    .html-viewer table td {
      border: 1px solid #d0d7de;
      padding: 0.5rem 0.75rem;
      text-align: left;
    }
    .html-viewer table th {
      font-weight: 600;
      border-bottom: 2px solid #d0d7de;
    }
    .html-viewer table tr:nth-child(even) {
      background-color: #f6f8fa;
    }
    .html-viewer table tr:hover {
      background-color: #f0f3f6;
    }

    /* Basic HTML element styles */
    .html-viewer h1,
    .html-viewer h2,
    .html-viewer h3 {
      margin-top: 1.25rem;
      margin-bottom: 0.5rem;
    }
    .html-viewer p {
      margin: 0.5rem 0;
    }
    .html-viewer pre {
      background: #f6f8fa;
      padding: 0.75rem;
      border-radius: 6px;
      overflow: auto;
    }
    .html-viewer code {
      background: #f3f4f6;
      padding: 0.1rem 0.25rem;
      border-radius: 4px;
      font-family:
        ui-monospace, SFMono-Regular, Menlo, Monaco, 'Roboto Mono', 'Courier New', monospace;
    }
    .html-viewer img {
      max-width: 100%;
      height: auto;
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
    this.showLinkDialog = false
    this.previewUrl = ''
    this.extractedTexts = []
    this.currentFilePath = ''
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
   * @param {string} html - HTML string that may have unclosed tags
   * @returns {string} HTML with all tags properly closed
   */
  closeMissingTags(html) {
    // these have no closing tags so when meet them we don't push to stack and skip them directly
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
    // console.log('📌 Current HTML text:', html);
    // Stack to keep track of open tags, like we see <body> first then we push this to stack; <div> then push to stack etc
    const stack = []
    const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/g

    // console.log('📌📌📌 Unclosed tags in stack:', stack)
    let match
    // loop through the html string to find open tags AND closing tags, then will result in an array of tags
    while ((match = tagRegex.exec(html)) !== null) {
      // console.log('📌 Unclosed tags in stack:', stack)
      const [fullMatch, tagName] = match
      const lowerTag = tagName.toLowerCase()

      if (voidElements.has(lowerTag)) {
        // Skip void elements
        continue
      }

      if (fullMatch.startsWith('</')) {
        // Closing tag: pop if matches top of stack
        if (stack.length > 0 && stack[stack.length - 1] === lowerTag) {
          stack.pop()
        } else {
          // If mismatched, ignore (browser would auto-close earlier)
        }
      } else {
        // Opening tag: push to stack
        stack.push(lowerTag)
      }
    }

    // compare the array and see if there are some neighboring tags that are closing tags for the previous one, e.g. <div></div>, then we pop both of them in the stack using while loop until no more closing tags found

    // console.log('📌📌📌 Unclosed tags in stack:', stack)
    // append the remaining unclosed tags in the stack to the end of the html string, like if stack has <div>, <body>, then we append </body></div> to the end of html string, which is the string variable result
    let result = html
    while (stack.length > 0) {
      const openTag = stack.pop()
      result += `</${openTag}>`
    }

    return result
  }

  /**
   * Get currently selected text and its position info
   * Markdown/HTML are rendered as DOM elements so cannot use codemirror select lines
   * @returns {Object|null} { text: string, hasSelection: boolean } or null
   */
  getSemanticSelection() {
    const selection =
      (this.shadowRoot && this.shadowRoot.getSelection && this.shadowRoot.getSelection()) ||
      document.getSelection()
    if (!selection || selection.rangeCount === 0) return null

    const range = selection.getRangeAt(0)
    const selectedText = selection.toString().trim()
    if (!selectedText) return null

    // Extract the exact HTML that was selected
    const extractedFragment = range.cloneContents()
    const tempContainer = document.createElement('div')
    tempContainer.appendChild(extractedFragment)

    // specifically deal with table selections to preserve structure as much as possible
    let extractedHtml = tempContainer.innerHTML

    // Check if selection is within a structural element that should be preserved
    const commonAncestor = range.commonAncestorContainer
    const parentElement =
      commonAncestor.nodeType === Node.TEXT_NODE ? commonAncestor.parentElement : commonAncestor

    // If extracted HTML is just text (no tags), check if parent structure should be preserved
    if (extractedHtml && !/^<[a-z]/i.test(extractedHtml.trim())) {
      const parentTag = parentElement?.tagName?.toLowerCase()

      // Always preserve structure for these elements
      const structuralElements = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code']

      if (parentTag && structuralElements.includes(parentTag)) {
        extractedHtml = `<${parentTag}>${extractedHtml}</${parentTag}>`
      }
    }

    // Handle table selections - preserve table structure
    if (parentElement) {
      // Check if selection is within a table
      const tableAncestor = parentElement.closest('table')
      if (tableAncestor) {
        // Check if incomplete table structure in extraction
        const hasTableTags = /<(table|thead|tbody|tr|td|th)\b/i.test(extractedHtml)

        if (hasTableTags) {
          // We have partial table tags, need to ensure proper structure
          const tempDiv = document.createElement('div')
          tempDiv.innerHTML = extractedHtml

          // If we don't have a table wrapper, add it
          if (!tempDiv.querySelector('table')) {
            extractedHtml = `<table>${extractedHtml}</table>`
          }

          // If have rows but no tbody/thead, wrap in tbody
          tempDiv.innerHTML = extractedHtml
          const table = tempDiv.querySelector('table')
          if (table) {
            const hasBody = table.querySelector('tbody, thead')
            const rows = table.querySelectorAll('tr')
            if (!hasBody && rows.length > 0) {
              const tbody = document.createElement('tbody')
              rows.forEach((row) => tbody.appendChild(row.cloneNode(true)))
              table.innerHTML = ''
              table.appendChild(tbody)
              extractedHtml = table.outerHTML
            }
          }
        } else if (selectedText) {
          // Text only selection within table like checking if it's a cell
          const cellAncestor = parentElement.closest('td, th')
          if (cellAncestor) {
            const cellTag = cellAncestor.tagName.toLowerCase()
            const rowHtml = `<tr><${cellTag}>${extractedHtml}</${cellTag}></tr>`
            extractedHtml = `<table><tbody>${rowHtml}</tbody></table>`
          }
        }
      }
    }

    const appendedHtml = this.closeMissingTags(extractedHtml)

    // console.log('📌 Extracted HTML texts:', selectedText);
    // console.log('📌 Extracted HTML selection:', appendedHtml);

    return {
      text: selectedText,
      html: appendedHtml,
      hasSelection: true,
    }
  }

  /**
   * Lock/highlight already extracted content
   * @param {Array<Object>} ranges, array of objects with extracted_text property
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

  /**
   * Clear all locked content
   */
  clearLockedContent() {
    this.extractedTexts = []
    this.requestUpdate()
  }

  /**
   * Extract selected content
   * @param {string} filePath - The file path for extraction
   * @returns {Object} - {success: boolean, error?: string}
   */
  async extractSelection(filePath) {
    const selection = this.getSemanticSelection()
    if (!selection || !selection.text) {
      return { success: false, error: 'No text selected' }
    }

    if (!filePath) {
      return { success: false, error: 'File path not provided' }
    }

    const text = selection.html || selection.text
    const libraryId = window.currentFileLibraryId

    try {
      // Generate child note filename
      // Preview mode: use rangeStart=0, rangeEnd=0 for semantic extractions
      const childFileName = generateChildNoteName(filePath, 0, 0, text)

      // Extract note with generated filename
      await window.fileManager.extractNote(filePath, text, childFileName, 0, 0, libraryId)
      return { success: true }
    } catch (error) {
      console.error('Failed to extract note:', error)
      return { success: false, error: error.message }
    }
  }

  connectedCallback() {
    super.connectedCallback()
    this.addEventListener('click', this._linkHandler, true)
  }

  disconnectedCallback() {
    this.removeEventListener('click', this._linkHandler, true)
    super.disconnectedCallback()
  }

  /**
   * Resolve relative paths in HTML content to absolute file:// URLs
   * @param {string} html - HTML content with potentially relative paths
   * @param {string} baseFilePath - Absolute path to the HTML file
   * @returns {string} - HTML with resolved absolute paths
   */
  resolveRelativePaths(html, baseFilePath) {
    if (!baseFilePath) return html

    // Get the directory containing the HTML file
    const baseDir = baseFilePath.substring(0, baseFilePath.lastIndexOf('/'))

    /**
     * Validate that a relative path is safe (no path traversal)
     * @param {string} path - Relative path to validate
     * @returns {boolean} - True if path is safe
     */
    const isPathSafe = (path) => {
      // Reject paths with parent directory references
      if (path.includes('..')) return false
      // Reject absolute paths (should be relative)
      if (path.startsWith('/')) return false
      // Reject paths with null bytes
      if (path.includes('\0')) return false
      return true
    }

    // Replace relative paths in common attributes
    let resolved = html

    // Handle src attributes (img, script, etc.)
    resolved = resolved.replace(/\bsrc=["']([^"':]+)["']/gi, (match, path) => {
      // Skip absolute URLs and data URLs
      if (/^(https?:|data:|file:)/i.test(path)) return match
      // Skip absolute paths starting with /
      if (path.startsWith('/')) return match
      // Skip unsafe paths
      if (!isPathSafe(path)) {
        console.warn(`Unsafe path detected and skipped: ${path}`)
        return match
      }

      const absolutePath = `${baseDir}/${path}`
      return `src="file://${absolutePath}"`
    })

    // Handle href attributes (link, a, etc.)
    resolved = resolved.replace(/\bhref=["']([^"':]+)["']/gi, (match, path) => {
      // Skip absolute URLs (http, https, mailto, etc.)
      if (/^[a-z]+:/i.test(path)) return match
      // Skip fragment identifiers
      if (path.startsWith('#')) return match
      // Skip absolute paths starting with /
      if (path.startsWith('/')) return match
      // Skip unsafe paths
      if (!isPathSafe(path)) {
        console.warn(`Unsafe path detected and skipped: ${path}`)
        return match
      }

      const absolutePath = `${baseDir}/${path}`
      return `href="file://${absolutePath}"`
    })

    return resolved
  }

  /**
   * Set HTML content (rendered as-is; sanitize upstream if untrusted).
   * @param {string} content - raw HTML string
   * @param {string} filePath - optional file path for resolving relative URLs
   */
  setHtml(content, filePath = '') {
    this.currentFilePath = filePath

    // Resolve relative paths if file path is provided
    const resolved = filePath ? this.resolveRelativePaths(content, filePath) : content

    // Add custom hook to allow file:// protocol URLs
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
      // Allow file:// URLs in href and src attributes
      if (node.hasAttribute('href')) {
        const href = node.getAttribute('href')
        if (href && href.startsWith('file://')) {
          node.setAttribute('href', href)
        }
      }
      if (node.hasAttribute('src')) {
        const src = node.getAttribute('src')
        if (src && src.startsWith('file://')) {
          node.setAttribute('src', src)
        }
      }
    })

    // Sanitize HTML using DOMPurify to prevent XSS attacks
    // Note: We use FORCE_BODY to prevent DOMPurify from removing <link> tags
    this.content = DOMPurify.sanitize(resolved, {
      // Use FORCE_BODY to keep all elements including <link>
      FORCE_BODY: true,
      // Allow common HTML tags including style and link for CSS
      ADD_TAGS: ['link', 'style'], // Explicitly add link and style tags
      // Allow file:// protocol for local resources
      ALLOWED_URI_REGEXP:
        /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|file):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
      ALLOWED_TAGS: [
        'a',
        'abbr',
        'article',
        'aside',
        'b',
        'blockquote',
        'br',
        'caption',
        'code',
        'dd',
        'del',
        'details',
        'div',
        'dl',
        'dt',
        'em',
        'figcaption',
        'figure',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'hr',
        'i',
        'img',
        'ins',
        'kbd',
        'li',
        'link', // Allow <link> for external stylesheets
        'main',
        'mark',
        'nav',
        'ol',
        'p',
        'pre',
        'q',
        's',
        'section',
        'small',
        'span',
        'strong',
        'style', // Allow <style> for inline styles
        'sub',
        'summary',
        'sup',
        'table',
        'tbody',
        'td',
        'tfoot',
        'th',
        'thead',
        'time',
        'tr',
        'u',
        'ul',
      ],
      // Allow common attributes including rel and type for stylesheets
      ADD_ATTR: ['rel', 'type', 'media'], // Explicitly add stylesheet attributes
      ALLOWED_ATTR: [
        'alt',
        'class',
        'colspan',
        'dir',
        'height',
        'href',
        'id',
        'lang',
        'media', // Allow media queries
        'rel', // Allow rel for <link rel="stylesheet">
        'rowspan',
        'src',
        'start',
        'title',
        'type', // Allow type for <link type="text/css">
        'width',
      ],
      // Forbid script execution and dangerous tags
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea'],
      // Forbid event handlers to prevent XSS
      FORBID_ATTR: [
        'onerror',
        'onload',
        'onclick',
        'onmouseover',
        'onmouseout',
        'onmousemove',
        'onmouseenter',
        'onmouseleave',
        'onfocus',
        'onblur',
        'onchange',
        'onsubmit',
        'onkeydown',
        'onkeyup',
        'onkeypress',
      ],
      // Allow CSS content in style tags
      ALLOW_DATA_ATTR: false,
      // Keep comments for debugging
      KEEP_CONTENT: true,
      // Return DOM instead of string for better performance
      RETURN_DOM: false,
      RETURN_DOM_FRAGMENT: false,
    })

    // Remove hook after sanitization
    DOMPurify.removeHook('afterSanitizeAttributes')

    this.requestUpdate()
  }

  openLinkDialog(url) {
    this.previewUrl = url
    this.showLinkDialog = true
  }

  closeLinkDialog() {
    this.showLinkDialog = false
  }

  chooseOpenExternal() {
    if (this.previewUrl) window.open(this.previewUrl, '_blank')
    this.showLinkDialog = false
  }

  // yes basically similar to pdf viewer but renders html here
  // similar comments can be viewed in markdown viewer.js
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

    // Apply locked styling to extracted content
    let renderedContent = this.content
    if (this.extractedTexts.length > 0) {
      this.extractedTexts.forEach((extractedText) => {
        if (extractedText) {
          // Escape special regex characters
          const escapedText = extractedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const regex = new RegExp(`(${escapedText})`, 'gi')
          renderedContent = renderedContent.replace(
            regex,
            '<span class="extracted-content">$1</span>'
          )
        }
      })
    }

    return html`
      <div class="html-viewer" .innerHTML=${renderedContent}></div>
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

customElements.define('html-viewer', HTMLViewer)
export default HTMLViewer
