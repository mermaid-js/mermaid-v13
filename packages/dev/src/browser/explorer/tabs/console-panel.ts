/**
 * The console capture in the Diagram tab's Messages panel (v12 `console-panel.ts` and
 * `diagram-viewer.ts:763-820`), for temporary debug logging while developing.
 *
 * `installConsoleCapture()` wraps `console.log|info|debug|warn|error` once per page: each call
 * still reaches the real console and is also kept here (newest `MAX_LOGS`). `%c` markers and
 * their css arguments are dropped. `dev-console-panel` shows the entries with level toggles
 * (debug = lines with mermaid's `: DEBUG :` marker), a text filter, copy and clear.
 *
 * No Shoelace control here draws an icon (native checkboxes, no `clearable`, no button
 * icons): the e2e specs locate the diagram as `dev-tab-diagram svg`, which pierces shadow
 * roots, so this panel must contain no `svg`.
 */
import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/input/input.js';
import { css, html, LitElement } from 'lit';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  readonly ts: number;
  readonly level: LogLevel;
  readonly message: string;
}

type DisplayLevel = 'debug' | LogLevel;

/** Hard cap on kept entries: a chatty render can log thousands of lines. */
export const MAX_LOGS = 5000;

const pad2 = (n: number): string => String(n).padStart(2, '0');

