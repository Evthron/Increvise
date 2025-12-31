// HTMLViewer.js
import { LitElement, html, css } from 'lit';

export class HTMLViewer extends LitElement {
  static properties = {
    isLoading: { type: Boolean },
    errorMessage: { type: String },
    content: { type: String },
    contentType: { type: String }, // 'html' | 'embed' | other
  };

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      background: var(--viewer-bg, #ffffff);
      color: var(--viewer-foreground, #111);
      overflow: hidden;
    }

    .loading-message,
    .error-message,
    .empty-message {
      padding: 1rem;
      text-align: center;
      color: var(--viewer-muted, #666);
      flex: 0 0 auto;
    }

    .error-message { color: var(--viewer-error, #b00020); }

    .html-viewer {
      flex: 1 1 auto;
      overflow: auto;
      padding: 1rem;
    }

    iframe.embed-frame {
      width: 100%;
      height: 100%;
      border: none;
      display: block;
    }
  `;

  constructor() {
    super();
    this.isLoading = false;
    this.errorMessage = '';
    this.content = '';
    this.contentType = '';
  }

  /**
   * Set content and type.
   * @param {string} content - raw HTML or URL for embed
   * @param {string} type - 'html' (default) or 'embed'
   */
  setHtml(content) {
    this.content = content
    this.contentType = 'html'
    this.requestUpdate()
  }

  setEmbed(url) {
    this.content = url
    this.contentType = 'embed'
    this.requestUpdate()
  }

  render() {
    if (this.isLoading) {
      return html`<div class="loading-message">Loading content...</div>`;
    }

    if (this.errorMessage) {
      return html`<div class="error-message">${this.errorMessage}</div>`;
    }

    if (!this.content) {
      return html`<div class="empty-message">No content</div>`;
    }

    if (this.contentType === 'embed') {
      // Render an iframe for embed content (content expected to be a URL)
      // SECURITY: embedding remote content may be risky. Consider validating URLs or using a sandbox.
      return html`
        <div class="html-viewer">
          <iframe
            class="embed-frame"
            src="${this.content}"
            sandbox="allow-scripts allow-same-origin allow-forms"
            referrerpolicy="no-referrer"
          ></iframe>
        </div>
      `;
    }

    // Default: raw HTML injection. WARNING: unsanitized.
    // If you expect untrusted HTML, sanitize with DOMPurify before setting `this.content`.
    return html`
      <div class="html-viewer" .innerHTML=${this.content}></div>
    `;
  }
}

customElements.define('html-viewer', HTMLViewer);
export default HTMLViewer;