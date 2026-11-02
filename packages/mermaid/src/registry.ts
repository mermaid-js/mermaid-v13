/**
 * The diagram and layout registry (DESIGN §12, R-PLUG-6, R-LAYOUT-2). One instance per
 * `mermaid` API object; nothing here is module-level state.
 */
import { MermaidError, type DiagramPlugin } from '@mermaid-js/core';
import { layered, type LayoutEngine } from '@mermaid-js/core/layout';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import { FIRST_PARTY } from './generated/registry.gen.ts';

// The registry holds plugins of every model and layout type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyPlugin = DiagramPlugin<any, any>;

/** A row of the generated first-party table. Rows without `load` have no v13 package yet. */
export interface FirstPartyEntry {
  /** The v12 diagram type (`flowchart-v2`), as `detectType` reports it. */
  readonly type: string;
  /** v12's detector, run on the text from the diagram's first line. */
  readonly pattern: RegExp;
  /** The plugin id (`flowchart`). */
  readonly id?: string;
  readonly formats?: readonly string[];
  readonly load?: () => Promise<AnyPlugin>;
}

/** A third-party diagram: a plugin, or a lazy definition loaded on first use. */
export type ExternalDiagram =
  | AnyPlugin
  | {
      readonly id: string;
      /** Whole source in. */
      detector(text: string): boolean;
      loader(): Promise<AnyPlugin | { diagram: AnyPlugin }>;
      readonly formats?: readonly string[];
    };

/** `registerLayoutLoaders` input (R-LAYOUT-2): an engine `(graph, ctx?) → LayoutModel`. */
export interface LayoutLoader {
  readonly name: string;
  loader(): Promise<LayoutEngine | { layout: LayoutEngine } | { default: LayoutEngine }>;
}

interface Entry {
  readonly type: string;
  readonly id: string | undefined;
  readonly formats: readonly string[];
  readonly detect: (text: string, body: string) => boolean;
  readonly load?: () => Promise<AnyPlugin>;
}

export interface Detected {
  /** v12 diagram type. */
  readonly type: string;
  /** Plugin id; undefined when the type has no v13 package (R-COMPAT-7). */
  readonly id: string | undefined;
}

/**
 * Names the built-in engine answers to until an ELK plugin is registered (DESIGN §6.1): v12's
 * `dagre`, `elk` and the `elk.<algorithm>` names of v12's ELK package.
 */
const builtIn = (name: string): boolean =>
  name === 'layered' || name === 'dagre' || name === 'elk' || name.startsWith('elk.');

/** Offset of the diagram's first line: after front matter, directives, comments and blanks. */
export function diagramStart(src: string, pre: PreprocessResult): number {
  let i = pre.bodyStart;
  let d = 0;
  while (i < src.length) {
    const dir = pre.directives[d];
    if (dir && dir.range.start <= i) {
      if (dir.range.end > i) i = dir.range.end;
      d++;
      continue;
    }
    const c = src.charCodeAt(i);
    if (c === 32 || c === 9 || c === 10 || c === 13 || c === 12 || c === 11) i++;
    else if (src.startsWith('%%', i) && src[i + 2] !== '{') {
      while (i < src.length && src[i] !== '\n') i++;
    } else break;
  }
  return i;
}

const unwrap = <T>(m: T | { diagram: T } | { layout: T } | { default: T }): T =>
  (typeof m === 'object' && m !== null && ('diagram' in m || 'layout' in m || 'default' in m)
    ? ((m as { diagram?: T }).diagram ??
      (m as { layout?: T }).layout ??
      (m as { default: T }).default)
    : m) as T;

export class Registry {
  private readonly entries: Entry[] = [];
  private readonly external: Entry[] = [];
  private readonly plugins = new Map<string, AnyPlugin>();
  private readonly loading = new Map<string, Promise<AnyPlugin>>();
  private readonly layoutLoaders = new Map<string, LayoutLoader['loader']>();
  private readonly layouts = new Map<string, LayoutEngine>([['layered', layered]]);

  constructor(firstParty: readonly FirstPartyEntry[] = FIRST_PARTY) {
    for (const e of firstParty) {
      this.entries.push({
        type: e.type,
        id: e.id,
        formats: e.formats ?? [],
        detect: (_text, body) => e.pattern.test(body),
        load: e.load,
      });
    }
  }

