/**
 * The Dev Explorer page script (`/build/explorer.js`, loaded by `www/dev/index.html`; v12
 * `explorer-app.ts`). `dev-explorer-app` switches between the folder view and the viewer and
 * keeps `?path=<dir>&file=<file>` in the URL (pushState, so back/forward work; popstate
 * restores). It listens on `/events` and hands each message to the open view.
 */
import { LitElement, html, type TemplateResult } from 'lit';
import { setBasePath } from '@shoelace-style/shoelace/dist/utilities/base-path.js';
import '@shoelace-style/shoelace/dist/components/breadcrumb/breadcrumb.js';
import '@shoelace-style/shoelace/dist/components/breadcrumb-item/breadcrumb-item.js';
import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/button-group/button-group.js';
import '@shoelace-style/shoelace/dist/components/dialog/dialog.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/input/input.js';
import '@shoelace-style/shoelace/dist/components/option/option.js';
import '@shoelace-style/shoelace/dist/components/select/select.js';
import '@shoelace-style/shoelace/dist/components/tab/tab.js';
import '@shoelace-style/shoelace/dist/components/tab-group/tab-group.js';
import '@shoelace-style/shoelace/dist/components/tab-panel/tab-panel.js';
import { parentDir } from './api.ts';
import './file-explorer.ts';
import type { ServerEvent } from './viewer.ts';
import './viewer.ts';

function urlState(): { dir: string; file: string } {
  const params = new URL(window.location.href).searchParams;
  return { dir: params.get('path') ?? '', file: params.get('file') ?? '' };
}

/** Sets `path` and `file`, keeping every other param (the settings, the tab, …). */
function pushUrlState({ dir, file }: { dir: string; file: string }): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('path');
  url.searchParams.delete('file');
  if (dir) url.searchParams.set('path', dir);
  if (file) url.searchParams.set('file', file);
  if (url.href !== window.location.href) history.pushState(null, '', url);
}

export class DevExplorerApp extends LitElement {
  static override properties = {
    dir: { state: true },
    file: { state: true },
    event: { state: true },
  };

  declare dir: string;
  declare file: string;
  declare event: ServerEvent;

  #events?: EventSource;
  #retry?: ReturnType<typeof setTimeout>;

  constructor() {
    super();
    const { dir, file } = urlState();
    this.dir = dir;
    this.file = file;
    this.event = { seq: 0, time: 0, paths: [] };
    setBasePath('/dev/vendor/shoelace');
  }

  override createRenderRoot(): this {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.#connect();
    window.addEventListener('popstate', this.#onPopState);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#events?.close();
    clearTimeout(this.#retry);
    window.removeEventListener('popstate', this.#onPopState);
  }

  /** `/events`, reconnecting after a second; `<html data-dev-events="connected">` while open. */
  #connect(): void {
    const events = new EventSource('/events');
    this.#events = events;
    events.onopen = () => {
      document.documentElement.dataset.devEvents = 'connected';
    };
    events.onmessage = (e: MessageEvent<string>) => {
      const data = JSON.parse(e.data) as { time: number; paths?: string[] };
      this.event = { seq: this.event.seq + 1, time: data.time, paths: data.paths ?? [] };
    };
    events.onerror = () => {
      delete document.documentElement.dataset.devEvents;
      events.close();
      this.#retry = setTimeout(() => this.#connect(), 1000);
    };
  }

  readonly #onPopState = (): void => {
    const { dir, file } = urlState();
    this.dir = dir;
    this.file = file;
  };

  #goToDir(dir: string): void {
    this.dir = dir;
    this.file = '';
    pushUrlState({ dir, file: '' });
  }

  #openFile(file: string): void {
    this.dir = parentDir(file);
    this.file = file;
    pushUrlState({ dir: this.dir, file });
  }

  override render(): TemplateResult {
    return html`
      <div class="app">
        ${this.file
          ? html`<dev-diagram-viewer
              .filePath=${this.file}
              .event=${this.event}
              @open-file=${(e: CustomEvent<{ path: string }>) => this.#openFile(e.detail.path)}
              @back=${() => this.#goToDir(this.dir)}
            ></dev-diagram-viewer>`
          : html`<dev-file-explorer
              .path=${this.dir}
              .refresh=${this.event.seq}
              @navigate=${(e: CustomEvent<{ path: string }>) => this.#goToDir(e.detail.path)}
              @open-file=${(e: CustomEvent<{ path: string }>) => this.#openFile(e.detail.path)}
            ></dev-file-explorer>`}
      </div>
    `;
  }
}

customElements.define('dev-explorer-app', DevExplorerApp);
