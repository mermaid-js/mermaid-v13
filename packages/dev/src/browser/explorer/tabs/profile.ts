/**
 * The Profile tab (`dev-tab-profile`). Placeholder until #62: stage timings over N runs, for the diagram or its folder.
 * See `./context.ts` for what the shell passes in.
 */
import { css, html } from 'lit';
import { ViewerTabElement } from './context.ts';

export class ProfileTab extends ViewerTabElement {
  static override styles = css`
    :host {
      display: block;
      padding: 18px 12px;
      color: var(--sl-color-neutral-600);
      font-size: 13px;
    }
  `;

  override render() {
    return html`<p>Profile view: not built yet (#62).</p>`;
  }
}

customElements.define('dev-tab-profile', ProfileTab);
