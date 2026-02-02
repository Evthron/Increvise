// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Normalize HTML by removing extra whitespace
 * @param {string} html - HTML string to normalize
 * @returns {string} - Normalized HTML with collapsed whitespace
 */
export function normalizeHTML(html) {
  // Collapses all whitespace to single spaces and trims
  return html.trim().replace(/\s+/g, ' ')
}

/**
 * Find matching DOM node(s) in parent document
 * Uses a simplified unique text matching strategy:
 * For single element: find smallest element that contains the target text
 * For multiple elements: use first element anchor + text verification
 * @param {Document|DocumentFragment} parentDoc - Parent document or shadow root
 * @param {string} targetHTML - Target HTML to match
 * @returns {Element|Element[]|null} - Matched element(s) or null
 */
export function findMatchingNode(parentDoc, targetHTML) {
  // Clean target HTML first (remove non-visible elements and attributes)
  let tempDiv = document.createElement('div')
  tempDiv.innerHTML = targetHTML

  // remove non-visible elements from HTML
  tempDiv
    .querySelectorAll('style, link, script, meta, title, base, noscript')
    .forEach((el) => el.remove())

  // Remove all attributes except 'id'
  const allChildElements = tempDiv.querySelectorAll('*')

  for (const el of allChildElements) {
    const attrs = Array.from(el.attributes)
    for (const attr of attrs) {
      // Keep 'id' for anchor matching, remove everything else
      if (attr.name !== 'id') {
        el.removeAttribute(attr.name)
      }
    }
  }

  // Remove empty elements
  // Get elements in reverse order (bottom-up, deepest first to handle nested empty elements)
  const elementsToCheck = Array.from(tempDiv.querySelectorAll('*')).reverse()

  for (const el of elementsToCheck) {
    // Check if element is empty (no text content and no non-empty children)
    const text = el.textContent.trim()
    const hasNonEmptyChildren = Array.from(el.children).some((child) => {
      return child.textContent.trim() !== ''
    })

    // Remove if completely empty and not a structural element
    if (text === '' && !hasNonEmptyChildren) {
      el.remove()
    }
  }

  const targetElementCount = tempDiv.children.length
  const targetText = normalizeHTML(tempDiv.textContent)

  if (targetText === '') {
    return null
  } else if (targetElementCount === 0) {
    // Special case: Browser auto-corrected invalid HTML (e.g., <tr> outside <table>)
    // When browser strips structure but keeps text, targetElementCount can be 0
    // Find smallest element containing the target text

    const allElements = parentDoc.querySelectorAll('*')
    let bestMatch = null
    let bestSize = Infinity

    for (const el of allElements) {
      const elText = normalizeHTML(el.textContent)

      if (elText.includes(targetText)) {
        const size = el.innerHTML.length

        // Track overall best match
        if (size < bestSize) {
          bestMatch = el
          bestSize = size
        }
      }
    }

    return bestMatch
  } else if (targetElementCount === 1) {
    const allElements = parentDoc.querySelectorAll('*')
    const targetElement = tempDiv.children[0]
    const targetCleanHTML = normalizeHTML(targetElement.outerHTML)
    const targetTag = targetElement.tagName

    // Quick match by id (with text content verification)
    const elementId = targetElement.id
    if (elementId) {
      const idMatchElement = parentDoc.getElementById(elementId)
      if (idMatchElement) {
        // Verify text content matches (prevent id conflicts or content mismatch)
        const idMatchText = normalizeHTML(idMatchElement.textContent)
        if (
          idMatchText === targetText ||
          idMatchText.includes(targetText) ||
          targetText.includes(idMatchText)
        ) {
          return idMatchElement
        }
      }
    }

    // Find exact outerHTML match
    for (const el of allElements) {
      const elCleanHTML = normalizeHTML(el.outerHTML)
      if (elCleanHTML === targetCleanHTML) {
        return el
      }
    }

    // If no exact match, find smallest element that contains the target text (partial match)
    // Prefer elements with matching tag name
    let bestMatch = null
    let bestSize = Infinity
    let bestMatchSameTag = null
    let bestSizeSameTag = Infinity

    for (const el of allElements) {
      const elText = normalizeHTML(el.textContent)

      if (elText.includes(targetText)) {
        const size = el.innerHTML.length

        // Track best match with preferred tag
        if (targetTag && el.tagName === targetTag && size < bestSizeSameTag) {
          bestMatchSameTag = el
          bestSizeSameTag = size
        }

        // Track overall best match
        if (size < bestSize) {
          bestMatch = el
          bestSize = size
        }
      }
    }

    // Prefer same-tag match if found
    return bestMatchSameTag || bestMatch
  } else {
    // Multiple element extraction
    const allElements = parentDoc.querySelectorAll('*')
    const firstTarget = tempDiv.children[0]
    const firstText = normalizeHTML(firstTarget.textContent)

    // Find ALL candidates for first element, sorted by size (smallest first)
    const firstCandidates = []

    for (const el of allElements) {
      const elText = normalizeHTML(el.textContent)
      if (elText.includes(firstText)) {
        firstCandidates.push({ element: el, size: el.innerHTML.length })
      }
    }
    firstCandidates.sort((a, b) => a.size - b.size)

    // Try each candidate until we find one with enough siblings
    for (const { element: firstCandidate } of firstCandidates) {
      if (!firstCandidate.parentElement) continue

      // Check if we have enough siblings
      const parent = firstCandidate.parentElement
      const siblings = Array.from(parent.children)

      const startIndex = siblings.indexOf(firstCandidate)
      const windowOffset = targetElementCount - 1
      const lastIndex = siblings.length - 1

      if (startIndex + windowOffset <= lastIndex) {
        const candidateSequence = siblings.slice(startIndex, startIndex + targetElementCount)

        // Verify by comparing text content
        const tempContainer = document.createElement('div')
        candidateSequence.forEach((el) => tempContainer.appendChild(el.cloneNode(true)))
        const candidateText = normalizeHTML(tempContainer.textContent)

        // Also compare without spaces (handles formatting differences)
        const candidateNoSpace = candidateText.replace(/\s/g, '')
        const targetNoSpace = targetText.replace(/\s/g, '')

        if (candidateText === targetText) {
          // Exact match
          return candidateSequence
        } else if (candidateNoSpace === targetNoSpace) {
          // Same content, different spacing
          return candidateSequence
        } else if (candidateText.includes(targetText) || targetText.includes(candidateText)) {
          // One is substring of the other (covers partial selections and structural differences)
          return candidateSequence
        }
      }
    }
    return null
  }
}
