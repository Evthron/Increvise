// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * HTML DOM matching utilities for marking extracted content
 * Shared between HTMLViewer and tests
 */

/**
 * Normalize HTML whitespace for comparison
 * Collapses all whitespace to single spaces and trims
 * @param {string} html - HTML string to normalize
 * @returns {string} - Normalized HTML
 */
export function normalizeHTML(html) {
  return html.replace(/\s+/g, ' ').trim()
}

/**
 * Find matching DOM node(s) in parent document
 * Uses four-tier matching strategy:
 * 1. Consecutive siblings match (single or multiple nodes)
 * 2. innerHTML match (partial content extraction)
 * 3. Partial text match (for auto-completed but incomplete extractions)
 * 4. textContent match (fallback for modified structure)
 * @param {Document|DocumentFragment} parentDoc - Parent document or shadow root
 * @param {string} targetHTML - Target HTML to match
 * @returns {Element|Element[]|null} - Matched element(s) or null
 */
export function findMatchingNode(parentDoc, targetHTML) {
  const normalizedTarget = normalizeHTML(targetHTML)
  const allElements = parentDoc.querySelectorAll('*')

  // Parse target to determine how many top-level elements it has
  const tempDiv = parentDoc.createElement
    ? parentDoc.createElement('div')
    : document.createElement('div')
  tempDiv.innerHTML = targetHTML
  const targetElementCount = tempDiv.children.length
  const targetText = normalizeHTML(tempDiv.textContent)

  // Strategy 1: Consecutive siblings match
  // Only check sequences of the exact length needed (not all possible lengths)
  if (targetElementCount > 0) {
    const processedParents = new Set()

    for (const el of allElements) {
      const parent = el.parentElement
      if (!parent || processedParents.has(parent)) continue

      processedParents.add(parent)
      const siblings = Array.from(parent.children)

      // Only try sequences of length = targetElementCount
      for (let i = 0; i <= siblings.length - targetElementCount; i++) {
        const candidateSiblings = siblings.slice(i, i + targetElementCount)
        const combinedHTML = candidateSiblings.map((s) => s.outerHTML).join('')

        if (normalizeHTML(combinedHTML) === normalizedTarget) {
          return targetElementCount === 1 ? candidateSiblings[0] : candidateSiblings
        }
      }
    }
  }

  // Strategy 2: innerHTML match (partial content selection)
  for (const el of allElements) {
    if (normalizeHTML(el.innerHTML) === normalizedTarget) {
      return el
    }
  }

  // Strategy 3: Partial text match (for auto-completed but incomplete extractions)
  // When user selects partial text, browser auto-completes tags but omits unselected children
  // Example: selecting "Data Types" in <h4><span>1.3.3.2</span> Data Types</h4>
  // Result: <h4>Data Types</h4> (missing the <span>)
  // Match by: target text is contained in element's text AND element has same tag name
  if (targetElementCount === 1) {
    const targetElement = tempDiv.children[0]
    const targetTagName = targetElement.tagName.toLowerCase()

    let bestMatch = null
    let bestSize = Infinity

    for (const el of allElements) {
      const elText = normalizeHTML(el.textContent)
      const elTagName = el.tagName.toLowerCase()

      // Check if:
      // 1. Same tag name
      // 2. Element's text contains the target text
      // 3. Element is the smallest match (to avoid matching parent containers)
      if (elTagName === targetTagName && elText.includes(targetText)) {
        const size = el.innerHTML.length
        if (size < bestSize) {
          bestMatch = el
          bestSize = size
        }
      }
    }

    if (bestMatch) {
      return bestMatch
    }
  }

  // Strategy 4: textContent exact match (fallback for structure changes)
  let bestMatch = null
  let bestSize = Infinity

  for (const el of allElements) {
    if (normalizeHTML(el.textContent) === targetText) {
      const size = el.innerHTML.length
      if (size < bestSize) {
        bestMatch = el
        bestSize = size
      }
    }
  }

  return bestMatch
}
