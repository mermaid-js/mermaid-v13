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
import { checkFragment, type ConfigFragment, type ResolvedConfig } from '@mermaid-js/core/config';
import { layered, type LayoutEngine } from '@mermaid-js/core/layout';
import {
  detectText,
  diagramStart,
  firstPartyDetects,
  type PreprocessResult,
} from '@mermaid-js/core/preprocess';
import { THEME_VARIABLE_TABLE, type ThemeRuleTable } from '@mermaid-js/core/theme';

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
  /**
   * The extension the same `config` module exports as `extension` (layouts with one), loaded
   * with it. It runs only on renders laid out by one of the package's names, as
   * `LayoutLoader.extension` (ELK's `lineHops`).
   */
  readonly extension?: ExtensionPlugin;
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
  /**
   * The layout plugin's own hooks (an extension plugin, D174: ELK's `lineHops` is a
   * `postRender` edit). They run only on renders laid out by this loader's name, so other
   * renders keep the stream writer. Loaders of one package share one.
   */
  readonly extension?: ExtensionPlugin;
}

/**
 * One entry of the discovered list (D166): what a discovery path (Node scan, bundler module,
 * CDN queue) found in one package. Detection order among discovered diagrams is by `package`
 * (code-unit order), never by input order. `plugin` is anything `registerExternalDiagrams`
 * takes (a `plugin: "layout"` manifest too, D177); `layout` registers each of `names` lazily,
 * as `registerLayoutLoaders` does, with the package's config fragment if it has one (D153).
 */
export type DiscoveredPlugin =
  | {
      readonly kind: 'plugin';
      /** The npm package name (`@scope/name`), the sort key and the name in warnings. */
      readonly package: string;
      readonly plugin: ExternalDiagram;
    }
  | {
      readonly kind: 'layout';
      readonly package: string;
      /** The layout names it answers to (`elk`, `elk.stress`). */
      readonly names: readonly string[];
      readonly loader: LayoutLoader['loader'];
      readonly config?: ConfigFragment;
      /** Its hooks, run only on renders laid out by one of `names` (`LayoutLoader.extension`). */
      readonly extension?: ExtensionPlugin;
    };

/** The `PLUGIN_SKIPPED` warning: a package (or one of its names) not registered, and why. */
export interface SkippedPlugin {
  readonly code: 'PLUGIN_SKIPPED';
  readonly message: string;
  readonly package: string;
}

interface Entry {
  readonly type: string;
  readonly id: string | undefined;
  readonly formats: readonly string[];
  /**
   * `body` is the text from the diagram's start (front matter, leading directives and comments
   * skipped). `clean` is the text third-party detectors are given and `v12` the one first-party
   * rows fall back to (core's `detectText`, without and with `keepLastLineComment`). Both are
   * built on first use.
   */
  readonly detect: (
    body: string,
    clean: () => string,
    config: Readonly<Record<string, unknown>> | undefined,
    v12: () => string
  ) => boolean;
  readonly load?: () => Promise<AnyPlugin>;
  readonly loadAscii?: () => Promise<AnyAsciiHook>;
  /** An eagerly given plugin (no loader): ready as soon as the entry is active. */
  readonly eager?: AnyPlugin;
}

/** A diagram, extension or layout package checked and ready to enter a source. */
type Resolved =
  | { readonly extension: ExtensionPlugin }
  | { readonly diagram: Entry }
  | { readonly layouts: readonly LayoutLoader[] };

/** One layout name a discovered package gives. */
interface DiscoveredLayout {
  readonly name: string;
  readonly loader: LayoutLoader['loader'];
  readonly config?: ConfigFragment;
  readonly extension?: ExtensionPlugin;
}

