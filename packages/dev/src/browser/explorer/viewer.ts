/**
 * `dev-diagram-viewer`, the shell around the tabs (v12 `diagram-viewer.ts`): Back, Prev/Next
 * with an n/N counter and ←/→, the theme and layout selectors, the error banner, the
 * "rendering…" indicator and the tab group. It owns the open file's text and renders it; the
 * tabs (`./tabs/*.ts`) get a `ViewerContext` (`./tabs/context.ts`) and act through it.
 *
 * Inputs: `filePath` (root-relative) and `event` (the last `/events` message, from the app).
 * It emits `open-file` (`detail.path`) and `back`.
 */
import { LitElement, html, nothing, type PropertyValues } from 'lit';
import { eventPathToFile, listFiles, parentDir, readFile, saveFile } from './api.ts';
import { loadMermaid, renderText, type RenderOutcome } from './render.ts';
import {
  UNSET,
  VIEWER_TABS,
  arrowAction,
  isViewerTab,
  loadSettings,
  readUrlParam,
  saveSettings,
  setUrlParams,
  type RenderSettings,
  type ViewerTab,
} from './settings.ts';
import type { ViewerContext } from './tabs/context.ts';
import './tabs/diagram.ts';
import './tabs/code.ts';
import './tabs/profile.ts';
import './tabs/compare.ts';

export interface ServerEvent {
  readonly seq: number;
  readonly time: number;
  readonly paths: readonly string[];
}

/** Changes to these reload the explorer page itself (its script and static files). */
const EXPLORER_CODE = ['packages/dev/src/browser/explorer/', 'packages/dev/www/dev/'];

