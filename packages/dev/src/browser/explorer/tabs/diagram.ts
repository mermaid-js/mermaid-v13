/**
 * The Diagram tab (`dev-tab-diagram`, v12 `diagram-viewer.ts:1433-1452`): the shell's render
 * of the current text and a Messages panel, side by side in an `sl-split-panel`. The split
 * position is kept in localStorage (`devExplorer.viewer.splitPosition`, v12's key, default 75).
 *
 * - The canvas (`.canvas > svg`) shows `ctx.outcome.result.svg` and runs `bindFunctions` on it.
 * - Messages lists the render's warnings (`RenderResult.warnings`) or, when it failed, the
 *   `MermaidError`'s diagnostics with code, message and line:column. Each entry is a
 *   `[data-message]` with `data-severity` and `data-code`; clicking one that has a position
 *   calls `ctx.goto('code', { line, column })`.
 * - Below that, `dev-console-panel` (`./console-panel.ts`) captures `console.*`.
 */
import '@shoelace-style/shoelace/dist/components/split-panel/split-panel.js';
import { css, html, nothing, type PropertyValues } from 'lit';
import { effectiveTheme, isDarkTheme, readStorage, writeStorage } from '../settings.ts';
import './console-panel.ts';
import { ViewerTabElement, type RenderOutcome } from './context.ts';

const SPLIT_KEY = 'devExplorer.viewer.splitPosition';
const DEFAULT_SPLIT = 75;

/** One entry of the Messages list. `line`/`column` are 1-based. */
export interface Message {
  readonly severity: 'error' | 'warning' | 'info';
  readonly code: string;
  readonly message: string;
  readonly line?: number;
  readonly column?: number;
  /** Extra context, e.g. a config warning's key path and source. */
  readonly detail?: string;
}

/** The 1-based line and column of a UTF-16 `offset` into `text`. */
function position(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, Math.max(0, offset));
  const line = before.split('\n').length;
  return { line, column: before.length - before.lastIndexOf('\n') };
}

/** The Messages entries for one render outcome of `text`. */
export function messagesOf(outcome: RenderOutcome | undefined, text: string): Message[] {
  if (!outcome) return [];
  if (outcome.ok) {
    return outcome.warnings.map((w) => ({
      severity: 'warning',
      code: w.code,
      message: w.message,
      ...(w.path || w.source
        ? { detail: [w.path, w.source && `(${w.source})`].filter(Boolean).join(' ') }
        : {}),
    }));
  }
  const err = outcome.mermaidError;
  if (!err) return [{ severity: 'error', code: 'ERROR', message: outcome.error.message }];
  if (err.diagnostics.length === 0) {
    return [
      {
        severity: 'error',
        code: err.code,
        message: err.message,
        ...(err.offset || err.length ? { line: err.line, column: err.column } : {}),
      },
    ];
  }
  return err.diagnostics.map((d) => ({
    severity: d.severity,
    code: d.code,
    message: d.message,
    ...position(text, d.range.start),
  }));
}

function readSplit(): number {
  const stored = Number(readStorage(SPLIT_KEY));
  return stored > 0 && stored < 100 ? stored : DEFAULT_SPLIT;
}

export class DiagramTab extends ViewerTabElement {
  static override styles = css`
    :host {
      display: block;
      height: 100%;
      box-sizing: border-box;
      padding: 12px;
    }
    sl-split-panel {
      height: 100%;
      --min: 120px;
      --max: calc(100% - 160px);
    }
    sl-split-panel::part(start),
    sl-split-panel::part(end) {
      min-height: 0;
      overflow: hidden;
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
    .side {
      display: flex;
      flex-direction: column;
      height: 100%;
      box-sizing: border-box;
      padding-left: 10px;
      gap: 6px;
    }
    h3 {
      margin: 0;
      font-size: var(--sl-font-size-small);
      font-weight: var(--sl-font-weight-semibold);
      color: var(--sl-color-neutral-600);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .messages {
      flex: 0 1 auto;
      max-height: 45%;
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .message {
      all: unset;
      display: grid;
      grid-template-columns: auto auto 1fr;
      gap: 2px 8px;
      align-items: baseline;
      padding: 6px 8px;
      border-radius: 6px;
      border-left: 3px solid var(--sl-color-neutral-400);
      background: var(--sl-color-neutral-50);
      font-size: var(--sl-font-size-small);
      white-space: pre-wrap;
      word-break: break-word;
    }
    .message[data-severity='error'] {
      border-left-color: var(--sl-color-danger-500);
    }
    .message[data-severity='warning'] {
      border-left-color: var(--sl-color-warning-500);
    }
    button.message {
      cursor: pointer;
    }
    button.message:hover,
    button.message:focus-visible {
      background: var(--sl-color-neutral-100);
    }
    .code {
      font-family: var(--sl-font-mono);
      font-weight: var(--sl-font-weight-semibold);
    }
    .at {
      font-family: var(--sl-font-mono);
      color: var(--sl-color-neutral-500);
    }
    .text {
      grid-column: 1 / -1;
    }
    .empty {
      color: var(--sl-color-neutral-500);
      font-size: var(--sl-font-size-small);
    }
    dev-console-panel {
      flex: 1;
      min-height: 0;
    }
  `;

  #split = readSplit();

  #renderMessage(m: Message) {
    const at = m.line === undefined ? nothing : html`<span class="at">${m.line}:${m.column}</span>`;
    const body = html`<span class="code">${m.code}</span>${at}<span class="detail"
        >${m.detail ?? ''}</span
      ><span class="text">${m.message}</span>`;
    if (m.line === undefined) {
      return html`<div class="message" data-message data-severity=${m.severity} data-code=${m.code}>
        ${body}
      </div>`;
    }
    const at1 = { line: m.line, column: m.column ?? 1 };
    return html`<button
      class="message"
      data-message
      data-severity=${m.severity}
      data-code=${m.code}
      title="Open in Code at ${at1.line}:${at1.column}"
      @click=${() => this.ctx?.goto('code', at1)}
    >
      ${body}
    </button>`;
  }

  override render() {
    const ctx = this.ctx;
    const svg = ctx?.outcome?.ok ? ctx.outcome.result.svg : '';
    const dark = isDarkTheme(effectiveTheme(ctx?.settings.theme, ctx?.text ?? ''));
    const messages = messagesOf(ctx?.outcome, ctx?.text ?? '');
    return html`<sl-split-panel
      position=${this.#split}
      @sl-reposition=${(e: Event) => {
        const pos = (e.target as HTMLElement & { position: number }).position;
        if (pos === this.#split) return;
        this.#split = pos;
        writeStorage(SPLIT_KEY, String(Math.round(pos * 10) / 10));
      }}
    >
      <div slot="start" class="canvas ${dark ? 'dark' : ''}" .innerHTML=${svg}></div>
      <div slot="end" class="side">
        <h3>Messages</h3>
        <div class="messages" data-messages>
          ${messages.length === 0
            ? html`<div class="empty" data-messages-empty>
                ${ctx?.outcome ? 'No warnings or diagnostics.' : 'Not rendered yet.'}
              </div>`
            : messages.map((m) => this.#renderMessage(m))}
        </div>
        <h3>Console</h3>
        <dev-console-panel></dev-console-panel>
      </div>
    </sl-split-panel>`;
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
