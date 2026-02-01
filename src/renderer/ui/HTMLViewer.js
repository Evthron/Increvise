// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// HTMLViewer.js
import { LitElement, html, css } from 'lit'
import DOMPurify from 'dompurify'
import { normalizeHTML, findMatchingNode } from './html-matching.js'

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
    rawHtml: { type: String, state: true },
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
      background-color: rgba(100, 200, 100, 1);
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
   * Clean child note HTML by removing style inheritance tags
   * @param {string} childHTML - Raw child note HTML content
   * @returns {string} - Cleaned HTML content
   */
  cleanChildHTML(childHTML) {
    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = childHTML

    // Remove style inheritance tags (added during extraction)
    tempDiv.querySelectorAll('link[rel="stylesheet"]').forEach((l) => l.remove())
    tempDiv.querySelectorAll('style').forEach((s) => s.remove())

    // Return cleaned HTML (may contain multiple top-level elements)
    return tempDiv.innerHTML
  }

  /**
   * Load and lock extracted content from file
   * Uses DOM matching to mark already-extracted sections
   * @param {string} filePath - The file path to load ranges from
   */
  async loadAndLockExtractedContent(filePath) {
    try {
      if (!window.currentFileLibraryId) {
        console.warn('No library ID set, cannot load extracted content')
        return
      }

      const rangesResult = await window.fileManager.getChildRanges(
        filePath,
        window.currentFileLibraryId
      )

      if (!rangesResult || rangesResult.length === 0) {
        return
      }

      // Mark each extracted section in the DOM
      for (const childData of rangesResult) {
        // Skip if no content (backend didn't provide it)
        if (!childData.content) {
          continue
        }

        // Clean child note HTML (remove style inheritance)
        const cleanedHTML = this.cleanChildHTML(childData.content)
        if (!cleanedHTML || !cleanedHTML.trim()) {
          continue
        }

        // Find matching node(s) in parent using normalized comparison
        const matchedNode = findMatchingNode(this.shadowRoot, cleanedHTML)

        // Mark matched node(s) with extracted-content class
        if (matchedNode) {
          console.log('Marking extracted content in HTMLViewer:', matchedNode)
          if (Array.isArray(matchedNode)) {
            // Multiple consecutive siblings matched
            matchedNode.forEach((node) => {
              node.classList.add('extracted-content')
            })
          } else {
            // Single node matched
            matchedNode.classList.add('extracted-content')
          }
        }
        // Silent failure if not found (content may have been deleted/modified)
      }
    } catch (error) {
      console.error('Error marking extracted content:', error)
    }
  }

  /**
   * Clear all locked content
   */
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
    let text = selection.html || selection.text
    // Generate child note filename
    // Preview mode: use rangeStart=0, rangeEnd=0 for semantic extractions
    const childFileName = generateChildNoteName(filePath, 0, 0, text)

    // For HTML files, prepend inherited styles to extracted content
    if (this.rawHtml) {
      // Parse HTML using DOMParser (reliable, handles edge cases)
      const parser = new DOMParser()
      const doc = parser.parseFromString(this.rawHtml, 'text/html')

      // Extract all <link rel="stylesheet"> tags from <head>
      const linkElements = doc.head.querySelectorAll('link[rel="stylesheet"]')
      const adjustedLinks = []

      for (let i = 0; i < linkElements.length; i++) {
        const link = linkElements[i]
        const hrefAttr = link.getAttribute('href')

        // Skip absolute URLs (http, https, file, etc.)
        if (hrefAttr && /^[a-z]+:/i.test(hrefAttr)) {
          adjustedLinks.push(link.outerHTML)
          continue
        }

        // Skip absolute paths
        if (hrefAttr && hrefAttr.startsWith('/')) {
          adjustedLinks.push(link.outerHTML)
          continue
        }

        // For relative paths, prepend ../ since child note will be in _notes/ subdirectory
        if (hrefAttr) {
          // Clone the link element to modify it
          const clonedLink = link.cloneNode(true)
          const adjustedHref = '../' + hrefAttr
          clonedLink.setAttribute('href', adjustedHref)
          adjustedLinks.push(clonedLink.outerHTML)
        } else {
          adjustedLinks.push(link.outerHTML)
        }
      }

      // Extract all <style> tags from <head>
      const styleElements = doc.head.querySelectorAll('style')
      const styles = []
      for (let i = 0; i < styleElements.length; i++) {
        styles.push(styleElements[i].outerHTML)
      }

      // Prepend styles to selected text (paths adjusted for _notes/ subdirectory)
      if (adjustedLinks.length > 0 || styles.length > 0) {
        const allStyles = adjustedLinks.join('\n') + '\n' + styles.join('\n')
        text = allStyles + '\n' + text
      }
    }

    const libraryId = window.currentFileLibraryId

    try {
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
   * Otherwise electron would think the path is relative to the out/renderer/ directory, where the index.html is located
   * @param {string} html - HTML content with potentially relative paths
   * @param {string} baseFilePath - Absolute path to the HTML file
   * @returns {string} - HTML with resolved absolute paths
   */
  resolveRelativePaths(html, baseFilePath) {
    if (!baseFilePath) return html

    // Get the directory containing the HTML file
    const baseDir = baseFilePath.substring(0, baseFilePath.lastIndexOf('/'))

    /**
     * Simple path resolution function (mimics path.resolve behavior)
     * @param {string} base - Base directory path
     * @param {string} relative - Relative path to resolve
     * @returns {string} - Resolved absolute path
     */
    const resolvePath = (base, relative) => {
      // Split base path into parts, filter out empty strings
      const parts = base.split('/').filter((p) => p)
      const relativeParts = relative.split('/')

      // Process each part of the relative path
      for (let i = 0; i < relativeParts.length; i++) {
        const part = relativeParts[i]
        if (part === '..') {
          // Go up one directory
          if (parts.length > 0) {
            parts.pop()
          }
        } else if (part !== '.' && part !== '') {
          // Normal directory or file name
          parts.push(part)
        }
        // Skip '.' and empty parts
      }

      return '/' + parts.join('/')
    }

    /**
     * Validate that a relative path is safe
     * @param {string} relativePath - Relative path to validate
     * @param {string} resolvedPath - Resolved absolute path
     * @returns {boolean} - True if path is safe
     */
    const isPathSafe = (relativePath, resolvedPath) => {
      // Reject paths with null bytes
      if (relativePath.includes('\0')) return false

      // Reject absolute paths (should be relative)
      if (relativePath.startsWith('/')) return false

      // Reject excessive path traversal (more than 10 levels up)
      const upLevels = (relativePath.match(/\.\./g) || []).length
      if (upLevels > 10) {
        console.warn(`Suspicious path with too many ..: ${relativePath}`)
        return false
      }

      // Basic sanity check: resolved path should be valid
      if (!resolvedPath || resolvedPath === '/') {
        console.warn(`Invalid resolved path: ${resolvedPath}`)
        return false
      }

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

      // Decode path first since it's already URI-encoded in HTML
      const decodedPath = decodeURIComponent(path)

      // Resolve relative path to absolute path
      const absolutePath = resolvePath(baseDir, decodedPath)

      // Validate safety
      if (!isPathSafe(decodedPath, absolutePath)) {
        console.warn(`Unsafe path detected and skipped: ${path}`)
        return match
      }

      // Encode path components (but not the path separators)
      const encodedPath = absolutePath
        .split('/')
        .map((part) => encodeURIComponent(part))
        .join('/')

      return `src="file://${encodedPath}"`
    })

    // Handle href attributes (link, a, etc.)
    resolved = resolved.replace(/\bhref=["']([^"':]+)["']/gi, (match, path) => {
      // Skip absolute URLs (http, https, mailto, etc.)
      if (/^[a-z]+:/i.test(path)) return match
      // Skip fragment identifiers
      if (path.startsWith('#')) return match
      // Skip absolute paths starting with /
      if (path.startsWith('/')) return match

      // Decode path first (in case it's already URI-encoded in HTML)
      const decodedPath = decodeURIComponent(path)

      // Resolve relative path to absolute path
      const absolutePath = resolvePath(baseDir, decodedPath)

      // Validate safety
      if (!isPathSafe(decodedPath, absolutePath)) {
        console.warn(`Unsafe path detected and skipped: ${path}`)
        return match
      }

      // Encode path components (but not the path separators)
      const encodedPath = absolutePath
        .split('/')
        .map((part) => encodeURIComponent(part))
        .join('/')

      return `href="file://${encodedPath}"`
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

    // Store raw HTML for style extraction during note extraction
    this.rawHtml = content

    // Resolve relative paths if file path is provided
    const resolved = filePath ? this.resolveRelativePaths(content, filePath) : content

    // Sanitize HTML using DOMPurify to prevent XSS attacks
    this.content = DOMPurify.sanitize(resolved, {
      // Use FORCE_BODY to keep all elements including <link>
      FORCE_BODY: true,
      // Only allow file protocol to load local resources
      ALLOWED_URI_REGEXP: /^(?:file:|#|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
      // Allow common HTML tags including style and link for CSS
      ADD_TAGS: ['link', 'style'],
      // Forbid interactive and form-related tags
      FORBID_TAGS: [
        'form',
        'input',
        'button',
        'textarea',
        'select',
        'option',
        'optgroup',
        'datalist',
        'dialog',
        'menu',
        'menuitem',
        'source',
        'track',
        'area',
        'map',
      ],
      // Forbid dangerous attributes
      FORBID_ATTR: ['contenteditable', 'crossorigin', 'ping'],
    })

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

    // Note: Extracted content marking is now done via DOM manipulation
    // in loadAndLockExtractedContent(), not string replacement

    return html`
      <div class="html-viewer" .innerHTML=${this.content}></div>
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
