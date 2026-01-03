// HTMLViewer.js
import { LitElement, html, css } from 'lit';

export class HTMLViewer extends LitElement {
  static properties = {
    isLoading: { type: Boolean },
    errorMessage: { type: String },
    content: { type: String },
    showLinkDialog: { type: Boolean },
    previewUrl: { type: String },
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
      position: relative;
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

    /* Locked/extracted content styles */
    .extracted-content {
      background-color: rgba(100, 100, 100, 0.1);
      border-left: 3px solid #999;
      padding-left: 0.5rem;
      opacity: 0.6;
      pointer-events: none;
      user-select: none;
    }

    .link-dialog-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
    }

    .link-dialog {
      background: #fff;
      color: #111;
      padding: 1rem;
      border-radius: 8px;
      width: min(800px, 90vw);
      max-height: 80vh;
      overflow: auto;
      box-shadow: 0 10px 40px rgba(0,0,0,0.25);
    }

    .link-url {
      font-size: 0.9rem;
      word-break: break-all;
      color: #2563eb;
      margin: 0.25rem 0 0.75rem;
    }

    .preview {
      background: #f3f4f6;
      padding: 0.75rem;
      border-radius: 6px;
      max-height: 40vh;
      overflow: auto;
      margin-bottom: 0.75rem;
      border: 1px solid #e5e7eb;
    }

    .preview.loading {
      font-style: italic;
      color: #6b7280;
    }

    .dialog-actions {
      display: flex;
      gap: 0.5rem;
      justify-content: flex-end;
    }

    .dialog-actions button {
      padding: 0.35rem 0.8rem;
      border: 1px solid #d1d5db;
      background: #fff;
      cursor: pointer;
    }
  `;

  constructor() {
    super();
    this.isLoading = false;
    this.errorMessage = '';
    this.content = '';
    this.showLinkDialog = false;
    this.previewUrl = '';
    this.extractedTexts = [];
    this._linkHandler = (event) => {
      const anchor = event.composedPath().find((n) => n?.tagName === 'A')
      const href = anchor?.getAttribute?.('href') || ''
      const isExternal = /^https?:\/\//i.test(href) || href.startsWith('//')
      if (anchor && isExternal) {
        event.preventDefault()
        this.openLinkDialog(href)
      }
    }
  }
  
  /**
   * Get currently selected text and its position info
   * Markdown/HTML are rendered as DOM elements so cannot use codemirror select lines
   * @returns {Object|null} { text: string, hasSelection: boolean } or null
   */
  getSemanticSelection() {
    // Prefer shadow selection; fallback to document selection
    const selection = (this.shadowRoot && this.shadowRoot.getSelection && this.shadowRoot.getSelection()) || document.getSelection()
    if (!selection || selection.rangeCount === 0) return null

    const range = selection.getRangeAt(0)
    let container = range.commonAncestorContainer
    if (container.nodeType === Node.TEXT_NODE) {
      container = container.parentElement
    }

    const BLOCK_SELECTOR = 'h1,h2,h3,p,article,section,li,blockquote'
    const block = container?.closest?.(BLOCK_SELECTOR)
    const selectedText = selection.toString().trim()

    if (block && block.textContent) {
      return {
        text: block.textContent.trim(),
        tag: block.tagName.toLowerCase(),
        hasSelection: true,
      }
    }

    if (!selectedText) return null

    return {
      text: selectedText,
      tag: 'inline',
      hasSelection: true,
    }
  }

  /**
   * Lock/highlight already extracted content
   * @param {Array<Object>} ranges, array of objects with extracted_text property
   */
  lockContent(ranges) {
    this.extractedTexts = ranges.map(r => r.extracted_text || r.text).filter(Boolean);
    this.requestUpdate(); // Re-render with locked styling
  }

  /**
   * Clear all locked content
   */
  clearLockedContent() {
    this.extractedTexts = [];
    this.requestUpdate();
  }
  
  connectedCallback() {
    super.connectedCallback()
    this.addEventListener('click', this._linkHandler, true)
  }

  disconnectedCallback() {
    this.removeEventListener('click', this._linkHandler, true)
    super.disconnectedCallback()
  }

  /**
   * Set HTML content (rendered as-is; sanitize upstream if untrusted).
   * @param {string} content - raw HTML string
   */
  setHtml(content) {
    this.content = content
    this.requestUpdate()
  }

  openLinkDialog(url) {
    this.previewUrl = url
    this.showLinkDialog = true
  }

  closeLinkDialog() {
    this.showLinkDialog = false
  }

  chooseOpenExternal() {
    if (this.previewUrl) window.open(this.previewUrl, '_blank')
    this.showLinkDialog = false
  }

  // yes basically similar to pdf viewer but renders html here
  // similar comments can be viewed in markdown viewer.js
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

    // Apply locked styling to extracted content
    let renderedContent = this.content;
    if (this.extractedTexts.length > 0) {
      this.extractedTexts.forEach(extractedText => {
        if (extractedText) {
          // Escape special regex characters
          const escapedText = extractedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`(${escapedText})`, 'gi');
          renderedContent = renderedContent.replace(regex, '<span class="extracted-content">$1</span>');
        }
      });
    }

    return html`
      <div class="html-viewer" .innerHTML=${renderedContent}></div>
      ${this.showLinkDialog
        ? html`
            <div class="link-dialog-backdrop" @click=${this.closeLinkDialog}>
              <div class="link-dialog" @click=${(e) => e.stopPropagation()}>
                <h3>Open Link</h3>
                <p class="link-url">${this.previewUrl}</p>
                <div class="dialog-actions">
                  <button @click=${this.chooseOpenExternal}>Open externally</button>
                  <button @click=${this.closeLinkDialog}>Cancel</button>
                </div>
              </div>
            </div>
          `
        : ''}
    `;
  }
}

customElements.define('html-viewer', HTMLViewer);
export default HTMLViewer;