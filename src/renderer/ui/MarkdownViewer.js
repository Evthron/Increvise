// MarkdownViewer.js
import { LitElement, html, css } from 'lit';
import { marked } from 'marked';

export class MarkdownViewer extends LitElement {
  static properties = {
    isLoading: { type: Boolean },
    errorMessage: { type: String },
    content: { type: String },
    contentType: { type: String }, // expects 'markdown'
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
  `;

  constructor() {
    super();
    this.isLoading = false;
    this.errorMessage = '';
    this.content = '';
    this.contentType = '';
  }

  /**
   * Set markdown content
   * @param {string} content - raw markdown text
   * @param {string} type - optional (default 'markdown')
   */
  setMarkdown(content) {
    this.content = content
    this.contentType = 'markdown'
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

    if (this.contentType === 'markdown') {
      // Convert markdown to HTML using marked and inject as innerHTML.
      // WARNING: this output is unsanitized. For untrusted content, sanitize with DOMPurify.
      const rendered = marked.parse(this.content || '');
      return html`<div class="markdown-viewer" .innerHTML=${rendered}></div>`;
    }

    // Fallback: plain text
    return html`<pre style="white-space:pre-wrap; padding:1rem;">${this.content}</pre>`;
  }
}

customElements.define('markdown-viewer', MarkdownViewer);
export default MarkdownViewer;