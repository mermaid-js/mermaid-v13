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
  type LayoutManifest,
  type PluginManifest,
} from '@mermaid-js/core';
import { checkFragment, type ConfigFragment } from '@mermaid-js/core/config';
import { layered, type LayoutEngine } from '@mermaid-js/core/layout';
import { diagramStart, type PreprocessResult } from '@mermaid-js/core/preprocess';
import { THEME_VARIABLES, type ThemeRuleTable } from '@mermaid-js/core/theme';

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
  /** As `DiagramPlugin.detector`: the cleaned text and the integrator's config. */
  detector(text: string, config?: Readonly<Record<string, unknown>>): boolean;
  loader(): Promise<AnyPlugin | { diagram: AnyPlugin }>;
  readonly formats?: readonly string[];
}

/**
 * A plugin given by its package.json `mermaid` manifest (DESIGN §12.1, R-PLUG-3). A diagram
 * needs the eager `detector` and is loaded on first use; an extension has no detector and is
 * loaded on registration (its activation); a layout package registers each of its `names`
 * lazily and is loaded when a diagram names one (D177). `load` imports the manifest's `entry`.
 */
export interface ManifestPlugin {
  /** The `mermaid` value of the plugin's package.json; checked by `readManifest`. */
  readonly manifest: unknown;
  /** The detector module's function (diagrams only). */
  readonly detector?: (text: string, config?: Readonly<Record<string, unknown>>) => boolean;
  load(): Promise<unknown>;
  /** Imports the manifest's `ascii` entry (diagrams with one); its `ascii` export is the hook. */
  readonly loadAscii?: () => Promise<unknown>;
  /**
   * The fragment the manifest's `config` module exports (layouts with one), loaded eagerly
   * with the manifest, like a detector (D153).
   */
  readonly config?: ConfigFragment;
}

/** `registerExternalDiagrams` input: a diagram, an extension, or either by manifest. */
export type ExternalDiagram = AnyPlugin | LazyDiagram | ExtensionPlugin | ManifestPlugin;

/** `registerLayoutLoaders` input (R-LAYOUT-2): an engine `(graph, ctx?) → LayoutModel`. */
export interface LayoutLoader {
  readonly name: string;
  loader(): Promise<LayoutEngine | { layout: LayoutEngine } | { default: LayoutEngine }>;
  /**
   * The layout plugin's config fragment (D153), known from registration on, before the engine
   * loads. Loaders of one package share one fragment object (one id).
   */
  readonly config?: ConfigFragment;
}

interface Entry {
  readonly type: string;
  readonly id: string | undefined;
  readonly formats: readonly string[];
  /** `clean` is v12's detector text (third-party detectors), built on first use. */
  readonly detect: (
    body: string,
    clean: () => string,
    config: Readonly<Record<string, unknown>> | undefined
  ) => boolean;
  readonly load?: () => Promise<AnyPlugin>;
  readonly loadAscii?: () => Promise<AnyAsciiHook>;
}

export interface Detected {
  /** v12 diagram type. */
  readonly type: string;
  /** Plugin id; undefined when the type has no v13 package (R-COMPAT-7). */
  readonly id: string | undefined;
}

/** Names the built-in engine answers to silently (DESIGN §6.1): `layered` and v12's `dagre`. */
const builtIn = (name: string): boolean => name === 'layered' || name === 'dagre';

/**
 * v12's ELK names, `elk` and `elk.<algorithm>` (D171). Without an ELK engine registered they draw
 * with the built-in engine and warn `ELK_NOT_INSTALLED` (D173). Core never names the package.
 */
const isElkName = (name: string): boolean => name === 'elk' || name.startsWith('elk.');

/** The plugin a loaded entry module holds: `manifest.export`, the default export, or itself. */
function entryExport(module: unknown, manifest: PluginManifest): unknown {
  const m = module as Record<string, unknown> | null;
  if (typeof m !== 'object' || m === null) return m;
  if (manifest.export !== undefined) return m[manifest.export];
  if (typeof m.id === 'string') return m;
  return m.default ?? m.diagram ?? m.extension;
}

/** What a layout entry module holds: `manifest.export`, the default export, or itself. */
function layoutsOf(module: unknown, manifest: LayoutManifest): unknown {
  if (typeof module === 'function' || Array.isArray(module)) return module;
  const m = module as Record<string, unknown> | null;
  if (typeof m !== 'object' || m === null) return m;
  if (manifest.export !== undefined) return m[manifest.export];
  return m.default ?? m.layouts ?? m.layout;
}