const TAB_LABELS: Readonly<Record<ViewerTab, { label: string; icon: string }>> = {
  diagram: { label: 'Diagram', icon: 'diagram-3' },
  code: { label: 'Code', icon: 'file-earmark-code' },
  profile: { label: 'Profile', icon: 'speedometer2' },
  compare: { label: 'Compare', icon: 'layout-split' },
};

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export class DevDiagramViewer extends LitElement {
  static override properties = {
    filePath: { type: String },
    event: { attribute: false },
    themes: { state: true },
    layouts: { state: true },
    settings: { state: true },
    root: { state: true },
    source: { state: true },
    text: { state: true },
    outcome: { state: true },
    rendering: { state: true },
    loadError: { state: true },
    notice: { state: true },
    diskChanged: { state: true },
    siblings: { state: true },
    tab: { state: true },
    build: { state: true },
    reveal: { state: true },
  };

  declare filePath: string;
  declare event: ServerEvent;
  declare themes: readonly string[];
  declare layouts: readonly string[];
  declare settings: RenderSettings;
  declare root: string | undefined;
  declare source: string;
  declare text: string;
  declare outcome: RenderOutcome | undefined;
  declare rendering: boolean;
  declare loadError: string;
  declare notice: string;
  declare diskChanged: boolean;
  declare siblings: readonly string[];
  declare tab: ViewerTab;
  declare build: number;
  declare reveal: ViewerContext['reveal'];

  #renderSeq = 0;
  #loadSeq = 0;
  /** Resolves once the dev build has said which themes and layouts it offers. */
  #ready: Promise<void>;

  constructor() {
    super();
    this.filePath = '';
    this.event = { seq: 0, time: 0, paths: [] };
    this.themes = [];
    this.layouts = [];
    this.settings = {};
    this.root = undefined;
    this.source = '';
    this.text = '';
    this.outcome = undefined;
    this.rendering = false;
    this.loadError = '';
    this.notice = '';
    this.diskChanged = false;
    this.siblings = [];
    const tab = readUrlParam('tab');
    this.tab = isViewerTab(tab) ? tab : 'diagram';
    this.build = 0;
    this.reveal = undefined;
    this.#ready = loadMermaid(0).then(
      ({ module }) => {
        this.themes = module.devThemes;
        this.layouts = module.devLayouts;
        this.settings = loadSettings(this.themes, this.layouts);
      },
      (e: unknown) => {
        this.loadError = `Could not load /mermaid.esm.mjs: ${message(e)}`;
      }
    );
  }

  // Light DOM, so www/dev/styles.css applies. Tabs use their own shadow roots.
  override createRenderRoot() {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('keydown', this.#onKeyDown);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.#onKeyDown);
  }

  #onKeyDown = (e: KeyboardEvent): void => {
    const action = arrowAction(e);
    if (!action) return;
    e.preventDefault();
    this.#go(action === 'prev' ? -1 : 1);
  };

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('filePath')) {
      void this.#loadFile();
      void this.#loadSiblings();
    } else if (changed.has('event') && this.event.seq > 0) {
      void this.#onServerEvent(this.event);
    }
  }

  get #dirty(): boolean {
    return this.text !== this.source;
  }

  async #loadFile(): Promise<void> {
    const seq = ++this.#loadSeq;
    if (!this.filePath) return;
    try {
      const source = await readFile(this.filePath);
      if (seq !== this.#loadSeq) return;
      this.source = source;
      this.text = source;
      this.diskChanged = false;
      this.notice = '';
      this.loadError = '';
      await this.#render();
    } catch (e) {
      if (seq !== this.#loadSeq) return;
      this.loadError = message(e);
      this.outcome = undefined;
    }
  }

  async #loadSiblings(): Promise<void> {
    try {
      const listing = await listFiles(parentDir(this.filePath));
      this.root = listing.root;
      this.siblings = listing.entries.filter((e) => e.kind === 'file').map((e) => e.path);
    } catch {
      this.siblings = [];
    }
  }

  /** Renders `text` with `settings` into `outcome`; only the latest call lands. */
  async #render(): Promise<void> {
    const seq = ++this.#renderSeq;
    await this.#ready;
    this.rendering = true;
    const outcome = await renderText(this.text, this.settings, this.build);
    if (seq !== this.#renderSeq) return;
    this.outcome = outcome;
    this.rendering = false;
  }

  async #onServerEvent({ time, paths }: ServerEvent): Promise<void> {
    if (paths.some((p) => EXPLORER_CODE.some((prefix) => p.startsWith(prefix)))) {
      if (this.#dirty) this.notice = 'The explorer changed: save, then reload the page.';
      else location.reload();
      return;
    }
    const files = this.root === undefined ? [] : paths.map((p) => eventPathToFile(this.root!, p));
    const changedFiles = files.filter((f): f is string => f !== undefined);
    if (changedFiles.some((f) => parentDir(f) === parentDir(this.filePath))) {
      void this.#loadSiblings();
    }
    // Anything but a fixture is a source change: the dev build was rebuilt.
    const sources = paths.length === 0 || files.some((f) => f === undefined);
    if (sources) this.build = time;
    if (changedFiles.includes(this.filePath)) {
      if (this.#dirty) {
        this.diskChanged = true;
        this.notice = 'The file changed on disk; saving overwrites it, Revert discards your edits.';
        if (sources) await this.#render();
      } else {
        await this.#loadFile();
      }
    } else if (sources) {
      await this.#render();
    }
  }

  #setSettings(next: RenderSettings): void {
    this.settings = next;
    saveSettings(next);
    void this.#render();
  }

  #setTab(tab: ViewerTab): void {
    if (tab === this.tab) return;
    this.tab = tab;
    setUrlParams({ tab: tab === 'diagram' ? null : tab });
  }

  get #index(): number {
    return this.siblings.indexOf(this.filePath);
  }

  #confirmDiscard(): boolean {
    return !this.#dirty || window.confirm('Discard unsaved changes?');
  }

  #go(delta: number): void {
    const i = this.#index;
    const target = i === -1 ? undefined : this.siblings[i + delta];
    if (!target || !this.#confirmDiscard()) return;
    this.dispatchEvent(
      new CustomEvent('open-file', { detail: { path: target }, bubbles: true, composed: true })
    );
  }

  #back(): void {
    if (!this.#confirmDiscard()) return;
    this.dispatchEvent(new CustomEvent('back', { bubbles: true, composed: true }));
  }

  get #context(): ViewerContext {
    return {
      file: this.filePath,
      source: this.source,
      text: this.text,
      dirty: this.#dirty,
      diskChanged: this.diskChanged,
      settings: this.settings,
      outcome: this.outcome,
      rendering: this.rendering,
      build: this.build,
      event: this.event,
      reveal: this.reveal,
      render: async (text, settings = this.settings) => {
        await this.#ready;
        return renderText(text, settings, this.build);
      },
      mermaid: () => loadMermaid(this.build),
      siblings: async () =>
        (await listFiles(parentDir(this.filePath))).entries
          .filter((e) => e.kind === 'file')
          .map((e) => e.path),
      read: (path) => readFile(path),
      setText: (text) => {
        if (text === this.text) return;
        this.text = text;
        void this.#render();
      },
      save: async () => {
        const text = this.text;
        try {
          await saveFile(this.filePath, text);
          this.source = text;
          this.diskChanged = false;
          this.notice = '';
          return true;
        } catch (e) {
          this.loadError = `Save failed: ${message(e)}`;
          return false;
        }
      },
      revert: () => this.#loadFile(),
      goto: (tab, at) => {
        this.#setTab(tab);
        if (at) {
          this.reveal = {
            seq: (this.reveal?.seq ?? 0) + 1,
            line: at.line,
            column: at.column ?? 1,
          };
        }
      },
    };
  }

  #select(name: 'theme' | 'layout', options: readonly string[]) {
    return html`
      <div class="control">
        <span class="label">${name === 'theme' ? 'Theme' : 'Layout'}</span>
        <sl-select
          size="small"
          data-setting=${name}
          value=${this.settings[name] ?? UNSET}
          @sl-change=${(e: Event) => {
            const value = (e.target as HTMLSelectElement).value;
            if (value !== UNSET && !options.includes(value)) return;
            this.#setSettings({ ...this.settings, [name]: value === UNSET ? undefined : value });
          }}
        >
          <sl-option value=${UNSET}>— not set —</sl-option>
          ${options.map((o) => html`<sl-option value=${o}>${o}</sl-option>`)}
        </sl-select>
      </div>
    `;
  }

  #banner() {
    if (this.loadError) {
      return html`<div class="banner error" role="alert">${this.loadError}</div>`;
    }
    const outcome = this.outcome;
    if (outcome && !outcome.ok) {
      const at = outcome.mermaidError;
      return html`<div class="banner error" role="alert">
        ${at
          ? html`<span class="code">${at.code} ${at.line}:${at.column}</span>`
          : html`<span class="code">error</span>`}${outcome.error.message}
      </div>`;
    }
    return nothing;
  }

  override render() {
    const i = this.#index;
    const ctx = this.#context;
    return html`
      <div class="header">
        <sl-button size="small" @click=${() => this.#back()}>
          <sl-icon slot="prefix" name="arrow-left"></sl-icon>
          Back
        </sl-button>
        <sl-button-group label="Diagram navigation">
          <sl-button
            size="small"
            data-nav="prev"
            ?disabled=${i <= 0}
            title="Previous diagram in folder (←)"
            @click=${() => this.#go(-1)}
          >
            <sl-icon slot="prefix" name="chevron-left"></sl-icon>
            Prev
          </sl-button>
          <sl-button
            size="small"
            data-nav="next"
            ?disabled=${i === -1 || i >= this.siblings.length - 1}
            title="Next diagram in folder (→)"
            @click=${() => this.#go(1)}
          >
            Next
            <sl-icon slot="suffix" name="chevron-right"></sl-icon>
          </sl-button>
        </sl-button-group>
        <div style="min-width: 0;">
          <div class="title">
            Diagram
            ${i >= 0
              ? html`<span class="subtle counter">(${i + 1}/${this.siblings.length})</span>`
              : nothing}
          </div>
          <div class="path current-file">${this.filePath}</div>
        </div>
        <div class="spacer"></div>
        <div class="viewer-controls">
          ${this.#select('theme', this.themes)} ${this.#select('layout', this.layouts)}
        </div>
        ${this.rendering ? html`<div class="subtle rendering">rendering…</div>` : nothing}
      </div>
      ${this.#banner()}
      ${this.notice
        ? html`<div class="banner notice">
            ${this.notice}
            ${this.diskChanged
              ? html`<sl-button size="small" @click=${() => void ctx.revert()}>Revert</sl-button>`
              : nothing}
          </div>`
        : nothing}
      <div class="content">
        <sl-tab-group
          class="viewer-tabs"
          @sl-tab-show=${(e: CustomEvent<{ name: string }>) => {
            if (isViewerTab(e.detail.name)) this.#setTab(e.detail.name);
          }}
        >
          ${VIEWER_TABS.map(
            (tab) => html`
              <sl-tab slot="nav" panel=${tab} ?active=${this.tab === tab}>
                <sl-icon name=${TAB_LABELS[tab].icon}></sl-icon>
                ${TAB_LABELS[tab].label}
              </sl-tab>
            `
          )}
          <sl-tab-panel name="diagram" ?active=${this.tab === 'diagram'}>
            <dev-tab-diagram .ctx=${ctx} .active=${this.tab === 'diagram'}></dev-tab-diagram>
          </sl-tab-panel>
          <sl-tab-panel name="code" ?active=${this.tab === 'code'}>
            <dev-tab-code .ctx=${ctx} .active=${this.tab === 'code'}></dev-tab-code>
          </sl-tab-panel>
          <sl-tab-panel name="profile" ?active=${this.tab === 'profile'}>
            <dev-tab-profile .ctx=${ctx} .active=${this.tab === 'profile'}></dev-tab-profile>
          </sl-tab-panel>
          <sl-tab-panel name="compare" ?active=${this.tab === 'compare'}>
            <dev-tab-compare .ctx=${ctx} .active=${this.tab === 'compare'}></dev-tab-compare>
          </sl-tab-panel>
        </sl-tab-group>
      </div>
    `;
  }
}

customElements.define('dev-diagram-viewer', DevDiagramViewer);
