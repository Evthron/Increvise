// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * HTML DOM matching utilities for marking extracted content
 * Shared between HTMLViewer and tests
 */

/**
 * Normalize HTML by removing extra whitespace
 * Collapses all whitespace to single spaces and trims
 * NOTE: Does NOT remove attributes - that should be done via DOM manipulation
 * in removeAttributesFromHTML() if needed
 * @param {string} html - HTML string to normalize
 * @returns {string} - Normalized HTML with collapsed whitespace
 */
export function normalizeHTML(html) {
  // Only trim and collapse whitespace
  // Do NOT use regex to manipulate HTML structure or attributes
  return html.trim().replace(/\s+/g, ' ')
}

/**
 * Remove all attributes from HTML (except id) using DOM manipulation
 * Also removes empty elements (elements with no text content)
 * This handles cases where parent has attributes but child doesn't (partial selection)
 * Strategy: Only match by tagName + textContent + id, ignore all other attributes
 * @param {string} html - HTML string
 * @param {Document} doc - Document object for DOM manipulation
 * @returns {string} - HTML with all attributes removed except id and empty elements removed
 */
export function removeAttributesFromHTML(html, doc) {
  const tempDiv = doc.createElement('div')
  tempDiv.innerHTML = html

  // First pass: Remove all attributes except 'id' from all elements
  const allElements = Array.from(tempDiv.querySelectorAll('*'))
  for (const el of allElements) {
    const attrs = Array.from(el.attributes)
    for (const attr of attrs) {
      if (attr.name !== 'id') {
        el.removeAttribute(attr.name)
      }
    }
  }

  // Second pass: Remove empty elements (bottom-up to handle nested empty elements)
  // Get elements in reverse order (deepest first)
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

  return tempDiv.innerHTML
}

/**
 * Remove non-visible elements from HTML for comparison
 * Removes: <style>, <link>, <script>, <meta>, <title>, etc.
 * @param {string} html - HTML string to clean
 * @param {Document} doc - Document object (required for DOM manipulation)
 * @returns {string} - Cleaned HTML with only visible content
 */
export function removeNonVisibleElements(html, doc) {
  if (!doc) {
    throw new Error('Document object is required for removeNonVisibleElements')
  }

  const tempDiv = doc.createElement('div')
  tempDiv.innerHTML = html

  // Remove all non-visible elements using DOM manipulation (NOT regex)
  tempDiv
    .querySelectorAll('style, link, script, meta, title, base, noscript')
    .forEach((el) => el.remove())

  return tempDiv.innerHTML
}

/**
 * Remove all attributes from an element and its descendants (except id)
 * Also removes empty elements (elements with no text content)
 * Helps with matching when browser auto-completes tags but loses attributes
 * @param {Element} element - DOM element to strip
 */
function stripAllAttributes(element) {
  // First pass: remove all attributes except 'id'
  const allElements = [element, ...element.querySelectorAll('*')]

  for (const el of allElements) {
    const attrs = Array.from(el.attributes)
    for (const attr of attrs) {
      // Keep 'id' for anchor matching, remove everything else
      if (attr.name !== 'id') {
        el.removeAttribute(attr.name)
      }
    }
  }

  // Second pass: remove empty elements (bottom-up to handle nested empty elements)
  // Get elements in reverse order (deepest first)
  const elementsToCheck = Array.from(element.querySelectorAll('*')).reverse()

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
}

/**
 * Get clean HTML from an element (removing non-visible children and all attributes)
 * @param {Element} element - DOM element
 * @returns {string} - Cleaned HTML with only structure (tagName + id + textContent)
 */
export function getCleanHTML(element) {
  const clone = element.cloneNode(true)

  // Remove non-visible elements
  clone
    .querySelectorAll('style, link, script, meta, title, base, noscript')
    .forEach((el) => el.remove())

  // Remove all attributes except id (for tagName + textContent matching)
  stripAllAttributes(clone)

  return clone.outerHTML
}

/**
 * Get clean innerHTML from an element (removing non-visible children and all attributes)
 * @param {Element} element - DOM element
 * @returns {string} - Cleaned innerHTML with only structure (tagName + id + textContent)
 */
