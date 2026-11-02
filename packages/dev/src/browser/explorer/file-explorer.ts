/**
 * `dev-file-explorer`: one folder of the explorer root as cards (folders, then `.mmd` files),
 * a breadcrumb, Up and "New diagram" (v12 `file-explorer.ts`). It emits `navigate` and
 * `open-file` (`detail.path`); the app owns the URL. `refresh` bumps re-list the folder.
 */
import { LitElement, html, nothing, type PropertyValues } from 'lit';
import { createFile, listFiles, parentDir, type Entry } from './api.ts';

const segments = (path: string): string[] => path.split('/').filter(Boolean);

export class DevFileExplorer extends LitElement {
  static override properties = {
    path: { type: String },
    refresh: { type: Number },
    loading: { state: true },
    error: { state: true },
    root: { state: true },
    entries: { state: true },
    creating: { state: true },
    newName: { state: true },
    createBusy: { state: true },
    createError: { state: true },
  };

  declare path: string;
  declare refresh: number;
  declare loading: boolean;
  declare error: string;
  declare root: string;
  declare entries: readonly Entry[];
  declare creating: boolean;
  declare newName: string;
  declare createBusy: boolean;
  declare createError: string;

  #seq = 0;

  constructor() {
    super();
    this.path = '';
    this.refresh = 0;
    this.loading = true;
    this.error = '';
    this.root = '';
    this.entries = [];
    this.creating = false;
    this.newName = '';
    this.createBusy = false;
    this.createError = '';
  }

  // Light DOM, so www/dev/styles.css applies.
  override createRenderRoot() {
    return this;
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('path') || changed.has('refresh')) void this.#load();
  }

  async #load(): Promise<void> {
    const seq = ++this.#seq;
    this.loading = true;
    try {
      const listing = await listFiles(this.path);
      if (seq !== this.#seq) return;
      this.root = listing.root;
      this.entries = listing.entries;
      this.error = '';
    } catch (e) {
      if (seq !== this.#seq) return;
      this.error = e instanceof Error ? e.message : String(e);
      this.entries = [];
    } finally {
      if (seq === this.#seq) this.loading = false;
    }
  }

  #emit(name: 'navigate' | 'open-file', path: string): void {
    this.dispatchEvent(new CustomEvent(name, { detail: { path }, bubbles: true, composed: true }));
  }

  async #submitCreate(): Promise<void> {
    const raw = this.newName.trim();
    if (!raw) {
      this.createError = 'Enter a file name.';
      return;
    }
    if (/[/\\]/.test(raw)) {
      this.createError = 'Name cannot contain slashes.';
      return;
    }
    const name = raw.toLowerCase().endsWith('.mmd') ? raw : `${raw}.mmd`;
    const path = this.path ? `${this.path}/${name}` : name;
    this.createBusy = true;
    this.createError = '';
    try {
      const created = await createFile(path);
      if ('exists' in created) {
        this.createError = 'A file with that name already exists.';
        return;
      }
      this.creating = false;
      this.#emit('open-file', created.path);
    } catch (e) {
      this.createError = e instanceof Error ? e.message : String(e);
    } finally {
      this.createBusy = false;
    }
  }

  override render() {
    const parts = segments(this.path);
    return html`
      <div class="header">
        <div style="min-width: 0;">
          <div class="title">Dev Explorer</div>
          <div class="subtle">root: <span class="path">${this.root}</span></div>
          <div style="margin-top: 6px;">
            <sl-breadcrumb>
              <sl-breadcrumb-item @click=${() => this.#emit('navigate', '')}
                >root</sl-breadcrumb-item
              >
              ${parts.map(
                (part, i) =>
                  html`<sl-breadcrumb-item
                    @click=${() => this.#emit('navigate', parts.slice(0, i + 1).join('/'))}
                    >${part}</sl-breadcrumb-item
                  >`
              )}
            </sl-breadcrumb>
          </div>
        </div>
        <div class="spacer"></div>
        <div class="subtle">
          ${this.loading
            ? 'loading…'
            : `${this.entries.length} ${this.entries.length === 1 ? 'item' : 'items'}`}
        </div>
        <sl-button
          size="small"
          ?disabled=${!this.path}
          @click=${() => this.#emit('navigate', parentDir(this.path))}
        >
          <sl-icon slot="prefix" name="arrow-left"></sl-icon>
          Up
        </sl-button>
        <sl-button
          size="small"
          variant="primary"
          @click=${() => {
            this.newName = '';
            this.createError = '';
            this.creating = true;
          }}
        >
          <sl-icon slot="prefix" name="file-earmark-plus"></sl-icon>
          New diagram
        </sl-button>
      </div>

      <div class="content">
        ${this.error
          ? html`<div class="empty">Error: <span class="path">${this.error}</span></div>`
          : nothing}
        ${!this.error && !this.loading && this.entries.length === 0
          ? html`<div class="empty">No folders or <span class="path">.mmd</span> files here.</div>`
          : nothing}
        <div class="list">
          ${this.entries.map(
            (e) => html`
              <button
                class="card ${e.kind === 'dir' ? 'card-folder' : 'card-file'}"
                type="button"
                data-kind=${e.kind}
                data-path=${e.path}
                @click=${() => this.#emit(e.kind === 'dir' ? 'navigate' : 'open-file', e.path)}
              >
                <div class="card-inner">
                  <sl-icon
                    class="card-icon"
                    name=${e.kind === 'dir' ? 'folder-fill' : 'file-earmark-code'}
                  ></sl-icon>
                  <div class="card-title">${e.name}</div>
                </div>
              </button>
            `
          )}
        </div>
      </div>

      <sl-dialog
        label="New diagram"
        ?open=${this.creating}
        @sl-request-close=${(ev: CustomEvent) => {
          if (this.createBusy) ev.preventDefault();
          else this.creating = false;
        }}
      >
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <sl-input
            autofocus
            label="File name"
            placeholder="my-diagram"
            .value=${this.newName}
            help-text=${`Created in ${this.path || 'the root'}. ".mmd" is added automatically.`}
            @sl-input=${(ev: Event) => {
              this.newName = (ev.target as HTMLInputElement).value;
              this.createError = '';
            }}
            @keydown=${(ev: KeyboardEvent) => {
              if (ev.key === 'Enter') {
                ev.preventDefault();
                void this.#submitCreate();
              }
            }}
          ></sl-input>
          ${this.createError
            ? html`<div class="empty" style="color: var(--sl-color-danger-600);">
                ${this.createError}
              </div>`
            : nothing}
        </div>
        <sl-button
          slot="footer"
          @click=${() => {
            if (!this.createBusy) this.creating = false;
          }}
          >Cancel</sl-button
        >
        <sl-button
          slot="footer"
          variant="primary"
          ?loading=${this.createBusy}
          @click=${() => void this.#submitCreate()}
          >Create</sl-button
        >
      </sl-dialog>
    `;
  }
}

customElements.define('dev-file-explorer', DevFileExplorer);
