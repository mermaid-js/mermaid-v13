/**
 * The Profile tab (`dev-tab-profile`, v12 `diagram-viewer.ts:130-250, 995-1210, 1525-1830`).
 *
 * It renders the open diagram, or every `.mmd` in its folder, N times per layout through the
 * public API of the current dev build, with `@mermaid-js/core/timing` on (the server builds
 * `/mermaid.esm.mjs` with `__MERMAID_BENCH__` = true). Each render's stage times come from the
 * clock this tab installs; its total is the wall time of `render()`. A (diagram, layout) series
 * drops its fastest and slowest run (by total) and averages the rest. The stage table sums
 * those trimmed means over the diagrams; the score is the sum of the totals (lower is better).
 * The stages are the ones v13 records, in core's order; v12's columns are not imitated.
 *
 * Every timed run re-initializes first, so the API's parse cache never hits and parse is
 * timed every time. Runs use their own `createMermaid()` instance, so the shell's site config is untouched. A
 * new `/events` message (a rebuild) cancels a running profile; the results stay, labelled with
 * their build. Folder mode reads the folder's files through `ctx.siblings()` and `ctx.read()`;
 * the open file uses `ctx.text`, unsaved edits included.
 *
 * Its state is the storage keys `devExplorer.profile.scope|iterations|layouts`.
 */
import '@shoelace-style/shoelace/dist/components/checkbox/checkbox.js';
import { css, html, nothing, type PropertyValues, type TemplateResult } from 'lit';
import type { Stage, StageClock } from '../../mermaid.ts';
import { readStorage, renderConfig, writeStorage } from '../settings.ts';
import { ViewerTabElement, type DevMermaid } from './context.ts';

type Scope = 'diagram' | 'folder';

/** Core's stages, in pipeline order (`@mermaid-js/core/timing`'s `Stage`). */
const STAGE_ORDER: readonly Stage[] = ['parse', 'measure', 'layout', 'serialise'];

/** One render: the wall time and the time per stage it recorded. */
interface Sample {
  readonly total: number;
  readonly stages: Partial<Record<Stage, number>>;
}

interface SeriesStats {
  readonly total: number;
  readonly stages: Partial<Record<Stage, number>>;
  readonly samples: number;
}

interface DiagramResult {
  readonly diagram: string;
  readonly stats: SeriesStats | undefined;
  readonly failures: number;
  readonly error?: string;
}

interface LayoutResult {
  readonly layout: string;
  readonly perDiagram: readonly DiagramResult[];
  readonly score: number;
  readonly stageTotals: Partial<Record<Stage, number>>;
  readonly failures: number;
}

interface ProfileRun {
  readonly build: number;
  readonly scope: Scope;
  readonly iterations: number;
  readonly theme: string | undefined;
  readonly stages: readonly Stage[];
  readonly layouts: readonly LayoutResult[];
  readonly cancelled: boolean;
}

const KEY = {
  scope: 'devExplorer.profile.scope',
  iterations: 'devExplorer.profile.iterations',
  layouts: 'devExplorer.profile.layouts',
} as const;

const MAX_ITERATIONS = 50;
const clampIterations = (n: number): number =>
  Math.max(1, Math.min(MAX_ITERATIONS, Math.round(n) || 1));

const mean = (values: readonly number[]): number =>
  values.reduce((a, b) => a + b, 0) / values.length;

/** Drops the fastest and slowest run (by total) when there are 3 or more, then averages. */
function trimmedStats(samples: readonly Sample[]): SeriesStats | undefined {
  if (samples.length === 0) return undefined;
  const kept =
    samples.length >= 3 ? [...samples].sort((a, b) => a.total - b.total).slice(1, -1) : samples;
  const stages: Partial<Record<Stage, number>> = {};
  for (const stage of STAGE_ORDER) {
    const values = kept.map((s) => s.stages[stage]).filter((v): v is number => v !== undefined);
    if (values.length) stages[stage] = mean(values);
  }
  return { total: mean(kept.map((s) => s.total)), stages, samples: kept.length };
}