  /** The diagram type of `src`, or throws `MermaidError` (v12 order; first match wins). */
  detect(src: string, pre: PreprocessResult): Detected {
    const start = diagramStart(src, pre);
    const body = src.slice(start);
    if (body.trimStart().toLowerCase().startsWith('---')) {
      throw new MermaidError(
        'SYNTAX',
        'Diagrams beginning with --- are not valid. If you were trying to use a YAML front-matter, ' +
          "please ensure that you've correctly opened and closed the YAML front-matter with un-indented `---` blocks",
        { source: src, offset: start, length: 3 }
      );
    }
    if (body.trim().toLowerCase() === 'error') return { type: 'error', id: undefined };
    for (const e of [...this.entries, ...this.external]) {
      if (e.detect(src, body)) return { type: e.type, id: e.id };
    }
    throw new MermaidError(
      'UNSUPPORTED_DIAGRAM',
      `No diagram type detected matching given configuration for text: ${body.slice(0, 200)}`,
      { source: src, offset: start }
    );
  }

  /** The loaded plugin for a detected type, if any. */
  plugin(id: string): AnyPlugin | undefined {
    return this.plugins.get(id);
  }

  private entryFor(typeOrId: string): Entry | undefined {
    return [...this.external, ...this.entries].find(
      (e) => e.type === typeOrId || e.id === typeOrId
    );
  }

  /** Loads the plugin `id` (a plugin id or v12 type); undefined if it has no package. */
  async load(typeOrId: string): Promise<AnyPlugin | undefined> {
    const entry = this.entryFor(typeOrId);
    const id = entry?.id;
    if (!entry || id === undefined || !entry.load) return undefined;
    const have = this.plugins.get(id);
    if (have) return have;
    let pending = this.loading.get(id);
    if (!pending) {
      pending = entry.load().then((p) => {
        this.plugins.set(id, p);
        return p;
      });
      this.loading.set(id, pending);
      pending.catch(() => this.loading.delete(id));
    }
    return pending;
  }

  formats(typeOrId: string): readonly string[] {
    const entry = this.entryFor(typeOrId);
    if (!entry?.id) return [];
    return this.plugins.get(entry.id)?.formats ?? entry.formats;
  }

  /** Third-party diagrams, detected after every first-party type (ADR-6). */
  async registerExternal(defs: readonly ExternalDiagram[], lazyLoad: boolean): Promise<void> {
    for (const def of defs) {
      const isPlugin = 'parse' in def && 'render' in def;
      const load = isPlugin
        ? () => Promise.resolve(def)
        : async (): Promise<AnyPlugin> =>
            unwrap<AnyPlugin>(await (def as Exclude<ExternalDiagram, AnyPlugin>).loader());
      const entry: Entry = {
        type: def.id,
        id: def.id,
        formats: def.formats ?? ['svg'],
        detect: (text) => def.detector(text),
        load,
      };
      const at = this.external.findIndex((e) => e.id === def.id);
      if (at >= 0) this.external[at] = entry;
      else this.external.push(entry);
      this.plugins.delete(def.id);
      this.loading.delete(def.id);
      if (isPlugin) this.plugins.set(def.id, def);
      else if (!lazyLoad) await this.load(def.id);
    }
  }

  registerLayouts(loaders: readonly LayoutLoader[]): void {
    for (const l of loaders) {
      this.layoutLoaders.set(l.name, l.loader);
      this.layouts.delete(l.name);
    }
  }

  /**
   * The engine for a `layout` name: `ready` when loaded, `missing` when registered but not
   * loaded, `unknown` (the built-in engine stands in) when nobody registered it.
   */
  layout(name: string): { engine: LayoutEngine; state: 'ready' | 'missing' | 'unknown' } {
    const engine = this.layouts.get(name);
    if (engine) return { engine, state: 'ready' };
    if (this.layoutLoaders.has(name)) return { engine: layered, state: 'missing' };
    return { engine: layered, state: builtIn(name) ? 'ready' : 'unknown' };
  }

  async loadLayout(name: string): Promise<void> {
    const loader = this.layoutLoaders.get(name);
    if (!loader || this.layouts.has(name)) return;
    this.layouts.set(name, unwrap<LayoutEngine>(await loader()));
  }
}
