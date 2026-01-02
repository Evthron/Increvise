// SPDX-FileCopyrightText: 2025 The Increvise Project Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// There could exist links inside the displayed documents (html, markdown, pdf).
// If we do not intercept them, the app will try to navigate to those links internally,
// which is not the desired behavior for external links and could lock users from using the app as they cannot go back to previous page.
// This function exists to prevent in-app navigation for external links, and will open them in a new window instead
export function setupExternalLinkInterceptor() {
  document.addEventListener(
    'click',
    (event) => {
      const anchor = event.target.closest('a[href]')
      if (!anchor) return

      const href = anchor.getAttribute('href') || ''
      const isExternal = /^https?:\/\//i.test(href) || href.startsWith('//')

      if (isExternal) {
        event.preventDefault()
        window.open(href, '_blank')
      }
    },
    true
  )
}
