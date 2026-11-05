/**
 * The Compare tab (`dev-tab-compare`, #61; v12 `compare-panel.ts`): the current text, unsaved
 * edits included, rendered with the same settings by the v13 dev build (left) and a published
 * mermaid from the CDN (right), each in its own iframe (`www/dev/compare-pane.html`, protocol
 * in `../../compare-pane.ts`), so the two never share globals.
 *
 * - The right version is `12` (the newest stable `mermaid@12`, the default), `latest` or an
 *   exact version; the list comes from `GET /dev/api/versions`. An exact version works offline.
 * - D (or the Diff button) toggles a pixelmatch overlay on the right pane (`../compare-diff.ts`).
 * - URL state: `version` (left out for the default) and `diff=1`.
 * - A dev rebuild (`ctx.build`) gives the left side a fresh iframe; a different version, the
 *   right. The iframes exist only while the tab is showing.
 * - Spec hooks: `.pane[data-side][data-status]` (`waiting | loading | rendering | rendered |
 *   error`) with `.title` and `.error`; `iframe[data-side]`; `sl-select[data-role="version"]`;
 *   `sl-button[data-action="diff"]`; `[data-testid="compare-diff-status"][data-changed-pixels]`.
 */
import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/option/option.js';
import '@shoelace-style/shoelace/dist/components/select/select.js';
import { css, html, nothing, type TemplateResult } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import type { PaneBundle, PaneMessage, ParentMessage } from '../../compare-pane.ts';
import { diffRenders, type DiffResult, type RenderedSvg } from '../compare-diff.ts';
import {
  V12_LINE,
  cdnBundleUrl,
  isPrerelease,
  parseCompareUrlState,
  npmRenderConfig,
  resolveVersion,
  serializeCompareUrlState,
  type VersionsResponse,
} from '../compare-model.ts';
import { asHostText } from '../../../host-text.ts';
import { effectiveTheme, isDarkTheme, renderConfig, setUrlParams } from '../settings.ts';
import { ViewerTabElement } from './context.ts';

type Side = 'left' | 'right';
const SIDES: readonly Side[] = ['left', 'right'];

type PaneStatus = 'waiting' | 'loading' | 'rendering' | 'rendered' | 'error';

interface Pane {
  /** The iframe's identity (`dev:<build>`, `npm:<version>`); '' = no iframe. */
  readonly key: string;
  readonly bundle: PaneBundle | undefined;
  readonly ready: boolean;
  readonly status: PaneStatus;
  readonly message: string;
  readonly result: RenderedSvg | undefined;
  /** The render key of `result`, and of the last render sent. */
  readonly resultKey: string;
  readonly sentKey: string;
  readonly requestId: number;
}

const newPane = (key = '', bundle?: PaneBundle): Pane => ({
  key,
  bundle,
  ready: false,
  status: key ? 'loading' : 'waiting',
  message: '',
  result: undefined,
  resultKey: '',
  sentKey: '',
  requestId: 0,
});

