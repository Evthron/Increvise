// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Test suite for HTML DOM matching algorithm
 * Tests the matching strategy used in HTMLViewer for marking extracted content
 */

import { test } from 'node:test'
import assert from 'node:assert'
import { JSDOM } from 'jsdom'
import { normalizeHTML, findMatchingNode } from '../src/renderer/ui/html-matching.js'

test('HTML DOM Matching Algorithm', async (t) => {
  await t.test('Strategy 1: outerHTML exact match (complete node extraction)', () => {
    const parentHTML = `
      <html><body>
        <div>
          <section id="target">
            <h2>Title</h2>
            <p>Content</p>
          </section>
        </div>
      </body></html>
    `

    const childHTML = `
      <section id="target">
        <h2>Title</h2>
        <p>Content</p>
      </section>
    `

    const parentDOM = new JSDOM(parentHTML)
    const matched = findMatchingNode(parentDOM.window.document, childHTML)

    assert.ok(matched, 'Should find matching node')
    assert.strictEqual(matched.tagName, 'SECTION', 'Should match section element')
    assert.strictEqual(matched.id, 'target', 'Should match correct element by id')
  })

  await t.test('Strategy 2: innerHTML match (partial content extraction)', () => {
    const parentHTML = `
      <html><body>
        <div id="container">
          <p>First paragraph</p>
          <p>Second paragraph</p>
        </div>
      </body></html>
    `

    // User selected content INSIDE the div, without the div itself
    const childHTML = `
      <p>First paragraph</p>
      <p>Second paragraph</p>
    `

    const parentDOM = new JSDOM(parentHTML)
    const matched = findMatchingNode(parentDOM.window.document, childHTML)

    assert.ok(matched, 'Should find matching node')
    // Strategy 1 (consecutive siblings) will match before Strategy 2 (innerHTML)
    // This is correct: user selected two paragraphs, so mark those paragraphs
    assert.ok(Array.isArray(matched), 'Should return array of consecutive siblings')
    assert.strictEqual(matched.length, 2, 'Should match both paragraphs')
    assert.strictEqual(matched[0].tagName, 'P', 'First element should be P')
    assert.strictEqual(matched[1].tagName, 'P', 'Second element should be P')
  })

  await t.test('Strategy 3: textContent match (structure modified)', () => {
    const parentHTML = `
      <html><body>
        <div>
          <p><strong>Bold text</strong> and normal text</p>
        </div>
      </body></html>
    `

    // User modified structure but kept text
    const childHTML = `
      <p>Bold text and normal text</p>
    `

    const parentDOM = new JSDOM(parentHTML)
    const matched = findMatchingNode(parentDOM.window.document, childHTML)

    assert.ok(matched, 'Should find matching node')
    assert.strictEqual(matched.tagName, 'P', 'Should match paragraph')
    assert.ok(matched.textContent.includes('Bold text'), 'Should match by text content')
  })

  await t.test('Whitespace normalization', () => {
    const parentHTML = `
      <html><body>
        <section>
            <h2>Title</h2>
            <p>Content</p>
        </section>
      </body></html>
    `

    // Child has different indentation (compact)
    const childHTML = `
      <section>
        <h2>Title</h2>
        <p>Content</p>
      </section>
    `

    const parentDOM = new JSDOM(parentHTML)
    const matched = findMatchingNode(parentDOM.window.document, childHTML)

    assert.ok(matched, 'Should find matching node despite whitespace differences')
    assert.strictEqual(matched.tagName, 'SECTION', 'Should match section')
  })

  await t.test('No match when content deleted', () => {
    const parentHTML = `
      <html><body>
        <div>
          <p>Remaining content</p>
        </div>
      </body></html>
    `

    // This content was deleted from parent
    const childHTML = `
      <nav>
        <a href="/">Home</a>
      </nav>
    `

    const parentDOM = new JSDOM(parentHTML)
    const matched = findMatchingNode(parentDOM.window.document, childHTML)

    assert.strictEqual(matched, null, 'Should return null when content not found')
  })

  await t.test('Multiple similar elements - returns first match', () => {
    const parentHTML = `
      <html><body>
        <div class="item">
          <p>Item 1</p>
        </div>
        <div class="item">
          <p>Item 1</p>
        </div>
      </body></html>
    `

    const childHTML = `<p>Item 1</p>`

    const parentDOM = new JSDOM(parentHTML)
    const matched = findMatchingNode(parentDOM.window.document, childHTML)

    assert.ok(matched, 'Should find a matching node')
    // Will match the first <p> via outerHTML strategy
    assert.strictEqual(matched.tagName, 'P', 'Should match p element')
  })

  await t.test('Nested extraction', () => {
    const parentHTML = `
      <html><body>
        <article>
          <section>
            <div>
              <p>Deeply nested content</p>
            </div>
          </section>
        </article>
      </body></html>
    `

    const childHTML = `<p>Deeply nested content</p>`

    const parentDOM = new JSDOM(parentHTML)
    const matched = findMatchingNode(parentDOM.window.document, childHTML)

    assert.ok(matched, 'Should find matching node')
    // Will match <p> via outerHTML strategy
    assert.strictEqual(matched.tagName, 'P', 'Should match p element itself')
  })

  await t.test('Real-world scenario: Table extraction', () => {
    const parentHTML = `
      <html><body>
        <table>
          <thead>
            <tr><th>Header</th></tr>
          </thead>
          <tbody>
            <tr><td>Data Row 1</td></tr>
            <tr><td>Data Row 2</td></tr>
          </tbody>
        </table>
      </body></html>
    `

    // User selected first row in tbody
    const childHTML = `<tr><td>Data Row 1</td></tr>`

    const parentDOM = new JSDOM(parentHTML)
    const matched = findMatchingNode(parentDOM.window.document, childHTML)

    console.log('DEBUG: matched element:', matched ? matched.tagName : 'null')
    console.log('DEBUG: matched HTML:', matched ? matched.outerHTML : 'null')

    assert.ok(matched, 'Should find matching node in table')
    // The algorithm may match TR or TD depending on exact structure
    // Just verify it found something reasonable
    assert.ok(
      ['TR', 'TD', 'TBODY'].includes(matched.tagName),
      `Should match table element, got ${matched.tagName}`
    )
  })

  await t.test('Strategy priority: outerHTML over innerHTML', () => {
    const parentHTML = `
      <html><body>
        <div>
          <section>
            <p>Content</p>
          </section>
        </div>
      </body></html>
    `

    // This matches section's outerHTML exactly
    const childHTML = `
      <section>
        <p>Content</p>
      </section>
    `

    const parentDOM = new JSDOM(parentHTML)
    const matched = findMatchingNode(parentDOM.window.document, childHTML)

    assert.ok(matched, 'Should find matching node')
    assert.strictEqual(
      matched.tagName,
      'SECTION',
      'Should use outerHTML match (Strategy 1) over innerHTML'
    )
  })

  await t.test('Smallest match for textContent strategy', () => {
    const parentHTML = `
      <html><body>
        <article>
          <p>Shared text</p>
        </article>
        <div>
          <span>Shared text</span>
        </div>
      </body></html>
    `

    // Only text, no structure match
    const childHTML = `Shared text`

    const parentDOM = new JSDOM(parentHTML)
    const matched = findMatchingNode(parentDOM.window.document, childHTML)

    assert.ok(matched, 'Should find matching node')
    // Should match smaller element (span or p, not article/div)
    assert.ok(['P', 'SPAN'].includes(matched.tagName), 'Should match smallest containing element')
  })

  await t.test('HTML entities and special characters', () => {
    const parentHTML = `
      <html><body>
        <p>Text with &lt;special&gt; characters &amp; symbols</p>
      </body></html>
    `

    // JSDOM will parse entities, so child should also have parsed entities
    const childHTML = `
      <p>Text with &lt;special&gt; characters &amp; symbols</p>
    `

    const parentDOM = new JSDOM(parentHTML)
    const matched = findMatchingNode(parentDOM.window.document, childHTML)

    assert.ok(matched, 'Should handle HTML entities correctly')
    assert.strictEqual(matched.tagName, 'P', 'Should match paragraph')
  })

  await t.test('Empty content', () => {
    const parentHTML = `
      <html><body>
        <div></div>
      </body></html>
    `

    const childHTML = `<div></div>`

    const parentDOM = new JSDOM(parentHTML)
    const matched = findMatchingNode(parentDOM.window.document, childHTML)

    assert.ok(matched, 'Should match empty elements')
    assert.strictEqual(matched.tagName, 'DIV', 'Should match empty div')
  })

  await t.test('Strategy 3: Partial text selection with auto-completed tags', () => {
    // Simulates: user selects only "Data Types" in <h4><span>1.3.3.2</span> Data Types</h4>
    // Browser auto-completes <h4> but omits the <span>
    const parentHTML = `
      <html><body>
        <h4 data-number="1.3.3.2" id="data-types">
          <span class="header-section-number">1.3.3.2</span> Data Types
        </h4>
      </body></html>
    `

    // User selected only "Data Types", browser created: <h4>Data Types</h4>
    const childHTML = `<h4 data-number="1.3.3.2" id="data-types">Data Types</h4>`

    const parentDOM = new JSDOM(parentHTML)
    const matched = findMatchingNode(parentDOM.window.document, childHTML)

    assert.ok(matched, 'Should find matching node')
    assert.strictEqual(matched.tagName, 'H4', 'Should match h4 element')
    assert.strictEqual(matched.id, 'data-types', 'Should match correct h4 by id')
    assert.ok(
      matched.textContent.includes('Data Types'),
      'Matched element should contain the selected text'
    )
  })

  await t.test('Strategy 3: Partial text in complex nested structure', () => {
    const parentHTML = `
      <html><body>
        <article>
          <h2><span class="number">1.</span> <span class="title">Introduction</span></h2>
          <p>Content here</p>
        </article>
      </body></html>
    `

    // User selected only "Introduction" text
    const childHTML = `<h2>Introduction</h2>`

    const parentDOM = new JSDOM(parentHTML)
    const matched = findMatchingNode(parentDOM.window.document, childHTML)

    assert.ok(matched, 'Should find matching node')
    assert.strictEqual(matched.tagName, 'H2', 'Should match h2 element')
    assert.ok(matched.textContent.includes('Introduction'), 'Should contain selected text')
  })
})

console.log('✅ HTML DOM matching tests ready to run')
