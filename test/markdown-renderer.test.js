// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { JSDOM } from 'jsdom'
import { markdownToHtml } from '../src/renderer/ui/markdown-renderer.js'

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>')
globalThis.document = dom.window.document

/**
 * Simulates the full fix: recursive mode wraps first element, original mode restores all.
 * Only operates on elements within the given line range.
 */
function roundTrip(parentHtml, childHtml, rangeStart, rangeEnd) {
  const container = dom.window.document.createElement('div')
  container.innerHTML = parentHtml

  // Collect elements in range (simulating applyExtractedHighlighting)
  const elementsInRange = []
  container.querySelectorAll('[data-line-start][data-line-end]').forEach((el) => {
    const elStart = parseInt(el.getAttribute('data-line-start'))
    const elEnd = parseInt(el.getAttribute('data-line-end'))
    if (elStart <= rangeEnd && elEnd >= rangeStart) {
      el.classList.add('extracted-content')
      elementsInRange.push(el)
    }
  })

  const wrapperDataMap = new WeakMap()

  // Recursive mode
  elementsInRange.forEach((el, index) => {
    if (index === 0) {
      const wrapper = dom.window.document.createElement('div')
      wrapper.innerHTML = childHtml
      wrapper.classList.add('extracted-recursive-content')
      if (el.classList.contains('extracted-content')) {
        wrapper.classList.add('extracted-content')
      }
      wrapper.style.position = 'relative'
      wrapperDataMap.set(wrapper, {
        tagName: el.tagName,
        lineStart: el.getAttribute('data-line-start'),
        lineEnd: el.getAttribute('data-line-end'),
        originalHtml: el.innerHTML,
      })
      el.parentNode.replaceChild(wrapper, el)
      elementsInRange[index] = wrapper
    } else {
      el.innerHTML = ''
      el.classList.add('extracted-recursive-content')
      el.removeAttribute('data-line-start')
      el.removeAttribute('data-line-end')
    }
  })

  // Original mode: restore all elements
  elementsInRange.forEach((el, index) => {
    if (index === 0) {
      const wrapperData = wrapperDataMap.get(el)
      if (wrapperData) {
        const origEl = dom.window.document.createElement(wrapperData.tagName)
        origEl.innerHTML = wrapperData.originalHtml
        origEl.style.position = 'relative'
        if (wrapperData.lineStart) {
          origEl.setAttribute('data-line-start', wrapperData.lineStart)
        }
        if (wrapperData.lineEnd) {
          origEl.setAttribute('data-line-end', wrapperData.lineEnd)
        }
        el.parentNode.replaceChild(origEl, el)
        elementsInRange[index] = origEl
      }
    } else {
      // For non-first elements, restore from stored original HTML in dataset
      if (el._originalData) {
        el.innerHTML = el._originalData
        el.classList.remove('extracted-recursive-content')
        el.setAttribute('data-line-start', el._originalLineStart)
        el.setAttribute('data-line-end', el._originalLineEnd)
      }
    }
  })

  return container
}

