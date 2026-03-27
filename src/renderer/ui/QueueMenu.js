// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Queue Menu Lit component
// Displays a dropdown menu for switching between queues

import { LitElement, html, css } from 'lit'

export class QueueMenu extends LitElement {
  static properties = {
    currentQueue: { type: String },
  }

  static styles = css`
    .queue-menu-item-label {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .queue-menu-item-name {
      font-weight: 500;
      color: var(--sl-color-neutral-900);
    }

    .queue-menu-item-desc {
      font-size: 11px;
      color: var(--sl-color-neutral-600);
    }

    .queue-menu-item-content {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
    }

    sl-menu-item.active::part(base) {
      background-color: var(--sl-color-primary-50);
      font-weight: 600;
    }

    sl-menu-item.active .queue-menu-item-name {
      color: var(--sl-color-primary-600);
      font-weight: 600;
    }

    sl-menu-label {
      padding: 1rem;
    }
  `

  constructor() {
    super()
    this.currentQueue = null
    this.queues = [
      { name: 'new', display: 'New', desc: 'FIFO buffer', icon: '📥' },
      { name: 'processing', display: 'Processing', desc: 'Rotation-based', icon: '🔄' },
      { name: 'intermediate', display: 'Intermediate', desc: 'Variable interval', icon: '📊' },
      {
        name: 'spaced-casual',
        display: 'Spaced (Casual)',
        desc: '~80% retention',
        icon: '🟢',
      },
      {
        name: 'spaced-standard',
        display: 'Spaced (Standard)',
        desc: '~90% retention',
        icon: '🔵',
      },
      { name: 'spaced-strict', display: 'Spaced (Strict)', desc: '~95% retention', icon: '🔴' },
      { name: 'archived', display: 'Archived', desc: 'No active review', icon: '📦' },
    ]
  }

  render() {
    return html`
      <sl-menu-label>Move to Queue</sl-menu-label>
      ${this.queues.map(
        (q) => html`
          <sl-menu-item value=${q.name} class=${q.name === this.currentQueue ? 'active' : ''}>
            <div class="queue-menu-item-content">
              <div class="queue-menu-item-label">
                <span class="queue-menu-item-name">${q.display}</span>
                <span class="queue-menu-item-desc">${q.desc}</span>
              </div>
              <span class="queue-menu-item-icon">${q.icon}</span>
            </div>
          </sl-menu-item>
        `
      )}
    `
  }
}

customElements.define('queue-menu', QueueMenu)