/** The id of an extension (given, or by manifest) without loading it; else undefined. */
function extensionIdOf(def: ExternalDiagram): string | undefined {
  try {
    const kind = kindOf(def);
    if (kind === 'extension') return (def as ExtensionPlugin).id;
    if (kind !== 'manifest') return undefined;
    const manifest = readManifest((def as ManifestPlugin).manifest);
    return manifest.plugin === 'extension' ? manifest.id : undefined;
  } catch {
    return undefined;
  }
}

interface Found<T> {
  readonly package: string;
  readonly value: T;
}

export interface Detected {
  /** v12 diagram type. */
  readonly type: string;
  /** Plugin id; undefined when the type has no v13 package (R-COMPAT-7). */
  readonly id: string | undefined;
}

/** Names the built-in engine answers to silently (DESIGN §6.1): `layered` and v12's `dagre`. */
const FIRST_PARTY_LAYOUTS: ReadonlySet<string> = new Set(['layered', 'dagre']);

export const builtIn = (name: string): boolean => FIRST_PARTY_LAYOUTS.has(name);

/**
 * First-party engines loaded on first use (D280, D284), each its own chunk outside core's
 * closure (R-PERF-8). A diagram reaches one only when it is its `layoutEngine.default` (D285),
 * unless a loader of the same name is registered.
 */
const LAZY_LAYOUTS = new Map<string, LayoutLoader['loader']>([
  ['tree', () => import('@mermaid-js/core/layout/tree').then((m) => m.tree)],
]);

/** The engine a render asks for: `layout`, through the diagram's aliases (D284). */
export function layoutName(config: ResolvedConfig, plugin: AnyPlugin): string {
  const name = String(config.layout ?? 'layered');
  const aliases = plugin.layoutEngine?.aliases;
  return aliases && Object.hasOwn(aliases, name) ? aliases[name]! : name;
}

/**
 * v12's ELK names, `elk` and `elk.<algorithm>` (D171). Without an ELK engine registered they draw
 * with the built-in engine and warn `ELK_NOT_INSTALLED` (D173). Core never names the package.
 */
/** `elk` or `elk.<anything>`: a name only an ELK layout plugin lays out (D171, D173). */
export const isElkName = (name: string): boolean => name === 'elk' || name.startsWith('elk.');

/** A `layout` name's engine (`Registry.layout`). */
export interface LayoutFound {
  readonly engine: LayoutEngine;
  readonly state: 'ready' | 'missing' | 'unknown' | 'elk';
  /** The engine to load before a synchronous render can draw. */
  readonly need?: string;
  /** The diagram's default, drawing in place of an unknown or uninstalled engine. */
  readonly standIn?: string;
}

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