describe('recursive render fix', () => {
  it('toggle round-trip: recursive → original restores content correctly', () => {
    const parentHtml = markdownToHtml('# Title\n\nParagraph.', true)
    const childHtml = markdownToHtml('# Child Title\n\nChild body.', false)

    const container = roundTrip(parentHtml, childHtml, 1, 2)

    const h1 = container.querySelector('h1')
    assert.ok(h1, 'original h1 should be restored')
    assert.strictEqual(h1.textContent.trim(), 'Title')
    assert.strictEqual(h1.getAttribute('data-line-start'), '1')
    assert.strictEqual(h1.getAttribute('data-line-end'), '2')

    const p = container.querySelector('p')
    assert.ok(p, 'original p should be restored')
    assert.strictEqual(p.textContent.trim(), 'Paragraph.')
  })

  it('recursive mode: wrapper has proper CSS and position', () => {
    const parentHtml = markdownToHtml('# Title\n\nParagraph.', true)
    const childHtml = markdownToHtml('# Child\n\nContent.', false)

    const container = dom.window.document.createElement('div')
    container.innerHTML = parentHtml

    // Find elements in range 1-2 and add extracted-content class
    const matched = []
    container.querySelectorAll('[data-line-start][data-line-end]').forEach((el) => {
      const s = parseInt(el.getAttribute('data-line-start'))
      const e = parseInt(el.getAttribute('data-line-end'))
      if (s <= 2 && e >= 1) {
        el.classList.add('extracted-content')
        matched.push(el)
      }
    })

    // Recursive mode only
    matched.forEach((el, index) => {
      if (index === 0) {
        const wrapper = dom.window.document.createElement('div')
        wrapper.innerHTML = childHtml
        wrapper.classList.add('extracted-recursive-content')
        if (el.classList.contains('extracted-content')) {
          wrapper.classList.add('extracted-content')
        }
        wrapper.style.position = 'relative'
        el.parentNode.replaceChild(wrapper, el)
      } else {
        el.innerHTML = ''
        el.classList.add('extracted-recursive-content')
        el.removeAttribute('data-line-start')
        el.removeAttribute('data-line-end')
      }
    })

    const wrapper = container.querySelector('div.extracted-recursive-content')
    assert.ok(wrapper, 'wrapper should exist')
    assert.strictEqual(wrapper.style.position, 'relative')
    assert.ok(wrapper.classList.contains('extracted-content'))
    assert.strictEqual(wrapper.querySelector('h1').textContent.trim(), 'Child')
  })

  it('round-trip does not duplicate controls', () => {
    const parentHtml = markdownToHtml('# Title\n\nParagraph.', true)
    const childHtml = markdownToHtml('# Child\n\nContent.', false)

    const container = dom.window.document.createElement('div')
    container.innerHTML = parentHtml

    // Collect elements in range and add controls (simulating _addExtractedToggle)
    const matched = []
    container.querySelectorAll('[data-line-start][data-line-end]').forEach((el) => {
      const s = parseInt(el.getAttribute('data-line-start'))
      const e = parseInt(el.getAttribute('data-line-end'))
      if (s <= 2 && e >= 1) {
        el.classList.add('extracted-content')
        matched.push(el)
      }
    })
    matched.forEach((el) => {
      const ctrl = dom.window.document.createElement('div')
      ctrl.className = 'extracted-controls'
      ctrl.textContent = 'controls'
      el.appendChild(ctrl)
    })

    // Simulate first toggle to recursive
    const wrapperDataMap = new WeakMap()
    matched.forEach((el, index) => {
      const controls = el.querySelector('.extracted-controls')
      // Detach controls before reading innerHTML (same fix as in _applyRecursiveRendering)
      if (controls && controls.parentNode === el) {
        el.removeChild(controls)
      }
      if (index === 0) {
        const wrapper = dom.window.document.createElement('div')
        wrapper.innerHTML = childHtml
        wrapper.classList.add('extracted-recursive-content')
        wrapper.style.position = 'relative'
        wrapperDataMap.set(wrapper, {
          tagName: el.tagName,
          lineStart: el.getAttribute('data-line-start'),
          lineEnd: el.getAttribute('data-line-end'),
          originalHtml: el.innerHTML,
        })
        if (controls) {
          wrapper.appendChild(controls)
        }
        el.parentNode.replaceChild(wrapper, el)
        matched[index] = wrapper
      } else {
        el.innerHTML = ''
        el.classList.add('extracted-recursive-content')
        el.removeAttribute('data-line-start')
        el.removeAttribute('data-line-end')
      }
    })

    // Simulate toggle back to original
    matched.forEach((el, index) => {
      if (index === 0) {
        const wrapperData = wrapperDataMap.get(el)
        if (wrapperData) {
          const origEl = dom.window.document.createElement(wrapperData.tagName)
          origEl.innerHTML = wrapperData.originalHtml
          origEl.style.position = 'relative'
          if (wrapperData.lineStart) {
            origEl.setAttribute('data-line-start', wrapperData.lineStart)
          }
          if (wrapperData.lineEnd) {
            origEl.setAttribute('data-line-end', wrapperData.lineEnd)
          }
          // Move controls from wrapper to restored element
          const wrapperControls = el.querySelector('.extracted-controls')
          if (wrapperControls) {
            origEl.appendChild(wrapperControls)
          }
          el.parentNode.replaceChild(origEl, el)
          matched[index] = origEl
        }
      }
    })

    // Verify: restored h1 should have exactly ONE .extracted-controls
    const h1 = container.querySelector('h1')
    assert.ok(h1, 'original h1 should be restored')
    const controlsList = h1.querySelectorAll('.extracted-controls')
    assert.strictEqual(controlsList.length, 1, 'should have exactly one .extracted-controls, not ' + controlsList.length)
    assert.ok(h1.textContent.includes('Title'), 'h1 text should be restored')
  })

  it('non-extracted elements are not affected', () => {
    const parentHtml = markdownToHtml('# Title\n\nParagraph.\n\n## Another\n\nMore.', true)
    const childHtml = markdownToHtml('# Child\n\nContent.', false)

    const container = roundTrip(parentHtml, childHtml, 1, 2)

    // Non-extracted h2 should be intact
    const h2 = container.querySelector('h2')
    assert.ok(h2, 'non-extracted h2 should exist')
    assert.strictEqual(h2.textContent.trim(), 'Another')

    // Non-extracted paragraphs should be intact
    const p = container.querySelector('p:last-of-type')
    assert.ok(p)
    assert.strictEqual(p.textContent.trim(), 'More.')
  })
})