function kindOf(def: ExternalDiagram): 'plugin' | 'lazy' | 'manifest' | 'extension' {
  if ('manifest' in def) return 'manifest';
  if ('detector' in def && 'loader' in def) return 'lazy';
  // Anything with a detector, parse or render is a diagram: checkDiagram names what is missing.
  if ('parse' in def || 'render' in def || 'detector' in def) return 'plugin';
  return 'extension';
}

function checkDiagram(def: AnyPlugin | LazyDiagram, eager: boolean): void {
  const p = def as unknown as Record<string, unknown>;
  if (typeof p.id !== 'string' || p.id === '')
    throw new TypeError('A diagram plugin needs a non-empty string id');
  const members = eager ? ['detector', 'parse', 'render'] : ['detector', 'loader'];
  for (const m of members)
    if (typeof p[m] !== 'function')
      throw new TypeError(`Diagram "${p.id}": ${m} must be a function`);
}

// v12 detectType's cleaning of the text after front matter: directives removed (their ranges
// come from preprocess), and each `%%` comment cut from its line.
function detectText(src: string, start: number, pre: PreprocessResult): string {
  let text = '';
  let at = start;
  for (const { range } of pre.directives) {
    if (range.end <= at) continue;
    text += src.slice(at, Math.max(at, range.start));
    at = range.end;
  }
  text += src.slice(at);
  if (!text.includes('%%')) return text;
  return text
    .split('\n')
    .map((line) => {
      const c = line.indexOf('%%');
      return c < 0 ? line : line.slice(0, c).trimEnd();
    })
    .join('\n');
}

const unwrap = <T>(m: T | { diagram: T } | { layout: T } | { default: T }): T =>
  typeof m === 'object' && m !== null && ('diagram' in m || 'layout' in m || 'default' in m)
    ? ((m as { diagram?: T }).diagram ??
      (m as { layout?: T }).layout ??
      (m as { default: T }).default)
    : m;

