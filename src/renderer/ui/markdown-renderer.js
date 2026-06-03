// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { marked } from 'marked'

class SourcePositionTracker {
  constructor(markdown) {
    this.source = markdown
    this.lines = markdown.split('\n')
    this.tokenPositions = new WeakMap()
    this.currentPosition = 0
  }

  createLineMapping(original, processed) {
    if (!processed || processed === original) {
      return null
    }
    const processedLines = processed.split('\n')
    const mapping = {}
    let originalIndex = 0
    for (let processedIndex = 0; processedIndex < processedLines.length; originalIndex++) {
      mapping[processedIndex] = originalIndex
      processedIndex++
      if (processedIndex < processedLines.length && processedLines[processedIndex] === '') {
        processedIndex++
      }
    }
    return mapping
  }

  mapLineToOriginal(processedLine) {
    if (!this.lineMapping) return processedLine
    return this.lineMapping[processedLine] !== undefined
      ? this.lineMapping[processedLine]
      : processedLine
  }

  countContentNewlines(text) {
    if (!text) return 0
    const totalNewlines = (text.match(/\n/g) || []).length
    const trailingNewlines = (text.match(/\n+$/g) || []).length
    return Math.max(0, totalNewlines - trailingNewlines)
  }

  buildPositionMap(tokens) {
    if (!tokens || !Array.isArray(tokens)) return
    for (const token of tokens) {
      if (!token.raw || typeof token.raw !== 'string') continue
      let index = this.source.indexOf(token.raw, this.currentPosition)
      if (index === -1) {
        const rawTrimmed = token.raw.replace(/\n+$/, '')
        if (rawTrimmed !== token.raw) {
          index = this.source.indexOf(rawTrimmed, this.currentPosition)
          if (index !== -1) {
            token.raw = rawTrimmed
          }
        }
      }
      if (index === -1) {
        const rawTrimmed = token.raw.replace(/\n+$/, '')
        index = this.source.indexOf(rawTrimmed)
        if (index === -1) {
          index = this.source.indexOf(token.raw)
        }
      }
      if (index !== -1) {
        const startLine = this.getLineNumber(index)
        const internalNewlines = this.countContentNewlines(token.raw)
        const endLine = startLine + internalNewlines
        this.tokenPositions.set(token, {
          start: startLine,
          end: endLine,
        })
        this.currentPosition = index + token.raw.length
      }
      if (token.tokens && Array.isArray(token.tokens)) {
        this.buildPositionMap(token.tokens)
      }
    }
  }

  getLineNumber(position) {
    if (position < 0) return 1
    const beforeText = this.source.substring(0, position)
    return (beforeText.match(/\n/g) || []).length + 1
  }

  findLineRange(token) {
    if (!token) return { start: 1, end: 1 }
    const range = this.tokenPositions.get(token)
    if (range) {
      return range
    }
    if (token.raw && typeof token.raw === 'string') {
      const index = this.source.indexOf(token.raw, this.currentPosition)
      if (index !== -1) {
        const startLine = this.getLineNumber(index)
        const internalNewlines = this.countContentNewlines(token.raw)
        return {
          start: startLine,
          end: startLine + internalNewlines,
        }
      }
    }
    return { start: 1, end: 1 }
  }
}

class LineNumberRenderer extends marked.Renderer {
  constructor(options, tracker) {
    super(options)
    this.tracker = tracker
  }

  addLineAttrs(token) {
    const range = this.tracker.findLineRange(token)
    return ` data-line-start="${range.start}" data-line-end="${range.end}"`
  }

  addLineAttrsForLineIndex(token, lineIndex) {
    const range = this.tracker.findLineRange(token)
    const lineNum = range.start + lineIndex
    return ` data-line-start="${lineNum}" data-line-end="${lineNum}"`
  }

  heading(token) {
    const text = this.parser.parseInline(token.tokens)
    const lineAttrs = this.addLineAttrs(token)
    const tag = 'h' + token.depth
    return `<${tag}${lineAttrs}>${text}</${tag}>\n`
  }

  paragraph(token) {
    const text = this.parser.parseInline(token.tokens)
    const lineAttrs = this.addLineAttrs(token)
    if (text.includes('<br>')) {
      const parts = text.split('<br>')
      return parts
        .map((part, idx) => {
          const attrs = this.addLineAttrsForLineIndex(token, idx)
          return `<p${attrs}>${part}</p>\n`
        })
        .join('')
    }
    return `<p${lineAttrs}>${text}</p>\n`
  }

  br() {
    return '<br>'
  }

  blockquote(token) {
    const body = this.parser.parse(token.tokens)
    const lineAttrs = this.addLineAttrs(token)
    return `<blockquote${lineAttrs}>\n${body}</blockquote>\n`
  }

  list(token) {
    const lineAttrs = this.addLineAttrs(token)
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
    const lineAttrs = this.addLineAttrs(item)
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
    const lineAttrs = this.addLineAttrs(token)
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
    const lineAttrs = this.addLineAttrs(token)
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
    const lineAttrs = this.addLineAttrs(token)
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
export function markdownToHtml(markdown, includeLineNumbers = true) {
  marked.setOptions({
    gfm: true,
    breaks: true,
    tables: true,
  })

  if (!includeLineNumbers) {
    return marked.parse(markdown)
  }

  const tokens = marked.lexer(markdown)
  const tracker = new SourcePositionTracker(markdown)
  try {
    tracker.buildPositionMap(tokens)
  } catch (err) {
    console.warn('Failed to build token position map:', err.message)
  }

  const renderer = new LineNumberRenderer({}, tracker)
  const parser = new marked.Parser({ renderer })
  return parser.parse(tokens)
}