/** A layout manifest (D177) as loaders: each name lazily, one shared load of the entry. */
function layoutPackage(manifest: LayoutManifest, def: ManifestPlugin): LayoutLoader[] {
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
  if (def.extension !== undefined && manifest.config === undefined)
    throw new TypeError(`Layout package "${label}" has an extension but no "config" module`);
  return manifest.names.map((name) => ({
    name,
    ...(def.config !== undefined ? { config: def.config } : {}),
    ...(def.extension !== undefined ? { extension: def.extension } : {}),
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
  }));
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

const unwrap = <T>(m: T | { diagram: T } | { layout: T } | { default: T }): T =>
  typeof m === 'object' && m !== null && ('diagram' in m || 'layout' in m || 'default' in m)
    ? ((m as { diagram?: T }).diagram ??
      (m as { layout?: T }).layout ??
      (m as { default: T }).default)
    : m;

/** Theme variables core defines: a fragment's own must not reuse them. */
const THEME_NAMES: ReadonlySet<string> = new Set(Object.keys(THEME_VARIABLE_TABLE));

const HOOKS = ['postParse', 'postLayout', 'postRender', 'afterMount'] as const;

function checkExtension(value: unknown): ExtensionPlugin {
  const p = value as ExtensionPlugin;
  if (typeof value !== 'object' || value === null || typeof p.id !== 'string' || p.id === '')
    throw new TypeError('An extension plugin needs a non-empty string id');
  for (const h of HOOKS)
    if (p[h] !== undefined && typeof p[h] !== 'function')
      throw new TypeError(`Extension "${p.id}": ${h} must be a function`);
  if ('detector' in p) throw new TypeError(`Extension "${p.id}" must not have a detector`);
  return p;
}

/**
 * A layout loader's extension (D174) runs only on renders that layout draws, which is known only
 * once the config is resolved: after parse claims are read and while inline providers, glyphs
 * and resources are gathered for every render. So it may have hooks and a config fragment, never
 * those (DESIGN §12.2).
 */
function checkLayoutExtension(value: unknown): ExtensionPlugin {
  const p = checkExtension(value);
  for (const key of ['claims', 'inline', 'glyphs', 'resources'] as const)
    if (p[key] !== undefined)
      throw new TypeError(
        `A layout extension "${p.id}" must not have "${key}": register it with registerExternalDiagrams`
      );
  return p;
}

/** Package-name order, by code unit so it is the same in every locale (R-ARCH-6). */
function byPackage(a: { readonly package: string }, b: { readonly package: string }): number {
  if (a.package === b.package) return 0;
  return a.package < b.package ? -1 : 1;
}

/** Package-name order, then the entry's own id or name: one package may give several. */
function byPackageThen(key: (f: never) => string) {
  return (a: Found<unknown>, b: Found<unknown>): number => {
    const p = byPackage(a, b);
    if (p !== 0) return p;
    const ka = key(a as never);
    const kb = key(b as never);
    if (ka === kb) return 0;
    return ka < kb ? -1 : 1;
  };
}
const byEntryId = byPackageThen((f: Found<Entry>) => f.value.id ?? '');
const byExtensionId = byPackageThen((f: Found<ExtensionPlugin>) => f.value.id);

const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export class Registry {
  /** First-party rows, in v12 order (ADR-6). */
  private readonly entries: Entry[] = [];
  /** Every first-party id and v12 type, for the collision rules (D166). */
  private readonly firstPartyNames = new Set<string>();
  /** Explicit `{ replace: true }` registrations, by the first-party id they take over. */
  private readonly replaced = new Map<string, Entry>();
  /** Discovered diagrams, sorted by package; the first package with an id wins it. */
  private discovered: Found<Entry>[] = [];
  /** Explicit diagrams, in call order. */
  private readonly external: Entry[] = [];
  /** Detection order, rebuilt after each registration. */
  private order: Entry[] | undefined;
  /** Discovered extensions, sorted by package then id. */
  private discoveredExtensions: Found<ExtensionPlugin>[] = [];
  /** Every discovered (package, kind, id or name) seen so far, registered or not. */
  private readonly claimed = new Set<string>();
  /** Explicit extensions, in call order (a repeated id keeps its place). */
  private readonly explicitExtensions: ExtensionPlugin[] = [];
  private readonly plugins = new Map<string, AnyPlugin>();
  private readonly loading = new Map<string, Promise<AnyPlugin>>();
  private readonly asciiHooks = new Map<string, AnyAsciiHook>();
  private readonly layoutLoaders = new Map<string, LayoutLoader['loader']>();
  /** The extension each explicitly registered layout name brought (D174). */
  private readonly layoutExtensions = new Map<string, ExtensionPlugin>();
  /** Whether any ELK name (`elk`, `elk.*`) has a registered or discovered loader. */
  private elkRegistered = false;
  private discoveredLayouts: (Found<LayoutLoader['loader']> & {
    readonly name: string;
    readonly extension?: ExtensionPlugin;
  })[] = [];
  private readonly layouts = new Map<string, LayoutEngine>([['layered', layered]]);
  private readonly layoutLoading = new Map<
    string,
    { readonly loader: LayoutLoader['loader']; readonly pending: Promise<void> }
  >();
  private readonly fragmentsById = new Map<string, ConfigFragment>();
  private fragmentList: readonly ConfigFragment[] = [];
  private rules: ThemeRuleTable | undefined;

  /**
   * `firstParty`: the generated table, with loaders (`mermaid`) or without (`mermaid/slim`).
   * `names`: every first-party row, for the collision rules (D166), whatever was loadable;
   * `mermaid/slim` passes the full detector table.
   */
  constructor(
    firstParty: readonly FirstPartyEntry[],
    names: readonly { readonly type: string; readonly id?: string }[] = firstParty
  ) {
    for (const e of names) {
      this.firstPartyNames.add(e.type);
      if (e.id !== undefined) this.firstPartyNames.add(e.id);
    }
    for (const e of firstParty) {
      this.entries.push({
        type: e.type,
        id: e.id,
        formats: e.formats ?? [],
        detect: (body, _clean, _config, v12) =>
          firstPartyDetects((text) => e.pattern.test(text), body, v12),
        load: e.load,
        loadAscii: e.loadAscii,
      });
    }
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

  /** The `{ replace: true }` plugin that took over a first-party row (by its id or its type). */
  private replacementOf(row: Entry): Entry | undefined {
    return (
      (row.id === undefined ? undefined : this.replaced.get(row.id)) ?? this.replaced.get(row.type)
    );
  }

  /** The discovered entry `match` finds, unless an explicit one has its id. */
  private discoveredFor(match: (e: Entry) => boolean): Entry | undefined {
    const hit = this.discovered.find((d) => match(d.value))?.value;
    return hit && !this.external.some((e) => e.id === hit.id) ? hit : undefined;
  }

  /** First-party (replacements in their slot), then discovered by package, then explicit. */
  private detectionOrder(): Entry[] {
    if (this.order) return this.order;
    const out: Entry[] = [];
    const seen = new Set<Entry>();
    for (const e of this.entries) {
      const r = this.replacementOf(e);
      if (!r) out.push(e);
      else if (!seen.has(r)) out.push(r);
      if (r) seen.add(r);
    }
    const explicit = new Set(this.external.map((e) => e.id));
    for (const { value } of this.discovered) if (!explicit.has(value.id)) out.push(value);
    out.push(...this.external);
    return (this.order = out);
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
    let old: string | undefined;
    const v12 = () => (old ??= detectText(src, start, pre, { keepLastLineComment: true }));
    for (const e of this.detectionOrder()) {
      if (e.detect(body, cleaned, config, v12)) return { type: e.type, id: e.id };
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
    const match = (e: Entry): boolean => e.type === typeOrId || e.id === typeOrId;
    const explicit = this.external.find(match);
    if (explicit) return explicit;
    const first = this.entries.find(match);
    if (first) return this.replacementOf(first) ?? first;
    return this.replaced.get(typeOrId) ?? this.discoveredFor(match);
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
      const owner = this.entryFor(id);
      pending = entry.load().then((p) => {
        // A registration while this loaded may have replaced the entry.
        if (this.entryFor(id) === owner) this.plugins.set(id, p);
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

  /** Forgets what was loaded for `id`; an eager entry is ready again at once. */
  private reset(id: string): void {
    this.order = undefined;
    this.plugins.delete(id);
    this.loading.delete(id);
    this.asciiHooks.delete(id);
    const now = this.entryFor(id);
    if (now?.eager) this.plugins.set(id, now.eager);
  }

  /** Checks one `registerExternalDiagrams` input; loads an extension's entry (its activation). */
  private async resolve(def: ExternalDiagram): Promise<Resolved> {
    const kind = kindOf(def);
    if (kind === 'extension') return { extension: checkExtension(def as ExtensionPlugin) };
    if (kind !== 'manifest') {
      const isPlugin = kind === 'plugin';
      return { diagram: diagramEntry(def as AnyPlugin | LazyDiagram, isPlugin) };
    }
    const { manifest: raw, detector, load } = def as ManifestPlugin;
    const manifest = readManifest(raw);
    if (manifest.plugin === 'layout')
      return { layouts: layoutPackage(manifest, def as ManifestPlugin) };
    if (manifest.plugin === 'extension') {
      if (detector !== undefined)
        throw new TypeError(`Extension "${manifest.id}" must not have a detector`);
      const loaded = checkExtension(entryExport(await load(), manifest) as ExtensionPlugin);
      if (loaded.id !== manifest.id)
        throw new TypeError(
          `Extension entry has id "${loaded.id}", its manifest says "${manifest.id}"`
        );
      return { extension: loaded };
    }
    if (typeof detector !== 'function')
      throw new TypeError(`Diagram "${manifest.id}" needs its detector function`);
    const { loadAscii } = def as ManifestPlugin;
    if (manifest.ascii !== undefined && typeof loadAscii !== 'function')
      throw new TypeError(`Diagram "${manifest.id}" needs loadAscii for its ascii entry`);
    return {
      diagram: diagramEntry(
        {
          id: manifest.id,
          detector,
          formats: manifest.formats,
          loader: async () => {
            const plugin = entryExport(await load(), manifest) as AnyPlugin | undefined;
            if (plugin?.id !== manifest.id)
              throw new TypeError(
                `Diagram entry has id "${String(plugin?.id)}", its manifest says "${manifest.id}"`
              );
            return plugin;
          },
        },
        false,
        manifest.ascii === undefined || !loadAscii
          ? undefined
          : async () => {
              const m = (await loadAscii()) as { ascii?: AnyAsciiHook } | AnyAsciiHook | undefined;
              return (typeof m === 'function' ? m : m?.ascii) as AnyAsciiHook;
            }
      ),
    };
  }

  /**
   * Explicit third-party diagrams, detected after every first-party and discovered type
   * (ADR-6, D166), in call order. A first-party id or v12 type throws `TypeError` unless
   * `replace`, which puts the plugin in the slot of the first-party rows with that id or type.
   * Extensions join the hook order after the discovered ones ({@link extensions}).
   */
  async registerExternal(
    defs: readonly ExternalDiagram[],
    lazyLoad: boolean,
    replace = false
  ): Promise<void> {
    for (const def of defs) {
      const r = await this.resolve(def);
      if ('layouts' in r) {
        this.registerLayouts(r.layouts);
        continue;
      }
      if ('extension' in r) {
        if (r.extension.config !== undefined) this.addFragment(r.extension.config);
        const at = this.explicitExtensions.findIndex((e) => e.id === r.extension.id);
        if (at >= 0) this.explicitExtensions[at] = r.extension;
        else this.explicitExtensions.push(r.extension);
        continue;
      }
      const entry = r.diagram;
      const id = entry.id!;
      if (this.firstPartyNames.has(id)) {
        if (!replace)
          throw new TypeError(
            `"${id}" is a first-party diagram id or type; pass { replace: true } to replace it`
          );
        this.replaced.set(id, entry);
      } else {
        const at = this.external.findIndex((e) => e.id === id);
        if (at >= 0) this.external[at] = entry;
        else this.external.push(entry);
      }
      this.reset(id);
      if (!entry.eager && !lazyLoad) await this.load(id);
    }
  }

  /** Extension hook order (D166): discovered by package then id, then explicit in call order. */
  extensions(): ExtensionPlugin[] {
    const explicit = new Set(this.explicitExtensions.map((e) => e.id));
    return [
      ...this.discoveredExtensions.filter((d) => !explicit.has(d.value.id)).map((d) => d.value),
      ...this.explicitExtensions,
    ];
  }

  /**
   * The discovered list (D166): diagrams detected after first-party, in package-name order
   * whatever the input or batch order; extensions loaded now; layouts registered lazily. Never
   * throws. Whatever cannot be used gives one `PLUGIN_SKIPPED` warning naming the package: a
   * first-party id or type, an id or layout name an earlier package holds (also when that package
   * arrives in a later batch and displaces it), a repeated entry, a bad manifest, a failing
   * extension entry. A layout package loses only its offending names.
   */
  async registerDiscovered(list: readonly DiscoveredPlugin[]): Promise<SkippedPlugin[]> {
    const warnings: SkippedPlugin[] = [];
    const skip = (pkg: string, reason: string): void =>
      void warnings.push({
        code: 'PLUGIN_SKIPPED',
        message: `Plugin package "${pkg}" was skipped: ${reason}`,
        package: pkg,
      });
    // One package may give several entries; each (package, kind, id or name) counts once, also
    // across batches still registering at the same time (the CDN queue's pushes).
    const known = this.claimed;
    const claim = (key: string): void => {
      if (known.has(key)) throw new TypeError('it was already discovered');
      known.add(key);
    };
    const sorted = [...list].sort(byPackage);
    // Every entry resolves at once (extension entries load now), so slow entries share one
    // wait instead of adding up; they are then applied in package order.
    const resolved = sorted.map((item) => {
      const { package: name, kind } = item as { package?: unknown; kind?: unknown };
      if (kind !== 'plugin' || typeof name !== 'string' || name === '') return undefined;
      const p = this.resolveDiscovered((item as { plugin: ExternalDiagram }).plugin);
      p.catch(() => undefined);
      return p;
    });
    for (const [i, item] of sorted.entries()) {
      const { package: name, kind } = item as { package?: unknown; kind?: unknown };
      const pkg = typeof name === 'string' ? name : '';
      try {
        if (pkg === '') throw new TypeError('it has no package name');
        if (kind !== 'layout' && kind !== 'plugin')
          throw new TypeError(`unknown kind ${JSON.stringify(kind)}`);
        if (item.kind === 'layout') {
          if (typeof item.loader !== 'function')
            throw new TypeError('its layout loader is missing');
          if (!Array.isArray(item.names as unknown) || item.names.length === 0)
            throw new TypeError('it names no layouts');
          const { loader, config, extension } = item;
          const loaders = item.names.map((layout) => ({
            name: layout,
            loader,
            ...(config !== undefined ? { config } : {}),
            ...(extension !== undefined ? { extension } : {}),
          }));
          this.discoverLayouts(pkg, loaders, known, skip);
        } else this.discoverPlugin(pkg, (await resolved[i])!, claim, skip, known);
      } catch (e) {
        skip(pkg || '(unnamed)', why(e));
      }
    }
    return warnings;
  }

  /**
   * A discovered plugin, resolved; an extension whose id is registered explicitly is not
   * loaded at all (explicit beats discovered, silently, as for diagrams and layouts).
   */
  private async resolveDiscovered(def: ExternalDiagram): Promise<Resolved | { explicit: string }> {
    const id = extensionIdOf(def);
    if (id !== undefined && this.explicitExtensions.some((e) => e.id === id))
      return { explicit: id };
    return this.resolve(def);
  }

  private discoverPlugin(
    pkg: string,
    r: Resolved | { explicit: string },
    claim: (key: string) => void,
    skip: (pkg: string, reason: string) => void,
    known: Set<string>
  ): void {
    if ('explicit' in r) return void claim(`${pkg}\0extension\0${r.explicit}`);
    if ('layouts' in r) {
      this.discoverLayouts(pkg, r.layouts, known, skip);
      return;
    }
    if ('extension' in r) {
      const id = r.extension.id;
      claim(`${pkg}\0extension\0${id}`);
      // Registered explicitly while its entry loaded: explicit wins, silently.
      if (this.explicitExtensions.some((e) => e.id === id)) return;
      const owner = this.discoveredExtensions.find((d) => d.value.id === id);
      if (owner && byPackage(owner, { package: pkg }) < 0)
        throw new TypeError(`extension "${id}" belongs to "${owner.package}"`);
      if (r.extension.config !== undefined) this.addFragment(r.extension.config);
      if (owner) skip(owner.package, `extension "${id}" belongs to "${pkg}"`);
      this.discoveredExtensions = [
        ...this.discoveredExtensions.filter((d) => d !== owner),
        { package: pkg, value: r.extension },
      ].sort(byExtensionId);
      return;
    }
    const entry = r.diagram;
    const id = entry.id!;
    claim(`${pkg}\0diagram\0${id}`);
    if (this.firstPartyNames.has(id))
      throw new TypeError(`"${id}" is a first-party diagram id or type`);
    const owner = this.discovered.find((d) => d.value.id === id);
    if (owner && byPackage(owner, { package: pkg }) < 0)
      throw new TypeError(`diagram "${id}" belongs to "${owner.package}"`);
    // A package sorted earlier takes the id over (a later batch, e.g. the CDN queue).
    if (owner) skip(owner.package, `diagram "${id}" belongs to "${pkg}"`);
    this.discovered = [
      ...this.discovered.filter((d) => d !== owner),
      { package: pkg, value: entry },
    ].sort(byEntryId);
    this.reset(id);
  }

  /**
   * One package's layouts (a seam `layout` entry or a layout manifest): each name the package
   * may take is registered lazily; its config fragment joins when at least one name does.
   * Its extension runs on renders laid out by a name it holds, unless an explicit loader of
   * that name replaces it (with its own extension or none).
   */
  private discoverLayouts(
    pkg: string,
    loaders: readonly DiscoveredLayout[],
    known: Set<string>,
    skip: (pkg: string, reason: string) => void
  ): void {
    const own = loaders.flatMap((l) => [l.config, l.extension?.config]);
    for (const f of new Set(own)) if (f !== undefined) checkFragment(f, THEME_NAMES);
    for (const l of loaders) if (l.extension !== undefined) checkLayoutExtension(l.extension);
    for (const { name, loader, config, extension } of loaders) {
      const key = `${pkg}\0layout\0${String(name)}`;
      let reason: string | undefined;
      const owner = this.discoveredLayouts.find((d) => d.name === name);
      if (typeof (name as unknown) !== 'string' || name === '') reason = 'a layout name is empty';
      else if (known.has(key)) reason = `layout "${name}" was already discovered`;
      else if (FIRST_PARTY_LAYOUTS.has(name) || LAZY_LAYOUTS.has(name))
        reason = `"${name}" is a first-party layout`;
      else if (owner && byPackage(owner, { package: pkg }) < 0)
        reason = `layout "${name}" belongs to "${owner.package}"`;
      if (reason !== undefined) {
        skip(pkg, reason);
        continue;
      }
      known.add(key);
      if (config !== undefined) this.addFragment(config);
      if (extension?.config !== undefined) this.addFragment(extension.config);
      if (owner) skip(owner.package, `layout "${name}" belongs to "${pkg}"`);
      this.discoveredLayouts = [
        ...this.discoveredLayouts.filter((d) => d !== owner),
        { package: pkg, name, value: loader, ...(extension !== undefined ? { extension } : {}) },
      ];
      if (isElkName(name)) this.elkRegistered = true;
      if (!this.layoutLoaders.has(name)) this.forgetLayout(name);
    }
  }

  private forgetLayout(name: string): void {
    this.layouts.delete(name);
    this.layoutLoading.delete(name);
  }

  /**
   * Explicit layout loaders (R-LAYOUT-2); they win over discovered ones of the same name.
   * Returns whether any brought an extension.
   */
  registerLayouts(loaders: readonly LayoutLoader[]): boolean {
    for (const l of loaders) if (l.extension !== undefined) checkLayoutExtension(l.extension);
    for (const l of loaders) if (l.config !== undefined) this.addFragment(l.config);
    for (const l of loaders)
      if (l.extension?.config !== undefined) this.addFragment(l.extension.config);
    for (const l of loaders) {
      this.layoutLoaders.set(l.name, l.loader);
      if (l.extension !== undefined) this.layoutExtensions.set(l.name, l.extension);
      else this.layoutExtensions.delete(l.name);
      if (isElkName(l.name)) this.elkRegistered = true;
      this.forgetLayout(l.name);
    }
    return loaders.some((l) => l.extension !== undefined);
  }

  /** The extension the loader registered for layout `name` brought, if any. */
  layoutExtension(name: string): ExtensionPlugin | undefined {
    if (this.layoutLoaders.has(name)) return this.layoutExtensions.get(name);
    return this.discoveredLayouts.find((d) => d.name === name)?.extension;
  }

  private layoutLoader(name: string): LayoutLoader['loader'] | undefined {
    return (
      this.layoutLoaders.get(name) ??
      this.discoveredLayouts.find((d) => d.name === name)?.value ??
      LAZY_LAYOUTS.get(name)
    );
  }

  /**
   * The engine for a `layout` name: `ready` when loaded, `missing` when registered but not
   * loaded, `unknown` when nobody registered it, and `elk` for an ELK name while no ELK engine
   * is registered at all. For the last two the diagram's own default stands in (D282), else
   * the built-in engine. `need` is the engine to load first. A lazy first-party engine is
   * `unknown` to a diagram whose default it is not (D285).
   */
  layout(name: string, own?: DiagramPlugin['layoutEngine']): LayoutFound {
    const found = this.find(name, name === own?.default);
    if (found.state === 'ready' || found.state === 'missing' || !own || own.default === name)
      return found;
    const standIn = this.find(own.default, true);
    return { ...standIn, state: found.state, standIn: own.default };
  }

  private find(name: string, declares: boolean): LayoutFound {
    const loader = this.layoutLoader(name);
    // A lazy first-party engine that nobody replaced: only for a diagram that names it (D285).
    if (!declares && loader !== undefined && loader === LAZY_LAYOUTS.get(name))
      return { engine: layered, state: 'unknown' };
    const engine = this.layouts.get(name);
    if (engine) return { engine, state: 'ready' };
    if (loader) return { engine: layered, state: 'missing', need: name };
    if (builtIn(name)) return { engine: layered, state: 'ready' };
    return { engine: layered, state: isElkName(name) && !this.elkRegistered ? 'elk' : 'unknown' };
  }

  /** Loads `name` once; an engine whose loader was replaced while it loaded is dropped. */
  loadLayout(name: string): Promise<void> {
    const loader = this.layoutLoader(name);
    if (!loader || this.layouts.has(name)) return Promise.resolve();
    const inflight = this.layoutLoading.get(name);
    if (inflight?.loader === loader) return inflight.pending;
    const pending: Promise<void> = loader()
      .then((m) => {
        const engine = unwrap<LayoutEngine>(m);
        if (typeof engine !== 'function') throw new TypeError(`Layout "${name}" loaded no engine`);
        if (this.layoutLoader(name) === loader) this.layouts.set(name, engine);
      })
      .finally(() => {
        if (this.layoutLoading.get(name)?.pending === pending) this.layoutLoading.delete(name);
      });
    this.layoutLoading.set(name, { loader, pending });
    return pending;
  }
}

/** The registry row of a third-party diagram (checked; `isPlugin`: given eagerly). */
function diagramEntry(
  def: AnyPlugin | LazyDiagram,
  isPlugin: boolean,
  loadAscii?: () => Promise<AnyAsciiHook>
): Entry {
  checkDiagram(def, isPlugin);
  const load = isPlugin
    ? () => Promise.resolve(def as AnyPlugin)
    : async (): Promise<AnyPlugin> => unwrap<AnyPlugin>(await (def as LazyDiagram).loader());
  return {
    type: def.id,
    id: def.id,
    formats: def.formats ?? ['svg'],
    detect: (_body, clean, config) => def.detector(clean(), config),
    load,
    ...(isPlugin ? { eager: def as AnyPlugin } : {}),
    ...(loadAscii ? { loadAscii } : {}),
  };
}
