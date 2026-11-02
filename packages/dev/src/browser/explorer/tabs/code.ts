/**
 * The Code tab (`dev-tab-code`). Placeholder until #59: the CodeMirror editor, Save (Mod-s), dirty/saved status.
 * See `./context.ts` for what the shell passes in.
 */
import { css, html } from 'lit';
import { ViewerTabElement } from './context.ts';

export class CodeTab extends ViewerTabElement {
  static override styles = css`
    :host {
      display: block;
      padding: 18px 12px;
      color: var(--sl-color-neutral-600);
      font-size: 13px;
    }
  `;

  override render() {
    return html`<p>Code view: not built yet (#59).</p>`;
  }
}

customElements.define('dev-tab-code', CodeTab);
