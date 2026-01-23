// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Processing Feedback Bar Lit component
// Displays simplified skip/viewed buttons for processing queue

import { LitElement, html, css } from 'lit'

export class ProcessingFeedbackBar extends LitElement {
  static properties = {
    disabled: { type: Boolean },
  }

  static styles = css`
    :host {
      display: block;
      width: 100%;
    }

    .feedback-buttons {
      display: flex;
      gap: 8px;
      margin: 10px;
    }

    .feedback-btn {
      flex: 1;
      padding: 10px 16px;
      font-size: 13px;
      font-weight: 600;
      border-radius: 6px;
      border: none;
      text-align: center;
      transition: all 0.2s ease;
      cursor: pointer;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      position: relative;
      overflow: hidden;
      color: white;
    }

    .feedback-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .feedback-btn::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      width: 0;
      height: 0;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.3);
      transform: translate(-50%, -50%);
      transition:
        width 0.3s,
        height 0.3s;
    }

    .feedback-btn:active::before {
      width: 100px;
      height: 100px;
    }

    .feedback-btn:active {
      transform: scale(0.95);
    }

    .feedback-btn.skip {
      background: linear-gradient(135deg, #ff9500 0%, #f57c00 100%);
    }

    .feedback-btn.skip:hover:not(:disabled) {
      background: linear-gradient(135deg, #e68600 0%, #ef6c00 100%);
      box-shadow: 0 4px 8px rgba(255, 149, 0, 0.3);
      transform: translateY(-1px);
    }

    .feedback-btn.viewed {
      background: linear-gradient(135deg, #34c759 0%, #2db34a 100%);
    }

    .feedback-btn.viewed:hover:not(:disabled) {
      background: linear-gradient(135deg, #2db34a 0%, #28a745 100%);
      box-shadow: 0 4px 8px rgba(52, 199, 89, 0.3);
      transform: translateY(-1px);
    }

    .button-label {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }

    .button-main {
      font-size: 14px;
      font-weight: 700;
    }

    .button-sub {
      font-size: 11px;
      opacity: 0.9;
      font-weight: 400;
    }
  `

  constructor() {
    super()
    this.disabled = false
  }

  _handleSkip() {
    if (this.disabled) return
    this.dispatchEvent(
      new CustomEvent('processing-feedback', {
        detail: { feedback: 'skip' },
        bubbles: true,
        composed: true,
      })
    )
  }

  _handleViewed() {
    if (this.disabled) return
    this.dispatchEvent(
      new CustomEvent('processing-feedback', {
        detail: { feedback: 'viewed' },
        bubbles: true,
        composed: true,
      })
    )
  }

  render() {
    return html`
      <div class="feedback-buttons">
        <button
          class="feedback-btn skip"
          @click=${this._handleSkip}
          ?disabled=${this.disabled}
          title="Skip this file, review again tomorrow"
        >
          <div class="button-label">
            <span class="button-main">Skip</span>
          </div>
        </button>
        <button
          class="feedback-btn viewed"
          @click=${this._handleViewed}
          ?disabled=${this.disabled}
          title="Mark as viewed, review in rotation cycle"
        >
          <div class="button-label">
            <span class="button-main">Viewed</span>
          </div>
        </button>
      </div>
    `
  }
}

customElements.define('processing-feedback-bar', ProcessingFeedbackBar)
