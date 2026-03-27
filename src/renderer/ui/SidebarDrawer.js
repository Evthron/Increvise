// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { css } from 'lit'
import { LionDrawer } from '@lion/ui/drawer.js'

const EVENT = {
  TRANSITION_END: 'transitionend',
  TRANSITION_START: 'transitionstart',
}

class SidebarDrawer extends LionDrawer {
  static get styles() {
    return [
      ...super.styles,
      css`
        :host {
          display: flex;
          --min-width: 30px;
          --max-width: 20vw;
          --max-height: unset;
          background-color: var(--bg-sidebar);
          border-right: 1px solid var(--border-color);
        }

        .container {
          display: flex;
          flex-direction: column;
          height: 100%;
          width: 100%;
        }

        .headline-container {
          padding: 12px 16px;
          border-bottom: 1px solid var(--border-color);
          background-color: var(--toolbar-bg);
        }

        .content-container {
          display: flex;
          height: 100%;
        }
      `,
    ]
  }
  connectedCallback() {
    super.connectedCallback()
    this.addEventListener('opened-changed', this._handleOpenedChanged)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.removeEventListener('opened-changed', this._handleOpenedChanged)
  }

  _handleOpenedChanged = () => {
    const contentNode = this.shadowRoot.querySelector('.content-container')
    if (contentNode) {
      contentNode.style.setProperty('display', this.opened ? '' : 'none')
    }
  }

  // The source function forgets to check the source of the event, all transition event inside the content node would trigger this
  _waitForTransition({ contentNode }) {
    return new Promise((resolve) => {
      const transitionStarted = (event) => {
        // Check if the event is from the contentNode itself, not its children
        if (event.target !== contentNode) {
          return
        }
        contentNode.removeEventListener(EVENT.TRANSITION_START, transitionStarted)
        this.transitioning = true
      }
      contentNode.addEventListener(EVENT.TRANSITION_START, transitionStarted)

      const transitionEnded = (event) => {
        // Check if the event is from the contentNode itself, not its children
        if (event.target !== contentNode) {
          return
        }
        contentNode.removeEventListener(EVENT.TRANSITION_END, transitionEnded)
        this.transitioning = false
        resolve()
      }
      contentNode.addEventListener(EVENT.TRANSITION_END, transitionEnded)
    })
  }
}

customElements.define('sidebar-drawer', SidebarDrawer)
