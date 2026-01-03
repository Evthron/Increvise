// MarkdownViewer.js
import { LitElement, html, css } from 'lit';
import { marked } from 'marked';

export class MarkdownViewer extends LitElement {
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
      background: var(--viewer-bg, #fff);
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

    .markdown-viewer {
      flex: 1 1 auto;
      overflow: auto;
      padding: 1rem;
      max-width: 900px;
      margin: 0 auto;
    }
    /* Basic markdown styles */
    .markdown-viewer h1, .markdown-viewer h2, .markdown-viewer h3 {
      margin-top: 1.25rem;
      margin-bottom: 0.5rem;
    }
    .markdown-viewer p {
      margin: 0.5rem 0;
    }
    .markdown-viewer pre {
      background: #f6f8fa;
      padding: 0.75rem;
      border-radius: 6px;
      overflow: auto;
    }
    .markdown-viewer code {
      background: #f3f4f6;
      padding: 0.1rem 0.25rem;
      border-radius: 4px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, "Roboto Mono", "Courier New", monospace;
    }
    img { max-width: 100%; height: auto; }

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
    this.extractedTexts = []; // Store extracted content for locking
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
   * @returns {Object|null} - { text: string, hasSelection: boolean } or null
   */
  getSelectedText() {
    const selection = this.shadowRoot.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return null;
    }

    const selectedText = selection.toString().trim();
    if (!selectedText) {
      return null;
    }

    return {
      text: selectedText,
      hasSelection: true
    };
  }

  /**
   * Lock/highlight already extracted content
   * @param {Array<Object>} ranges - Array of objects with extracted_text property
   */
  lockContent(ranges) {
    this.extractedTexts = ranges.map(r => r.extracted_text || r.text).filter(Boolean);
    this.requestUpdate(); // Re-render with locked styling
  }


  async extractSelection() {
    const selection = this.getSelectedText()
    if (!selection || !selection.text) {
      return { success: false, error: 'No text selected' }
    }
    
    // Dispatch custom event for editor.js to handle
    this.dispatchEvent(new CustomEvent('extract-requested', {
      detail: { 
        text: selection.text,
        viewerType: 'markdown'
      },
      bubbles: true,
      composed: true
    }))
    
    return { success: true }
  }


  /**
   * Clear all locked content
   */
  clearLockedContent() {
    this.extractedTexts = [];
    this.requestUpdate();
  }

  // Intercept clicks on external links to open them in a dialog/pop up
  connectedCallback() {
    super.connectedCallback()
    this.addEventListener('click', this._linkHandler, true)
  }

  // Clean up event listener when element is removed
  disconnectedCallback() {
    this.removeEventListener('click', this._linkHandler, true)
    super.disconnectedCallback()
  }

  /**
   * Set markdown content
   * @param {string} content - raw markdown text
   */
  setMarkdown(content) {
    this.content = content
    this.requestUpdate()
  }

  // Open link dialog, self explanatory
  openLinkDialog(url) {
    this.previewUrl = url
    this.showLinkDialog = true
  }

  // close link dialog, self explanatory
  closeLinkDialog() {
    this.showLinkDialog = false
  }

  // Open link externally in a new tab/window
  chooseOpenExternal() {
    if (this.previewUrl) window.open(this.previewUrl, '_blank')
    this.showLinkDialog = false
  }

  // similar to the one in pdf viewer but renders markdown here]
  // first check if isLoading is true, then show loading message;
  // then check if errorMessage is set, then show error message;
  // then check if content is empty, then show no content message;
  // Once all are done i.e. is actual fine and complete,
  // render the markdown content to HTML and display it
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

    // Render markdown to HTML with locked content highlighting
    let rendered = marked.parse(this.content || '');
    
    // Apply locked styling to extracted content
    if (this.extractedTexts.length > 0) {
      this.extractedTexts.forEach(extractedText => {
        if (extractedText) {
          // Escape special regex characters
          const escapedText = extractedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`(${escapedText})`, 'gi');
          rendered = rendered.replace(regex, '<span class="extracted-content">$1</span>');
        }
      });
    }

    return html`
      <div class="markdown-viewer" .innerHTML=${rendered}></div>
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
    `
  }
}

customElements.define('markdown-viewer', MarkdownViewer);
export default MarkdownViewer;