export function getCleanInnerHTML(element) {
  const clone = element.cloneNode(true)

  // Remove non-visible elements
  clone
    .querySelectorAll('style, link, script, meta, title, base, noscript')
    .forEach((el) => el.remove())

  // Remove all attributes except id (for tagName + textContent matching)
  stripAllAttributes(clone)

  return clone.innerHTML
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
  // Get document object for cleaning (support JSDOM in tests)
  const ownerDoc = parentDoc.ownerDocument || parentDoc

  // Clean target HTML first (remove non-visible elements)
  const cleanedTargetHTML = removeNonVisibleElements(targetHTML, ownerDoc)

  // Also remove href/src attributes from target (handles partial selections)
  const cleanedWithoutAttrs = removeAttributesFromHTML(cleanedTargetHTML, ownerDoc)
  const normalizedTarget = normalizeHTML(cleanedWithoutAttrs)

  const allElements = parentDoc.querySelectorAll('*')

  // Parse target to determine how many top-level elements it has
  const tempDiv = ownerDoc.createElement('div')
  tempDiv.innerHTML = cleanedWithoutAttrs
  const targetElementCount = tempDiv.children.length
  const targetText = normalizeHTML(tempDiv.textContent)

  // Strategy 0: Handle partial text content in first element
  // Case: First element has partial text (e.g., missing <span> child elements)
  // Example: <h4 id="data-types">Data Types</h4> vs <h4 id="data-types"><span>1.3.3.2</span> Data Types</h4>
  // Note: Empty elements have already been removed by removeAttributesFromHTML()
  if (targetElementCount > 1) {
    const firstTarget = tempDiv.children[0]
    const firstTargetText = normalizeHTML(firstTarget.textContent)

    // Only proceed if first element has an ID (for anchor matching)
    if (firstTarget.id && firstTargetText !== '') {
      const anchorInParent = parentDoc.getElementById(firstTarget.id)

      if (anchorInParent && anchorInParent.parentElement) {
        const anchorText = normalizeHTML(anchorInParent.textContent)

        // Check if parent's text contains target's text (partial match)
        // This handles cases where child is missing inner elements like <span>
        if (anchorText.includes(firstTargetText) && anchorText !== firstTargetText) {
          const parent = anchorInParent.parentElement
          const siblings = Array.from(parent.children)
          const startIndex = siblings.indexOf(anchorInParent)

          if (startIndex !== -1 && startIndex + targetElementCount <= siblings.length) {
            const candidateSiblings = siblings.slice(startIndex, startIndex + targetElementCount)

            // Check if remaining elements match (starting from index 1, since index 0 is partial match)
            let allMatch = true
            for (let i = 1; i < targetElementCount; i++) {
              const targetChildText = normalizeHTML(tempDiv.children[i].textContent)
              const candidateText = normalizeHTML(candidateSiblings[i].textContent)

              // Allow partial match for last element (might be truncated)
              if (i === targetElementCount - 1) {
                if (!candidateText.startsWith(targetChildText)) {
                  allMatch = false
                  break
                }
              } else {
                if (candidateText !== targetChildText) {
                  allMatch = false
                  break
                }
              }
            }

            if (allMatch) {
              return candidateSiblings
            }
          }
        }
      }
    }
  }

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

        // Get cleaned HTML from candidates (remove non-visible elements)
        const combinedCleanHTML = candidateSiblings.map((s) => getCleanHTML(s)).join('')

        if (normalizeHTML(combinedCleanHTML) === normalizedTarget) {
          return targetElementCount === 1 ? candidateSiblings[0] : candidateSiblings
        }
      }
    }
  }

  // Strategy 1b: Large multi-element extraction with first element anchor
  // For extractions with many elements (>20), try to find first element and check if siblings match
  if (targetElementCount > 20) {
    const firstTarget = tempDiv.children[0]
    let firstCandidate = null

    // Try to find first element by ID
    if (firstTarget.id) {
      firstCandidate = parentDoc.getElementById(firstTarget.id)
    }

    // If not found by ID, try to find by outerHTML match of first element
    if (!firstCandidate) {
      const firstTargetHTML = normalizeHTML(getCleanHTML(firstTarget))
      for (const el of allElements) {
        if (normalizeHTML(getCleanHTML(el)) === firstTargetHTML) {
          firstCandidate = el
          break
        }
      }
    }

    if (firstCandidate && firstCandidate.parentElement) {
      const parent = firstCandidate.parentElement
      const siblings = Array.from(parent.children)
      const startIndex = siblings.indexOf(firstCandidate)

      if (startIndex !== -1 && startIndex + targetElementCount <= siblings.length) {
        const candidateSiblings = siblings.slice(startIndex, startIndex + targetElementCount)

        // For large extractions, compare overall text content instead of individual elements
        // (handles cases where HTML structure is malformed or auto-corrected by browser)

        // Trim trailing empty elements from target (e.g., <BR> elements created by malformed HTML)
        let targetEffectiveCount = tempDiv.children.length
        while (
          targetEffectiveCount > 0 &&
          normalizeHTML(tempDiv.children[targetEffectiveCount - 1].textContent) === ''
        ) {
          targetEffectiveCount--
        }

        // Compare using only non-empty elements
        const effectiveTargetChildren = Array.from(tempDiv.children).slice(0, targetEffectiveCount)
        const effectiveCandidates = candidateSiblings.slice(0, targetEffectiveCount)

        const candidatesText = normalizeHTML(
          effectiveCandidates.map((el) => el.textContent).join('')
        )
        const targetAllText = normalizeHTML(
          effectiveTargetChildren.map((el) => el.textContent).join('')
        )

        // Check for exact match or starts-with
        if (candidatesText === targetAllText || candidatesText.startsWith(targetAllText)) {
          return candidateSiblings
        }

        // For very large extractions, allow small differences (e.g., due to encoding issues)
        // If similarity > 99%, consider it a match
        if (targetEffectiveCount > 100) {
          const minLen = Math.min(candidatesText.length, targetAllText.length)
          const maxLen = Math.max(candidatesText.length, targetAllText.length)
          const similarity = minLen / maxLen

          if (similarity > 0.99) {
            // Double-check: count actual character differences
            let differences = 0
            for (let i = 0; i < minLen; i++) {
              if (candidatesText[i] !== targetAllText[i]) {
                differences++
                if (differences > 50) break // Too many differences
              }
            }
            differences += Math.abs(candidatesText.length - targetAllText.length)

            // Allow up to 20 character differences or 0.1% of total length
            const maxAllowedDiff = Math.max(20, Math.floor(targetAllText.length * 0.001))
            if (differences <= maxAllowedDiff) {
              // Very small difference, likely encoding or whitespace issue
              return candidateSiblings
            }
          }
        }
      }
    }
  }

  // Strategy 1c: Partial consecutive siblings match (handles truncated last element)
  // When user extracts multiple elements but the last one is truncated
  if (targetElementCount > 1 && targetElementCount <= 20) {
    // Only use this strategy for reasonable sizes (avoid O(n^2) with huge extractions)
    const processedParents = new Set()
    const firstTargetTag = tempDiv.children[0].tagName

    for (const el of allElements) {
      // Quick filter: skip if not matching first element's tag
      if (el.tagName !== firstTargetTag) continue

      const parent = el.parentElement
      if (!parent || processedParents.has(parent)) continue

      const siblings = Array.from(parent.children)

      // Skip if parent doesn't have enough children
      if (siblings.length < targetElementCount) {
        processedParents.add(parent)
        continue
      }

      processedParents.add(parent)

      for (let i = 0; i <= siblings.length - targetElementCount; i++) {
        const candidateSiblings = siblings.slice(i, i + targetElementCount)

        // Quick tag check before expensive HTML comparison
        let tagsMatch = true
        for (let j = 0; j < targetElementCount; j++) {
          if (candidateSiblings[j].tagName !== tempDiv.children[j].tagName) {
            tagsMatch = false
            break
          }
        }
        if (!tagsMatch) continue

        // Check if all but last match exactly, and last element starts with target
        let allButLastMatch = true
        for (let j = 0; j < targetElementCount - 1; j++) {
          const candidateHTML = normalizeHTML(getCleanHTML(candidateSiblings[j]))
          const targetChildHTML = normalizeHTML(getCleanHTML(tempDiv.children[j]))
          if (candidateHTML !== targetChildHTML) {
            allButLastMatch = false
            break
          }
        }

        if (allButLastMatch) {
          // Check if last element's text starts with target's last element text
          const lastCandidate = candidateSiblings[targetElementCount - 1]
          const lastTarget = tempDiv.children[targetElementCount - 1]
          const candidateText = normalizeHTML(lastCandidate.textContent)
          const targetLastText = normalizeHTML(lastTarget.textContent)

          if (candidateText.startsWith(targetLastText)) {
            return candidateSiblings
          }
        }
      }
    }
  }

  // Strategy 2: innerHTML match (partial content selection)
  for (const el of allElements) {
    const cleanInnerHTML = getCleanInnerHTML(el)
    if (normalizeHTML(cleanInnerHTML) === normalizedTarget) {
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