/** Theme variables core defines: a fragment's own must not reuse them. */
const THEME_NAMES: ReadonlySet<string> = new Set(Object.keys(THEME_VARIABLES));

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
  /** Whether any ELK name (`elk`, `elk.*`) has a registered loader. */
  private elkRegistered = false;
  private readonly layouts = new Map<string, LayoutEngine>([['layered', layered]]);
  private readonly fragmentsById = new Map<string, ConfigFragment>();
  private fragmentList: readonly ConfigFragment[] = [];
  private rules: ThemeRuleTable | undefined;

  /** `firstParty`: the generated table, with loaders (`mermaid`) or without (`mermaid/slim`). */
  constructor(firstParty: readonly FirstPartyEntry[]) {
    for (const e of firstParty) {
      this.entries.push({
        type: e.type,
        id: e.id,
        formats: e.formats ?? [],
        detect: (body) => e.pattern.test(body),
        load: e.load,
        loadAscii: e.loadAscii,
      });
    }
  }

  /** The diagram type of `src`, or throws `MermaidError` (v12 order; first match wins). */
  detect(src: string, pre: PreprocessResult, config?: Readonly<Record<string, unknown>>): Detected {
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
    let clean: string | undefined;
    const cleaned = () => (clean ??= detectText(src, start, pre));
    for (const e of [...this.entries, ...this.external]) {
      if (e.detect(body, cleaned, config)) return { type: e.type, id: e.id };
    }
    throw new MermaidError(
      'UNSUPPORTED_DIAGRAM',
      `No diagram type detected matching given configuration for text: ${body.slice(0, 200)}`,
      { source: src, offset: start }
    );
  }

  /**
   * The config fragments of the registered plugins (D153), in registration order. The array
   * is replaced, never changed, when a fragment is added: compare it by identity.
   */
  fragments(): readonly ConfigFragment[] {
    return this.fragmentList;
  }

  /** Checks and adds a plugin's fragment; one per id, a later one replaces it. */
  private addFragment(fragment: unknown): void {
    const f = checkFragment(fragment, THEME_NAMES);
    if (this.fragmentsById.get(f.id) === f) return;
    this.fragmentsById.delete(f.id);
    this.fragmentsById.set(f.id, f);
    this.fragmentList = Object.freeze([...this.fragmentsById.values()]);
    const rules: Record<string, string> = {};
    for (const x of this.fragmentList) Object.assign(rules, x.themeVariables);
    this.rules = Object.keys(rules).length > 0 ? Object.freeze(rules) : undefined;
  }

  /** The fragments' theme variables with their defaults, for `createTheme`; undefined if none. */
  themeRules(): ThemeRuleTable | undefined {
    return this.rules;
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
    if (!(await this.load(id))) return this.ascii(id);
    // The plugin may carry its own ascii hook.
    const registered = this.ascii(id);
    if (registered) return registered;
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
        extensions.push(this.withFragment(checkExtension(def as ExtensionPlugin)));
        continue;
      }
      if (kind === 'manifest') {
        const { manifest: raw, detector, load } = def as ManifestPlugin;
        const manifest = readManifest(raw);
        if (manifest.plugin === 'layout') {
          this.addLayoutPackage(manifest, def as ManifestPlugin);
          continue;
        }
        if (manifest.plugin === 'extension') {
          if (detector !== undefined)
            throw new TypeError(`Extension "${manifest.id}" must not have a detector`);
          const loaded = checkExtension(entryExport(await load(), manifest) as ExtensionPlugin);
          if (loaded.id !== manifest.id)
            throw new TypeError(
              `Extension entry has id "${loaded.id}", its manifest says "${manifest.id}"`
            );
          extensions.push(this.withFragment(loaded));
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

  /** A layout manifest (D177): each name lazily, one shared load of the entry. */
  private addLayoutPackage(manifest: LayoutManifest, def: ManifestPlugin): void {
    const label = manifest.id ?? manifest.names[0]!;
    if (def.detector !== undefined)
      throw new TypeError(`Layout package "${label}" must not have a detector`);
    if (manifest.config !== undefined && def.config === undefined)
      throw new TypeError(`Layout package "${label}" needs its config fragment`);
    let pending: Promise<unknown> | undefined;
    const entry = (): Promise<unknown> => {
      if (!pending) {
        pending = def.load().then((m) => layoutsOf(m, manifest));
        pending.catch(() => (pending = undefined));
      }
      return pending;
    };
    this.registerLayouts(
      manifest.names.map((name) => ({
        name,
        ...(def.config !== undefined ? { config: def.config } : {}),
        loader: async () => {
          const found = await entry();
          if (typeof found === 'function') return found as LayoutEngine;
          const l = Array.isArray(found)
            ? (found as unknown[]).find((x) => (x as LayoutLoader | null)?.name === name)
            : undefined;
          if (typeof (l as LayoutLoader | undefined)?.loader !== 'function')
            throw new TypeError(`Layout entry of "${label}" has no layout "${name}"`);
          return (l as LayoutLoader).loader();
        },
      }))
    );
  }

  private withFragment(e: ExtensionPlugin): ExtensionPlugin {
    if (e.config !== undefined) this.addFragment(e.config);
    return e;
  }

  private async addDiagram(
    def: AnyPlugin | LazyDiagram,
    isPlugin: boolean,
    lazyLoad: boolean,
    loadAscii?: () => Promise<AnyAsciiHook>
  ): Promise<void> {
    checkDiagram(def, isPlugin);
    const load = isPlugin
      ? () => Promise.resolve(def as AnyPlugin)
      : async (): Promise<AnyPlugin> => unwrap<AnyPlugin>(await (def as LazyDiagram).loader());
    const entry: Entry = {
      type: def.id,
      id: def.id,
      formats: def.formats ?? ['svg'],
      detect: (_body, clean, config) => def.detector(clean(), config),
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
    for (const l of loaders) if (l.config !== undefined) this.addFragment(l.config);
    for (const l of loaders) {
      this.layoutLoaders.set(l.name, l.loader);
      if (isElkName(l.name)) this.elkRegistered = true;
      this.layouts.delete(l.name);
    }
  }

  /**
   * The engine for a `layout` name: `ready` when loaded, `missing` when registered but not
   * loaded, `unknown` (the built-in engine stands in) when nobody registered it, and `elk` (the
   * built-in engine stands in too) for an ELK name while no ELK engine is registered at all.
   */
  layout(name: string): { engine: LayoutEngine; state: 'ready' | 'missing' | 'unknown' | 'elk' } {
    const engine = this.layouts.get(name);
    if (engine) return { engine, state: 'ready' };
    if (this.layoutLoaders.has(name)) return { engine: layered, state: 'missing' };
    if (builtIn(name)) return { engine: layered, state: 'ready' };
    return { engine: layered, state: isElkName(name) && !this.elkRegistered ? 'elk' : 'unknown' };
  }

  async loadLayout(name: string): Promise<void> {
    const loader = this.layoutLoaders.get(name);
    if (!loader || this.layouts.has(name)) return;
    const engine = unwrap<LayoutEngine>(await loader());
    if (typeof engine !== 'function') throw new TypeError(`Layout "${name}" loaded no engine`);
    this.layouts.set(name, engine);
  }
}