// Elements that own the D key (the shell's list for ←/→, plus inputs).
const OWNS_KEYS = /^(input|textarea|select|sl-.*)$/;

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export class CompareTab extends ViewerTabElement {
  static override properties = {
    ...ViewerTabElement.properties,
    choice: { state: true },
    diff: { state: true },
    versions: { state: true },
    versionsError: { state: true },
    panes: { state: true },
    diffResult: { state: true },
    diffError: { state: true },
  };

  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      box-sizing: border-box;
      padding: 8px 12px 12px;
      gap: 8px;
      font-size: 13px;
    }
    .toolbar {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
    }
    .toolbar sl-select {
      width: 220px;
    }
    .subtle {
      color: var(--sl-color-neutral-500);
    }
    .bad {
      color: var(--sl-color-danger-600);
    }
    .changed {
      color: var(--sl-color-warning-600);
    }
    .same {
      color: var(--sl-color-success-600);
    }
    .panes {
      flex: 1;
      min-height: 0;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .pane {
      display: flex;
      flex-direction: column;
      min-height: 0;
      border: 1px solid var(--sl-color-neutral-200);
      border-radius: 8px;
      overflow: hidden;
    }
    .header {
      display: flex;
      align-items: baseline;
      gap: 8px;
      padding: 6px 10px;
      background: var(--sl-color-neutral-50);
    }
    .title {
      font-weight: 600;
    }
    .error {
      padding: 6px 10px;
      color: var(--sl-color-danger-600);
      white-space: pre-wrap;
    }
    .empty {
      padding: 18px 12px;
      color: var(--sl-color-neutral-600);
    }
    iframe {
      flex: 1;
      width: 100%;
      border: 0;
      background: #fff;
    }
  `;

  declare choice: string;
  declare diff: boolean;
  declare versions: VersionsResponse | undefined;
  declare versionsError: string;
  declare panes: Readonly<Record<Side, Pane>>;
  declare diffResult: DiffResult | undefined;
  declare diffError: string;

  #versionsRequested = false;
  #nextRequestId = 1;
  #diffKey = '';
  #diffSeq = 0;

  constructor() {
    super();
    const state = parseCompareUrlState(new URL(window.location.href).searchParams);
    this.choice = state.version;
    this.diff = state.diff;
    this.versions = undefined;
    this.versionsError = '';
    this.panes = { left: newPane(), right: newPane() };
    this.diffResult = undefined;
    this.diffError = '';
  }

  override connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener('message', this.#onMessage);
    document.addEventListener('keydown', this.#onKey);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('message', this.#onMessage);
    document.removeEventListener('keydown', this.#onKey);
  }

  /** The right pane's exact version; `undefined` while an alias can't be resolved yet. */
  get #resolved(): string | undefined {
    return resolveVersion(this.choice, this.versions);
  }

  #bundle(side: Side): PaneBundle | undefined {
    if (!this.active || !this.ctx) return undefined;
    if (side === 'left') {
      return { kind: 'dev', url: `/mermaid.esm.mjs?build=${this.ctx.build}`, label: 'v13 dev' };
    }
    const version = this.#resolved;
    return version
      ? { kind: 'npm', url: cdnBundleUrl(version), label: `mermaid@${version}` }
      : undefined;
  }

  get #prefersDark(): boolean {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  #config(side: Side): Record<string, unknown> {
    const settings = this.ctx?.settings ?? {};
    return side === 'left'
      ? { ...renderConfig(settings) }
      : npmRenderConfig(settings, this.#prefersDark);
  }

  get #background(): string {
    const ctx = this.ctx;
    return isDarkTheme(effectiveTheme(ctx?.settings.theme, ctx?.text ?? ''))
      ? '#0b1020'
      : '#ffffff';
  }

  get #renderKey(): string {
    return JSON.stringify({ text: this.ctx?.text ?? '', settings: this.ctx?.settings ?? {} });
  }

  #setPane(side: Side, patch: Partial<Pane>): void {
    this.panes = { ...this.panes, [side]: { ...this.panes[side], ...patch } };
  }

  #iframe(side: Side): HTMLIFrameElement | null {
    return this.renderRoot.querySelector(`iframe[data-side="${side}"]`);
  }

  #post(side: Side, message: ParentMessage): void {
    // The pane's origin is opaque (sandboxed), so it can't be named: '*' to that one window.
    this.#iframe(side)?.contentWindow?.postMessage(message, '*');
  }

  #setState(patch: { version?: string; diff?: boolean }): void {
    if (patch.version !== undefined) this.choice = patch.version;
    if (patch.diff !== undefined) this.diff = patch.diff;
    setUrlParams(serializeCompareUrlState({ version: this.choice, diff: this.diff }));
  }

  async #loadVersions(): Promise<void> {
    try {
      const res = await fetch('/dev/api/versions');
      const body = (await res.json()) as VersionsResponse | { error?: string };
      if (!res.ok || !('mermaid' in body)) {
        throw new Error(('error' in body && body.error) || `HTTP ${res.status}`);
      }
      this.versions = body;
      this.versionsError = '';
    } catch (e) {
      this.versionsError = message(e);
    }
  }

  protected override willUpdate(): void {
    if (this.active && !this.#versionsRequested) {
      this.#versionsRequested = true;
      void this.#loadVersions();
    }
    // A new version, build or (in)activity is a fresh iframe, in this same update.
    for (const side of SIDES) {
      const bundle = this.#bundle(side);
      const key = bundle ? `${bundle.kind}:${bundle.url}` : '';
      if (key !== this.panes[side].key) {
        this.panes = { ...this.panes, [side]: newPane(key, bundle) };
      }
    }
  }

  protected override updated(): void {
    this.#sendRenders();
    void this.#updateDiff();
  }

  #sendRenders(): void {
    const key = this.#renderKey;
    for (const side of SIDES) {
      const pane = this.panes[side];
      if (!pane.ready || pane.sentKey === key || !this.ctx) continue;
      const requestId = this.#nextRequestId++;
      this.#setPane(side, { sentKey: key, requestId, status: 'rendering', message: '' });
      this.#post(side, {
        type: 'render',
        text: asHostText(this.ctx.text),
        config: this.#config(side),
        background: this.#background,
        requestId,
      });
    }
  }

  readonly #onMessage = (event: MessageEvent<PaneMessage | null>): void => {
    // Matched by window identity: a sandboxed pane's origin is 'null'.
    const side = SIDES.find((s) => this.#iframe(s)?.contentWindow === event.source);
    const m = event.data;
    if (!side || !m || typeof m !== 'object') return;
    const pane = this.panes[side];
    if (m.type === 'ready') {
      if (!pane.bundle) return;
      this.#post(side, { type: 'load', bundle: pane.bundle });
      this.#setPane(side, { ready: true, status: 'loading' });
    } else if (m.type === 'rendered') {
      if (m.requestId !== pane.requestId) return;
      this.#setPane(side, {
        status: 'rendered',
        message: '',
        result: { svg: m.svg, width: m.width, height: m.height },
        resultKey: pane.sentKey,
      });
    } else if (m.type === 'error') {
      if (m.requestId !== null && m.requestId !== pane.requestId) return;
      this.#setPane(side, {
        status: 'error',
        message: m.message,
        result: undefined,
        resultKey: '',
      });
    }
  };

  readonly #onKey = (e: KeyboardEvent): void => {
    if (!this.active || (e.key !== 'd' && e.key !== 'D')) return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.repeat || e.defaultPrevented) return;
    const owned = e
      .composedPath()
      .some(
        (n) =>
          n instanceof HTMLElement &&
          (OWNS_KEYS.test(n.tagName.toLowerCase()) ||
            n.isContentEditable ||
            n.classList.contains('cm-editor'))
      );
    if (owned) return;
    e.preventDefault();
    this.#setState({ diff: !this.diff });
  };

  async #updateDiff(): Promise<void> {
    const { left, right } = this.panes;
    const key = this.#renderKey;
    const ready =
      this.diff && left.result && right.result && left.resultKey === key && right.resultKey === key;
    if (!ready) {
      if (this.#diffKey) {
        this.#diffKey = '';
        this.#diffSeq++;
        this.#post('right', { type: 'overlay', dataUrl: null });
      }
      if (this.diffResult) this.diffResult = undefined;
      if (this.diffError) this.diffError = '';
      return;
    }
    const diffKey = `${left.key}|${right.key}|${key}`;
    if (diffKey === this.#diffKey) return;
    this.#diffKey = diffKey;
    const seq = ++this.#diffSeq;
    this.diffError = '';
    try {
      const result = await diffRenders(left.result, right.result, this.#background);
      if (seq !== this.#diffSeq) return;
      this.diffResult = result;
      this.#post('right', { type: 'overlay', dataUrl: result.dataUrl });
    } catch (e) {
      if (seq !== this.#diffSeq) return;
      this.diffResult = undefined;
      this.diffError = message(e);
      this.#post('right', { type: 'overlay', dataUrl: null });
    }
  }

  #renderSelect() {
    const all = this.versions?.mermaid.versions ?? [];
    // ESM bundles only: mermaid ≥ 10.
    const list = all.filter((v) => !isPrerelease(v) && Number(v.split('.')[0]) >= 10);
    if (!['latest', V12_LINE].includes(this.choice) && !list.includes(this.choice)) {
      list.unshift(this.choice);
    }
    const v12 = resolveVersion(V12_LINE, this.versions);
    const latest = resolveVersion('latest', this.versions);
    return html`<sl-select
      data-role="version"
      size="small"
      hoist
      .value=${this.choice}
      @sl-change=${(e: Event) => {
        const value = (e.target as HTMLSelectElement).value;
        if (value && value !== this.choice) this.#setState({ version: value });
      }}
    >
      <sl-option value=${V12_LINE}>v12 line${v12 ? ` (${v12})` : ''}</sl-option>
      <sl-option value="latest">latest${latest ? ` (${latest})` : ''}</sl-option>
      ${list.map((v) => html`<sl-option value=${v}>${v}</sl-option>`)}
    </sl-select>`;
  }

  #renderDiffStatus() {
    if (!this.diff) return html`<span class="subtle">Press D for the pixel diff.</span>`;
    if (this.diffError) {
      return html`<span class="bad" data-testid="compare-diff-status"
        >Diff unavailable: ${this.diffError}</span
      >`;
    }
    if (SIDES.some((s) => this.panes[s].status === 'error')) {
      return html`<span class="bad" data-testid="compare-diff-status"
        >The diff needs both sides rendered.</span
      >`;
    }
    const r = this.diffResult;
    if (!r) {
      return html`<span class="subtle" data-testid="compare-diff-status"
        >Waiting for both renders…</span
      >`;
    }
    return html`<span
      class=${r.changedPixels === 0 ? 'same' : 'changed'}
      data-testid="compare-diff-status"
      data-changed-pixels=${r.changedPixels}
      >${r.changedPixels.toLocaleString()} changed pixels
      (${r.width}×${r.height})${r.sizeNote ? ` · ${r.sizeNote}` : ''}</span
    >`;
  }

  #renderPane(side: Side) {
    const pane = this.panes[side];
    const title = side === 'left' ? 'v13 dev' : (pane.bundle?.label ?? '…');
    const size = pane.result ? ` · ${pane.result.width}×${pane.result.height}` : '';
    const offline =
      side === 'right' && !pane.bundle && this.versionsError
        ? `Version list unavailable (offline?): ${this.versionsError}. Pick an exact version (?version=12.2.0).`
        : 'Resolving the version…';
    return html`<div class="pane" data-side=${side} data-status=${pane.status}>
      <div class="header">
        <span class="title">${title}</span>
        <span class="subtle">${pane.status}${size}</span>
      </div>
      ${pane.status === 'error'
        ? html`<div class="error" role="alert">${pane.message}</div>`
        : nothing}
      ${pane.key
        ? keyed(
            pane.key,
            html`<iframe
              data-side=${side}
              title=${`${side} pane: ${title}`}
              sandbox="allow-scripts"
              src="/dev/compare-pane.html"
            ></iframe>`
          )
        : html`<div class="empty">${offline}</div>`}
    </div>`;
  }

  override render(): TemplateResult | typeof nothing {
    if (!this.active) return nothing;
    return html`
      <div class="toolbar">
        <span class="subtle">v13 dev against</span>
        ${this.#renderSelect()}
        <sl-button
          size="small"
          data-action="diff"
          variant=${this.diff ? 'primary' : 'default'}
          @click=${() => this.#setState({ diff: !this.diff })}
          >Diff</sl-button
        >
        ${this.#renderDiffStatus()}
        ${this.versions?.stale ? html`<span class="subtle">(cached version list)</span>` : nothing}
      </div>
      <div class="panes">${SIDES.map((side) => this.#renderPane(side))}</div>
    `;
  }
}

customElements.define('dev-tab-compare', CompareTab);