function summarise(layout: string, perDiagram: readonly DiagramResult[]): LayoutResult {
  const measured = perDiagram.flatMap((d) => (d.stats ? [d.stats] : []));
  const stageTotals: Partial<Record<Stage, number>> = {};
  for (const stage of STAGE_ORDER) {
    const values = measured.map((s) => s.stages[stage]).filter((v): v is number => v !== undefined);
    if (values.length) stageTotals[stage] = values.reduce((a, b) => a + b, 0);
  }
  return {
    layout,
    perDiagram,
    score: measured.reduce((sum, s) => sum + s.total, 0),
    stageTotals,
    failures: perDiagram.reduce((sum, d) => sum + d.failures, 0),
  };
}

const fmtMs = (n: number | undefined): string =>
  n === undefined || !Number.isFinite(n) ? '–' : n.toFixed(2);
const round3 = (n: number): number => Math.round(n * 1000) / 1000;
const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

/** The copy-as-JSON snapshot. Its numbers are the ones the tables show in `data-ms`. */
function resultsJson(run: ProfileRun): unknown {
  const roundStages = (m: Partial<Record<Stage, number>>) =>
    Object.fromEntries(Object.entries(m).map(([k, v]) => [k, round3(v)]));
  return {
    capturedAt: new Date().toISOString(),
    build: run.build,
    scope: run.scope,
    iterations: run.iterations,
    theme: run.theme ?? null,
    aggregation: 'mean of the runs left after dropping the fastest and slowest; one warmup render',
    unit: 'ms',
    cancelled: run.cancelled,
    stages: [...run.stages],
    layouts: run.layouts.map((r) => ({
      layout: r.layout,
      score: round3(r.score),
      stageTotals: roundStages(r.stageTotals),
      failures: r.failures,
      perDiagram: r.perDiagram.map((d) => ({
        diagram: d.diagram,
        total: d.stats ? round3(d.stats.total) : null,
        stages: d.stats ? roundStages(d.stats.stages) : null,
        samples: d.stats?.samples ?? 0,
        failures: d.failures,
        ...(d.error ? { error: d.error } : {}),
      })),
    })),
  };
}

/** A `data-ms` value: the same rounding as the JSON. */
function cellContent(row: DiagramResult | undefined) {
  if (row?.stats) return fmtMs(row.stats.total);
  if (row?.failures) return html`<span class="fail" title=${row.error ?? ''}>fail</span>`;
  return '–';
}

const dataMs = (n: number | undefined): string | typeof nothing =>
  n === undefined || !Number.isFinite(n) ? nothing : String(round3(n));

export class ProfileTab extends ViewerTabElement {
  static override properties = {
    ...ViewerTabElement.properties,
    scope: { state: true },
    iterations: { state: true },
    layouts: { state: true },
    available: { state: true },
    running: { state: true },
    progress: { state: true },
    error: { state: true },
    result: { state: true },
    copyMessage: { state: true },
  };

  static override styles = css`
    :host {
      display: block;
      padding: 12px;
      font-size: 13px;
      color: var(--sl-color-neutral-700);
    }
    .controls {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: 12px;
      margin-bottom: 12px;
    }
    .layouts {
      display: flex;
      gap: 10px;
      align-items: center;
      padding-bottom: 6px;
    }
    sl-select {
      width: 140px;
    }
    sl-input {
      width: 100px;
    }
    .subtle,
    .meta {
      color: var(--sl-color-neutral-500);
    }
    .meta {
      margin: 10px 0 4px;
    }
    .error,
    .fail {
      color: var(--sl-color-danger-600);
    }
    table {
      border-collapse: collapse;
    }
    th,
    td {
      padding: 3px 10px;
      border-bottom: 1px solid var(--sl-color-neutral-200);
      text-align: right;
    }
    th.name {
      text-align: left;
      font-weight: normal;
    }
    tr.score td,
    tr.score th {
      font-weight: bold;
      border-top: 2px solid var(--sl-color-neutral-300);
    }
    td.best {
      color: var(--sl-color-success-600);
    }
    .actions {
      display: flex;
      gap: 8px;
      align-items: center;
    }
  `;

