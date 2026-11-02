/**
 * The Compare tab (`dev-tab-compare`). Placeholder until #61: v13 dev beside an npm mermaid version, with a pixel diff.
 * See `./context.ts` for what the shell passes in.
 */
import { css, html } from 'lit';
import { ViewerTabElement } from './context.ts';

export class CompareTab extends ViewerTabElement {
  static override styles = css`
    :host {
      display: block;
      padding: 18px 12px;
      color: var(--sl-color-neutral-600);
      font-size: 13px;
    }
  `;

  override render() {
    return html`<p>Compare view: not built yet (#61).</p>`;
  }
}

customElements.define('dev-tab-compare', CompareTab);
