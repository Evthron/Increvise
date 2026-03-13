// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { LitElement, css, html } from 'lit'

/**
 * A three-column layout component that replicates the exact structure
 * and styles from the original nested sl-split-panel setup
 */
export class ThreeColumnLayout extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex: 1;
    }
  `
  render() {
    return html`
      <sl-split-panel style="width: 100%; height: 100%" position="40">
        <div
          slot="start"
          style="background: var(--sl-color-neutral-50); height: 100%; overflow: hidden"
        >
          <sl-split-panel style="height: 100%" position="50">
            <div slot="start" style="background: var(--sl-color-neutral-50); overflow: hidden">
              <sl-split-panel vertical style="height: 100%">
                <div
                  slot="start"
                  style="
                    height: 100%;
                    width: 100%;
                    background: var(--sl-color-neutral-50);
                    display: flex;
                    overflow: hidden;
                  "
                >
                  <slot name="sidebar-top"></slot>
                </div>
                <div
                  slot="end"
                  style="
                    height: 100%;
                    width: 100%;
                    background: var(--sl-color-neutral-50);
                    display: flex;
                    overflow: hidden;
                  "
                >
                  <slot name="sidebar-bottom"></slot>
                </div>
              </sl-split-panel>
            </div>
            <div
              slot="end"
              style="
                background: var(--sl-color-neutral-50);
                display: flex;
                overflow: hidden;
                flex: 1;
              "
            >
              <slot name="middle"></slot>
            </div>
          </sl-split-panel>
        </div>
        <div
          slot="end"
          style="background: var(--sl-color-neutral-50); display: flex; overflow: hidden; flex: 1"
        >
          <slot name="main"></slot>
        </div>
      </sl-split-panel>
    `
  }
}

customElements.define('three-column-layout', ThreeColumnLayout)