  declare scope: Scope;
  declare iterations: number;
  /** The layouts to profile; the build's are in `available`. */
  declare layouts: readonly string[];
  declare available: readonly string[];
  declare running: boolean;
  declare progress: string;
  declare error: string;
  declare result: ProfileRun | undefined;
  declare copyMessage: string;

  #cancel = false;
  #copyTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    super();
    this.scope = readStorage(KEY.scope) === 'folder' ? 'folder' : 'diagram';
    this.iterations = clampIterations(Number(readStorage(KEY.iterations) ?? 10));
    this.layouts = (readStorage(KEY.layouts) ?? '').split(',').filter(Boolean);
    this.available = [];
    this.running = false;
    this.progress = '';
    this.error = '';
    this.result = undefined;
    this.copyMessage = '';
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#cancel = true;
    clearTimeout(this.#copyTimer);
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('active') && this.active && this.available.length === 0) {
      void this.#loadLayouts();
    }
    const before = changed.get('ctx');
    // A rebuild (or a file change) makes a running profile's numbers stale.
    if (this.running && before && this.ctx && before.event.seq !== this.ctx.event.seq) {
      this.#cancel = true;
    }
    if (!this.active && this.running) this.#cancel = true;
  }

  async #loadLayouts(): Promise<void> {
    if (!this.ctx) return;
    try {
      const { module } = await this.ctx.mermaid();
      this.available = module.devLayouts;
      const kept = this.layouts.filter((l) => module.devLayouts.includes(l));
      this.layouts = kept.length ? kept : [...module.devLayouts];
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    }
  }

  #setScope(value: string): void {
    this.scope = value === 'folder' ? 'folder' : 'diagram';
    writeStorage(KEY.scope, this.scope);
  }

  #setIterations(value: string): void {
    this.iterations = clampIterations(Number(value));
    writeStorage(KEY.iterations, String(this.iterations));
  }

  #toggleLayout(layout: string, checked: boolean): void {
    const next = new Set(this.layouts);
    if (checked) next.add(layout);
    else next.delete(layout);
    this.layouts = this.available.filter((l) => next.has(l));
    writeStorage(KEY.layouts, this.layouts.join(','));
  }

  /** The diagrams to time, read before any timing starts. */
  async #diagrams(): Promise<{ path: string; text: string }[]> {
    const ctx = this.ctx;
    if (!ctx?.file) return [];
    if (this.scope === 'diagram') return [{ path: ctx.file, text: ctx.text }];
    const diagrams: { path: string; text: string }[] = [];
    for (const path of await ctx.siblings()) {
      if (path === ctx.file) diagrams.push({ path, text: ctx.text });
      else diagrams.push({ path, text: await ctx.read(path) });
    }
    return diagrams;
  }

  async #instance(dev: DevMermaid): Promise<ReturnType<DevMermaid['module']['createMermaid']>> {
    const instance = dev.module.createMermaid();
    instance.registerLayoutLoaders(dev.module.devLayoutLoaders);
    await instance.registerExternalDiagrams([dev.module.interactions]);
    return instance;
  }

  async #run(): Promise<void> {
    const ctx = this.ctx;
    if (this.running || !ctx) return;
    this.running = true;
    this.#cancel = false;
    this.error = '';
    this.copyMessage = '';
    const iterations = this.iterations;
    const scope = this.scope;
    const settings = ctx.settings;
    const layouts = this.layouts.length ? this.layouts : [settings.layout ?? 'layered'];
    let dev: DevMermaid;
    try {
      dev = await ctx.mermaid();
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      this.running = false;
      return;
    }
    const { module } = dev;
    let current: Partial<Record<Stage, number>> = {};
    const clock: StageClock = {
      now: () => performance.now(),
      record: (stage, ms) => {
        current[stage] = (current[stage] ?? 0) + ms;
      },
    };
    try {
      if (!module.STAGE_TIMING) {
        throw new Error('Stage timing is off in this build; restart the dev server.');
      }
      this.progress = 'reading diagrams…';
      const diagrams = await this.#diagrams();
      if (diagrams.length === 0) throw new Error('No diagrams to profile.');
      const instance = await this.#instance(dev);
      const seen = new Set<Stage>();
      const results: LayoutResult[] = [];
      module.installStageClock(clock);
      let unit = 0;
      for (const layout of layouts) {
        const config = renderConfig({ ...settings, layout });
        instance.initialize(config);
        // Warmup, untimed: the first render pays for lazy loads and the JIT.
        this.progress = `${layout} · warming up…`;
        await instance.render('dev-profile-warmup', diagrams[0]!.text).catch(() => undefined);
        const perDiagram: DiagramResult[] = [];
        for (const diagram of diagrams) {
          if (this.#cancel) break;
          unit++;
          const samples: Sample[] = [];
          let failures = 0;
          let error: string | undefined;
          for (let i = 0; i < iterations && !this.#cancel; i++) {
            this.progress = `${layout} · ${baseName(diagram.path)} · ${i + 1}/${iterations} (${unit}/${layouts.length * diagrams.length})`;
            // Let the progress label paint before a long render.
            await this.updateComplete;
            // A fresh site snapshot per run: `render` caches the parse per (text, snapshot),
            // and every run should pay for its parse as a first render does.
            instance.initialize(config);
            current = {};
            const start = performance.now();
            try {
              await instance.render(`dev-profile-${unit}-${i}`, diagram.text);
              const total = performance.now() - start;
              for (const stage of Object.keys(current) as Stage[]) seen.add(stage);
              samples.push({ total, stages: current });
            } catch (e) {
              failures++;
              error = e instanceof Error ? e.message : String(e);
            }
          }
          perDiagram.push({
            diagram: diagram.path,
            stats: trimmedStats(samples),
            failures,
            ...(error ? { error } : {}),
          });
        }
        results.push(summarise(layout, perDiagram));
        if (this.#cancel) break;
      }
      this.result = {
        build: dev.build,
        scope,
        iterations,
        theme: settings.theme,
        stages: STAGE_ORDER.filter((s) => seen.has(s)),
        layouts: results,
        cancelled: this.#cancel,
      };
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      module.installStageClock(undefined);
      this.running = false;
      this.progress = '';
    }
  }

  async #copy(): Promise<void> {
    if (!this.result) return;
    const json = JSON.stringify(resultsJson(this.result), null, 2);
    try {
      await navigator.clipboard.writeText(json);
      this.copyMessage = 'Copied';
    } catch {
      this.copyMessage = 'Clipboard blocked';
    }
    clearTimeout(this.#copyTimer);
    this.#copyTimer = setTimeout(() => (this.copyMessage = ''), 2500);
  }

  override render(): TemplateResult {
    const ctx = this.ctx;
    return html`
      <div class="controls">
        <sl-select
          size="small"
          label="Scope"
          data-profile="scope"
          .value=${this.scope}
          ?disabled=${this.running}
          @sl-change=${(e: Event) => this.#setScope((e.target as HTMLInputElement).value)}
        >
          <sl-option value="diagram">This diagram</sl-option>
          <sl-option value="folder">Whole folder</sl-option>
        </sl-select>
        <sl-input
          size="small"
          type="number"
          min="1"
          max=${MAX_ITERATIONS}
          label="Runs"
          data-profile="iterations"
          .value=${String(this.iterations)}
          ?disabled=${this.running}
          @sl-change=${(e: Event) => this.#setIterations((e.target as HTMLInputElement).value)}
        ></sl-input>
        <div class="layouts">
          ${this.available.map(
            (layout) =>
              html`<sl-checkbox
                size="small"
                data-layout=${layout}
                ?checked=${this.layouts.includes(layout)}
                ?disabled=${this.running}
                @sl-change=${(e: Event) =>
                  this.#toggleLayout(layout, (e.target as HTMLInputElement).checked)}
                >${layout}</sl-checkbox
              >`
          )}
        </div>
        <sl-button
          size="small"
          variant="primary"
          data-profile="run"
          ?loading=${this.running}
          ?disabled=${this.running || !ctx?.file || this.layouts.length === 0}
          @click=${() => void this.#run()}
          >Run profile</sl-button
        >
        ${this.running
          ? html`<sl-button size="small" @click=${() => (this.#cancel = true)}>Cancel</sl-button>
              <span class="subtle">${this.progress}</span>`
          : nothing}
      </div>
      ${this.error ? html`<div class="error">Error: ${this.error}</div>` : nothing}
      ${this.result ? this.#renderResult(this.result) : this.#renderIdle()}
    `;
  }

  #renderIdle() {
    if (this.running || this.error) return nothing;
    return html`<p class="subtle">
      Each ${this.scope === 'folder' ? 'diagram in the folder' : 'run'} renders ${this.iterations}×
      per layout after one warmup; the fastest and slowest runs are dropped and the rest averaged.
    </p>`;
  }

  #renderResult(run: ProfileRun) {
    const scores = run.layouts.map((r) => r.score).filter((s) => s > 0);
    const best = scores.length > 1 ? Math.min(...scores) : undefined;
    const diagrams = run.layouts[0]?.perDiagram ?? [];
    const head = (first: string) =>
      html`<thead>
        <tr>
          <th class="name">${first}</th>
          ${run.layouts.map(
            (r) =>
              html`<th>
                ${r.layout}${r.failures
                  ? html`<span class="fail"> ⚠${r.failures}</span>`
                  : nothing}
              </th>`
          )}
        </tr>
      </thead>`;
    return html`
      <div class="actions">
        <sl-button
          size="small"
          data-profile="copy"
          ?disabled=${this.running}
          @click=${() => void this.#copy()}
          >Copy as JSON</sl-button
        >
        ${this.copyMessage
          ? html`<span class="subtle" data-profile="copied">${this.copyMessage}</span>`
          : nothing}
      </div>
      <div class="meta">
        ${run.scope === 'folder'
          ? `${diagrams.length} diagrams`
          : baseName(diagrams[0]?.diagram ?? '')}
        · ${run.iterations} runs, fastest and slowest dropped · build ${run.build}
        ${run.cancelled ? html`· <span class="fail">cancelled</span>` : nothing} · ms; score = total
        render time (lower is better)
      </div>
      <table class="stages">
        ${head('stage')}
        <tbody>
          ${run.stages.map(
            (stage) =>
              html`<tr data-stage=${stage}>
                <th class="name">${stage}</th>
                ${run.layouts.map(
                  (r) =>
                    html`<td data-layout=${r.layout} data-ms=${dataMs(r.stageTotals[stage])}>
                      ${fmtMs(r.stageTotals[stage])}
                    </td>`
                )}
              </tr>`
          )}
          <tr class="score">
            <th class="name">score</th>
            ${run.layouts.map(
              (r) =>
                html`<td
                  data-layout=${r.layout}
                  data-ms=${dataMs(r.score)}
                  class=${r.score === best ? 'best' : ''}
                >
                  ${fmtMs(r.score)}
                </td>`
            )}
          </tr>
        </tbody>
      </table>
      ${run.scope === 'folder'
        ? html`<div class="meta">per diagram, total (ms)</div>
            <table class="files">
              ${head('diagram')}
              <tbody>
                ${diagrams.map(
                  (d, i) =>
                    html`<tr data-file=${d.diagram}>
                      <th class="name" title=${d.diagram}>${baseName(d.diagram)}</th>
                      ${run.layouts.map((r) => {
                        const row = r.perDiagram[i];
                        return html`<td
                          data-layout=${r.layout}
                          data-ms=${dataMs(row?.stats?.total)}
                        >
                          ${cellContent(row)}
                        </td>`;
                      })}
                    </tr>`
                )}
              </tbody>
            </table>`
        : nothing}
    `;
  }
}

customElements.define('dev-tab-profile', ProfileTab);
