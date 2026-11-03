/**
 * The diagram and layout registry (DESIGN §12, R-PLUG-6, R-LAYOUT-2). One instance per
 * `mermaid` API object; nothing here is module-level state.
 */
import {
  MermaidError,
  readManifest,
  type AsciiHook,
  type DiagramPlugin,
  type ExtensionPlugin,
  type PluginManifest,
} from '@mermaid-js/core';
import { layered, type LayoutEngine } from '@mermaid-js/core/layout';
import { diagramStart, type PreprocessResult } from '@mermaid-js/core/preprocess';
import { FIRST_PARTY } from './generated/registry.gen.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the registry holds plugins of every model and layout type
export type AnyPlugin = DiagramPlugin<any, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the registry holds ascii hooks of every model and layout type
type AnyAsciiHook = AsciiHook<any, any>;

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
  /** The lazily loaded text-output hook (manifest key `ascii`, D76). */
  readonly loadAscii?: () => Promise<AnyAsciiHook>;
}

/** A lazy third-party diagram: detected eagerly, loaded on first use. */
export interface LazyDiagram {
  readonly id: string;
  /** Whole source in. */
  detector(text: string): boolean;
  loader(): Promise<AnyPlugin | { diagram: AnyPlugin }>;
  readonly formats?: readonly string[];
}

/**
 * A plugin given by its package.json `mermaid` manifest (DESIGN §12.1, R-PLUG-3). A diagram
 * needs the eager `detector` and is loaded on first use; an extension has no detector and is
 * loaded on registration (its activation). `load` imports the manifest's `entry`.
 */
export interface ManifestPlugin {
  /** The `mermaid` value of the plugin's package.json; checked by `readManifest`. */
  readonly manifest: unknown;
  /** The detector module's function (diagrams only). */
  readonly detector?: (text: string) => boolean;
  load(): Promise<unknown>;
  /** Imports the manifest's `ascii` entry (diagrams with one); its `ascii` export is the hook. */
  readonly loadAscii?: () => Promise<unknown>;
}

/** `registerExternalDiagrams` input: a diagram, an extension, or either by manifest. */
export type ExternalDiagram = AnyPlugin | LazyDiagram | ExtensionPlugin | ManifestPlugin;

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
  readonly loadAscii?: () => Promise<AnyAsciiHook>;
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

/** The plugin a loaded entry module holds: `manifest.export`, the default export, or itself. */
function entryExport(module: unknown, manifest: PluginManifest): unknown {
  const m = module as Record<string, unknown> | null;
  if (typeof m !== 'object' || m === null) return m;
  if (manifest.export !== undefined) return m[manifest.export];
  if (typeof m.id === 'string') return m;
  return m.default ?? m.diagram ?? m.extension;
}

function kindOf(def: ExternalDiagram): 'plugin' | 'lazy' | 'manifest' | 'extension' {
  if ('manifest' in def) return 'manifest';
  if ('parse' in def && 'render' in def) return 'plugin';
  if ('detector' in def && 'loader' in def) return 'lazy';
  return 'extension';
}

const unwrap = <T>(m: T | { diagram: T } | { layout: T } | { default: T }): T =>
  typeof m === 'object' && m !== null && ('diagram' in m || 'layout' in m || 'default' in m)
    ? ((m as { diagram?: T }).diagram ??
      (m as { layout?: T }).layout ??
      (m as { default: T }).default)
    : m;

const HOOKS = ['postParse', 'postLayout', 'postRender', 'afterMount'] as const;

function checkExtension(p: ExtensionPlugin): ExtensionPlugin {
  if (typeof p !== 'object' || p === null || typeof p.id !== 'string' || p.id === '')
    throw new TypeError('An extension plugin needs a non-empty string id');
  for (const h of HOOKS)
    if (p[h] !== undefined && typeof p[h] !== 'function')
      throw new TypeError(`Extension "${p.id}": ${h} must be a function`);
  if ('detector' in p) throw new TypeError(`Extension "${p.id}" must not have a detector`);
  return p;
}

export class Registry {
  private readonly entries: Entry[] = [];
  private readonly external: Entry[] = [];
  private readonly plugins = new Map<string, AnyPlugin>();
  private readonly loading = new Map<string, Promise<AnyPlugin>>();
  private readonly asciiHooks = new Map<string, AnyAsciiHook>();
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
        loadAscii: e.loadAscii,
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

