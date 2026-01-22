// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

/* global customElements, CustomEvent */

// Queue Menu Lit component
// Displays a dropdown menu for switching between queues

import { LitElement, html, css } from 'lit'

export class QueueMenu extends LitElement {
  static properties = {
    currentQueue: { type: String },
    position: { type: Object },
    visible: { type: Boolean },
  }

  static styles = css`
    :host {
      display: none;
      position: fixed;
      background-color: #ffffff;
      border: 1px solid #ddd;
      border-radius: 6px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
      min-width: 240px;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    :host([visible]) {
      display: block;
    }

    .queue-menu-header {
      padding: 8px 12px;
      background-color: #f5f5f5;
      border-bottom: 1px solid #ddd;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      color: #666;
      letter-spacing: 0.5px;
    }

    .queue-menu-item {
      padding: 10px 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 13px;
      transition: background-color 0.15s ease;
      border-bottom: 1px solid #f5f5f5;
    }

    .queue-menu-item:last-child {
      border-bottom: none;
    }

    .queue-menu-item:hover {
      background-color: #f8f8f8;
    }

    .queue-menu-item.active {
      background-color: #e3f2fd;
      font-weight: 600;
    }

    .queue-menu-item-label {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .queue-menu-item-name {
      font-weight: 500;
      color: #333;
    }

    .queue-menu-item-desc {
      font-size: 11px;
      color: #666;
    }

    .queue-menu-item-icon {
      font-size: 16px;
    }
  `

  constructor() {
    super()
    this.currentQueue = null
    this.position = { top: 0, left: 0 }
    this.visible = false
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

  updated(changedProperties) {
    if (changedProperties.has('position') || changedProperties.has('visible')) {
      if (this.visible) {
        this.style.top = `${this.position.top}px`
        this.style.left = `${this.position.left}px`
        this.setAttribute('visible', '')
      } else {
        this.removeAttribute('visible')
      }
    }
  }

  _handleQueueClick(queueName) {
    this.dispatchEvent(
      new CustomEvent('queue-selected', {
        detail: { queueName },
        bubbles: true,
        composed: true,
      })
    )
  }

  render() {
    if (!this.visible) {
      return html``
    }

    return html`
      <div class="queue-menu-header">Move to Queue</div>
      ${this.queues.map(
        (q) => html`
          <div
            class="queue-menu-item ${q.name === this.currentQueue ? 'active' : ''}"
            @click=${() => this._handleQueueClick(q.name)}
          >
            <div class="queue-menu-item-label">
              <span class="queue-menu-item-name">${q.display}</span>
              <span class="queue-menu-item-desc">${q.desc}</span>
            </div>
            <span class="queue-menu-item-icon">${q.icon}</span>
          </div>
        `
      )}
    `
  }
}

customElements.define('queue-menu', QueueMenu)
