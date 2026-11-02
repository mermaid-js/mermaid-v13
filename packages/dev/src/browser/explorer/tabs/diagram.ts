/**
 * The Diagram tab (`dev-tab-diagram`). Placeholder until #60 (split panel with the Messages
 * panel): it shows the shell's render of the current text on a theme-coloured canvas.
 */
import { css, html, type PropertyValues } from 'lit';
import { effectiveTheme, isDarkTheme } from '../settings.ts';
import { ViewerTabElement } from './context.ts';

export class DiagramTab extends ViewerTabElement {
  static override styles = css`
    :host {
      display: block;
      height: 100%;
      box-sizing: border-box;
      padding: 12px;
    }
    .canvas {
      height: 100%;
      box-sizing: border-box;
      padding: 12px;
      border-radius: 10px;
      background: #fff;
      overflow: auto;
    }
    .canvas.dark {
      background: #0b1020;
    }
    .canvas > svg {
      max-width: 100%;
      height: auto;
    }
  `;

  override render() {
    const ctx = this.ctx;
    const svg = ctx?.outcome?.ok ? ctx.outcome.result.svg : '';
    const dark = isDarkTheme(effectiveTheme(ctx?.settings.theme, ctx?.text ?? ''));
    return html`<div class="canvas ${dark ? 'dark' : ''}" .innerHTML=${svg}></div>`;
  }

  protected override updated(changed: PropertyValues<this>): void {
    const before = changed.get('ctx');
    const outcome = this.ctx?.outcome;
    if (outcome?.ok && outcome !== before?.outcome) {
      const canvas = this.renderRoot.querySelector('.canvas');
      if (canvas) outcome.result.bindFunctions?.(canvas);
    }
  }
}

customElements.define('dev-tab-diagram', DiagramTab);