  /**
   * Loads the text-output hook of `typeOrId` (D76, only for `format: 'ascii'`): the plugin's
   * own `ascii` method, else its lazily loaded `ascii` entry. Undefined when it has neither.
   */
  async loadAscii(typeOrId: string): Promise<AnyAsciiHook | undefined> {
    const entry = this.entryFor(typeOrId);
    const id = entry?.id;
    if (!entry || id === undefined) return undefined;
    const have = this.ascii(id);
    if (have) return have;
    if (!(await this.load(id)) || this.ascii(id)) return this.ascii(id);
    if (!entry.loadAscii) return undefined;
    const hook = await entry.loadAscii();
    if (typeof hook !== 'function')
      throw new TypeError(`The ascii entry of "${id}" has no ascii function`);
    this.asciiHooks.set(id, hook);
    return hook;
  }

  /** The loaded text-output hook of plugin `id`, if any. */
  ascii(id: string): AnyAsciiHook | undefined {
    const plugin = this.plugins.get(id);
    if (typeof plugin?.ascii === 'function')
      return (model, layout, ctx) => plugin.ascii!(model, layout, ctx);
    return this.asciiHooks.get(id);
  }

  formats(typeOrId: string): readonly string[] {
    const entry = this.entryFor(typeOrId);
    if (!entry?.id) return [];
    return this.plugins.get(entry.id)?.formats ?? entry.formats;
  }

  /**
   * Third-party diagrams, detected after every first-party type (ADR-6). Returns the
   * extension plugins among `defs`, loaded, in the order given, for the hook runner.
   */
  async registerExternal(
    defs: readonly ExternalDiagram[],
    lazyLoad: boolean
  ): Promise<ExtensionPlugin[]> {
    const extensions: ExtensionPlugin[] = [];
    for (const def of defs) {
      const kind = kindOf(def);
      if (kind === 'extension') {
        extensions.push(checkExtension(def as ExtensionPlugin));
        continue;
      }
      if (kind === 'manifest') {
        const { manifest: raw, detector, load } = def as ManifestPlugin;
        const manifest = readManifest(raw);
        if (manifest.plugin === 'extension') {
          if (detector !== undefined)
            throw new TypeError(`Extension "${manifest.id}" must not have a detector`);
          const loaded = checkExtension(entryExport(await load(), manifest) as ExtensionPlugin);
          if (loaded.id !== manifest.id)
            throw new TypeError(
              `Extension entry has id "${loaded.id}", its manifest says "${manifest.id}"`
            );
          extensions.push(loaded);
          continue;
        }
        if (typeof detector !== 'function')
          throw new TypeError(`Diagram "${manifest.id}" needs its detector function`);
        const { loadAscii } = def as ManifestPlugin;
        if (manifest.ascii !== undefined && typeof loadAscii !== 'function')
          throw new TypeError(`Diagram "${manifest.id}" needs loadAscii for its ascii entry`);
        await this.addDiagram(
          {
            id: manifest.id,
            detector,
            formats: manifest.formats,
            loader: async () => {
              const plugin = entryExport(await load(), manifest) as AnyPlugin;
              if (plugin?.id !== manifest.id)
                throw new TypeError(
                  `Diagram entry has id "${String(plugin?.id)}", its manifest says "${manifest.id}"`
                );
              return plugin;
            },
          },
          false,
          lazyLoad,
          manifest.ascii === undefined || !loadAscii
            ? undefined
            : async () => {
                const m = (await loadAscii()) as
                  | { ascii?: AnyAsciiHook }
                  | AnyAsciiHook
                  | undefined;
                return (typeof m === 'function' ? m : m?.ascii) as AnyAsciiHook;
              }
        );
        continue;
      }
      await this.addDiagram(def as AnyPlugin | LazyDiagram, kind === 'plugin', lazyLoad);
    }
    return extensions;
  }

  private async addDiagram(
    def: AnyPlugin | LazyDiagram,
    isPlugin: boolean,
    lazyLoad: boolean,
    loadAscii?: () => Promise<AnyAsciiHook>
  ): Promise<void> {
    const load = isPlugin
      ? () => Promise.resolve(def as AnyPlugin)
      : async (): Promise<AnyPlugin> => unwrap<AnyPlugin>(await (def as LazyDiagram).loader());
    const entry: Entry = {
      type: def.id,
      id: def.id,
      formats: def.formats ?? ['svg'],
      detect: (text) => def.detector(text),
      load,
      ...(loadAscii ? { loadAscii } : {}),
    };
    const at = this.external.findIndex((e) => e.id === def.id);
    if (at >= 0) this.external[at] = entry;
    else this.external.push(entry);
    this.plugins.delete(def.id);
    this.loading.delete(def.id);
    this.asciiHooks.delete(def.id);
    if (isPlugin) this.plugins.set(def.id, def as AnyPlugin);
    else if (!lazyLoad) await this.load(def.id);
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