// Hand-formatted: `toLocaleTimeString` is ~100x slower and the panel formats every line.
function formatTs(ts: number): string {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${String(
    d.getMilliseconds()
  ).padStart(3, '0')}`;
}

/** One line of text from console arguments, without `%c` styling. */
export function stringifyArgs(args: readonly unknown[]): string {
  const normalized = [...args];
  if (typeof normalized[0] === 'string') {
    const cssCount = (normalized[0].match(/%c/g) ?? []).length;
    if (cssCount > 0) {
      normalized[0] = normalized[0].replaceAll('%c', '');
      normalized.splice(1, cssCount);
    }
  }
  return normalized
    .map((a) => {
      if (typeof a === 'string') return a;
      if (a instanceof Error) return a.stack ?? a.message;
      try {
        return JSON.stringify(a) ?? String(a);
      } catch {
        return String(a);
      }
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const displayLevel = (entry: LogEntry): DisplayLevel =>
  entry.message.includes(': DEBUG :') ? 'debug' : entry.level;

const SHOW_KEY = {
  debug: 'showDebug',
  info: 'showInfo',
  warn: 'showWarn',
  error: 'showError',
} as const;

const VARIANT: Record<DisplayLevel, string> = {
  error: 'danger',
  warn: 'warning',
  debug: 'success',
  info: 'neutral',
};

// The page-wide capture: entries are batched into one update per animation frame.
let entries: readonly LogEntry[] = [];
let pending: LogEntry[] = [];
let frame = 0;
const listeners = new Set<() => void>();

function flush(): void {
  frame = 0;
  if (pending.length === 0) return;
  const merged = [...entries, ...pending];
  pending = [];
  entries = merged.length > MAX_LOGS ? merged.slice(merged.length - MAX_LOGS) : merged;
  for (const listener of listeners) listener();
}

function append(entry: LogEntry): void {
  pending.push(entry);
  if (!frame) frame = requestAnimationFrame(flush);
}

function clearLogs(): void {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  pending = [];
  entries = [];
  for (const listener of listeners) listener();
}

const METHODS = [
  ['log', 'info'],
  ['info', 'info'],
  ['debug', 'info'],
  ['warn', 'warn'],
  ['error', 'error'],
] as const;

let installed = false;

/** Wraps the console methods once per page; later calls do nothing. */
export function installConsoleCapture(): void {
  if (installed) return;
  installed = true;
  const target = globalThis.console;
  for (const [method, level] of METHODS) {
    const original = target[method].bind(target);
    target[method] = (...args: unknown[]): void => {
      try {
        append({ ts: Date.now(), level, message: stringifyArgs(args) });
      } finally {
        original(...args);
      }
    };
  }
}

export class DevConsolePanel extends LitElement {
  static override properties = {
    logs: { state: true },
    showDebug: { state: true },
    showInfo: { state: true },
    showWarn: { state: true },
    showError: { state: true },
    filterText: { state: true },
  };

  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      min-height: 0;
      height: 100%;
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 10px;
      padding: 6px 0;
    }
    .toolbar sl-input {
      flex: 1 1 120px;
      min-width: 100px;
    }
    .toggle {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: var(--sl-font-size-small);
      cursor: pointer;
    }
    .toggle input {
      margin: 0;
      accent-color: var(--sl-color-primary-600);
    }
    .body {
      flex: 1;
      min-height: 0;
      overflow: auto;
      font-family: var(--sl-font-mono);
      font-size: 12px;
    }
    .logline {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 8px;
      padding: 3px 0;
      border-bottom: 1px solid var(--sl-color-neutral-200);
      white-space: pre-wrap;
      word-break: break-word;
    }
    .meta {
      display: flex;
      align-items: baseline;
      gap: 6px;
      color: var(--sl-color-neutral-500);
    }
    .empty {
      color: var(--sl-color-neutral-500);
      padding: 6px 0;
    }
  `;

  declare logs: readonly LogEntry[];
  declare showDebug: boolean;
  declare showInfo: boolean;
  declare showWarn: boolean;
  declare showError: boolean;
  declare filterText: string;

  readonly #onLogs = (): void => {
    this.logs = entries;
  };

  constructor() {
    super();
    this.logs = entries;
    this.showDebug = true;
    this.showInfo = true;
    this.showWarn = true;
    this.showError = true;
    this.filterText = '';
  }

  override connectedCallback(): void {
    super.connectedCallback();
    installConsoleCapture();
    listeners.add(this.#onLogs);
    this.logs = entries;
  }

  override disconnectedCallback(): void {
    listeners.delete(this.#onLogs);
    super.disconnectedCallback();
  }

  /** The entries the toggles and the filter let through. */
  visibleLogs(): readonly LogEntry[] {
    const q = this.filterText.trim().toLowerCase();
    const shown: Record<DisplayLevel, boolean> = {
      debug: this.showDebug,
      info: this.showInfo,
      warn: this.showWarn,
      error: this.showError,
    };
    return this.logs.filter(
      (l) => shown[displayLevel(l)] && (!q || l.message.toLowerCase().includes(q))
    );
  }

  async #copy(): Promise<void> {
    const text = this.visibleLogs()
      .map((l) => `[${formatTs(l.ts)}] ${displayLevel(l).toUpperCase()} ${l.message}`)
      .join('\n');
    if (text) await navigator.clipboard?.writeText(text).catch(() => undefined);
  }

  #toggle(level: DisplayLevel, label: string, checked: boolean) {
    const key = SHOW_KEY[level];
    return html`<label class="toggle"
      ><input
        type="checkbox"
        data-toggle=${level}
        .checked=${checked}
        @change=${(e: Event) => {
          this[key] = (e.target as HTMLInputElement).checked;
        }}
      />${label}</label
    >`;
  }

  override render() {
    const visible = this.visibleLogs();
    return html`
      <div class="toolbar">
        <sl-input
          size="small"
          placeholder="filter…"
          data-filter
          .value=${this.filterText}
          @sl-input=${(e: Event) => {
            this.filterText = (e.target as HTMLInputElement).value ?? '';
          }}
        ></sl-input>
        ${this.#toggle('debug', 'debug', this.showDebug)}
        ${this.#toggle('info', 'info', this.showInfo)}
        ${this.#toggle('warn', 'warn', this.showWarn)}
        ${this.#toggle('error', 'error', this.showError)}
        <sl-button size="small" data-action="copy" @click=${() => void this.#copy()}>
          Copy
        </sl-button>
        <sl-button size="small" data-action="clear" @click=${clearLogs}> Clear </sl-button>
      </div>
      <div class="body">
        ${visible.length === 0
          ? html`<div class="empty">No logs yet.</div>`
          : visible.map((l) => {
              const level = displayLevel(l);
              return html`<div class="logline" data-level=${level}>
                <span class="meta">
                  <sl-badge variant=${VARIANT[level]}>${level}</sl-badge>
                  <span>${formatTs(l.ts)}</span>
                </span>
                <span class="message">${l.message}</span>
              </div>`;
            })}
      </div>
    `;
  }
}

customElements.define('dev-console-panel', DevConsolePanel);
