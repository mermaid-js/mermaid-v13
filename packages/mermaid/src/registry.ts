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
 * loaded on registration (its activation). `load` imports the manifest's `entry`.
 */
export interface ManifestPlugin {
  /** The `mermaid` value of the plugin's package.json; checked by `readManifest`. */
  readonly manifest: unknown;
  /** The detector module's function (diagrams only). */
  readonly detector?: (text: string, config?: Readonly<Record<string, unknown>>) => boolean;
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

/**
 * One entry of the discovered list (D166): what a discovery path (Node scan, bundler module,
 * CDN queue) found in one package. Detection order among discovered diagrams is by `package`
 * (code-unit order), never by input order. `plugin` is anything `registerExternalDiagrams`
 * takes; `layout` registers each of `names` lazily, as `registerLayoutLoaders` does.
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
  /** `clean` is v12's detector text (third-party detectors), built on first use. */
  readonly detect: (
    body: string,
    clean: () => string,
    config: Readonly<Record<string, unknown>> | undefined
  ) => boolean;
  readonly load?: () => Promise<AnyPlugin>;
  readonly loadAscii?: () => Promise<AnyAsciiHook>;
  /** An eagerly given plugin (no loader): ready as soon as the entry is active. */
  readonly eager?: AnyPlugin;
}

/** A diagram or extension checked and ready to enter a source. */
type Resolved = { readonly extension: ExtensionPlugin } | { readonly diagram: Entry };

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

/**
 * Names the built-in engine answers to until an ELK plugin is registered (DESIGN §6.1): v12's
 * `dagre`, `elk` and the `elk.<algorithm>` names of v12's ELK package.
 */
const FIRST_PARTY_LAYOUTS: ReadonlySet<string> = new Set(['layered', 'dagre']);

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
  /** Explicit extensions, in call order (a repeated id keeps its place). */
  private readonly explicitExtensions: ExtensionPlugin[] = [];
  private readonly plugins = new Map<string, AnyPlugin>();
  private readonly loading = new Map<string, Promise<AnyPlugin>>();
  private readonly asciiHooks = new Map<string, AnyAsciiHook>();
  private readonly layoutLoaders = new Map<string, LayoutLoader['loader']>();
  private discoveredLayouts: (Found<LayoutLoader['loader']> & { readonly name: string })[] = [];
  private readonly layouts = new Map<string, LayoutEngine>([['layered', layered]]);
  private readonly layoutLoading = new Map<
    string,
    { readonly loader: LayoutLoader['loader']; readonly pending: Promise<void> }
  >();

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
        detect: (body) => e.pattern.test(body),
        load: e.load,
        loadAscii: e.loadAscii,
      });
    }
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
    for (const e of this.detectionOrder()) {
      if (e.detect(body, cleaned, config)) return { type: e.type, id: e.id };
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
      if ('extension' in r) {
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
    // One package may give several entries; each (package, kind, id or name) counts once.
    const known = new Set([
      ...this.discovered.map((d) => `${d.package}\0diagram\0${d.value.id}`),
      ...this.discoveredExtensions.map((d) => `${d.package}\0extension\0${d.value.id}`),
      ...this.discoveredLayouts.map((d) => `${d.package}\0layout\0${d.name}`),
    ]);
    const claim = (key: string): void => {
      if (known.has(key)) throw new TypeError('it was already discovered');
      known.add(key);
    };
    for (const item of [...list].sort(byPackage)) {
      const { package: name, kind } = item as { package?: unknown; kind?: unknown };
      const pkg = typeof name === 'string' ? name : '';
      try {
        if (pkg === '') throw new TypeError('it has no package name');
        if (kind !== 'layout' && kind !== 'plugin')
          throw new TypeError(`unknown kind ${JSON.stringify(kind)}`);
        if (item.kind === 'layout') this.discoverLayout(pkg, item, known, skip);
        else this.discoverPlugin(pkg, await this.resolve(item.plugin), claim, skip);
      } catch (e) {
        skip(pkg || '(unnamed)', why(e));
      }
    }
    return warnings;
  }

  private discoverPlugin(
    pkg: string,
    r: Resolved,
    claim: (key: string) => void,
    skip: (pkg: string, reason: string) => void
  ): void {
    if ('extension' in r) {
      const id = r.extension.id;
      claim(`${pkg}\0extension\0${id}`);
      if (this.explicitExtensions.some((e) => e.id === id))
        throw new TypeError(`extension "${id}" is registered explicitly`);
      const owner = this.discoveredExtensions.find((d) => d.value.id === id);
      if (owner && byPackage(owner, { package: pkg }) < 0)
        throw new TypeError(`extension "${id}" belongs to "${owner.package}"`);
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

  private discoverLayout(
    pkg: string,
    item: { readonly names: readonly string[]; readonly loader: LayoutLoader['loader'] },
    known: Set<string>,
    skip: (pkg: string, reason: string) => void
  ): void {
    if (typeof item.loader !== 'function') throw new TypeError('its layout loader is missing');
    if (!Array.isArray(item.names as unknown) || item.names.length === 0)
      throw new TypeError('it names no layouts');
    for (const name of item.names) {
      const key = `${pkg}\0layout\0${String(name)}`;
      let reason: string | undefined;
      const owner = this.discoveredLayouts.find((d) => d.name === name);
      if (typeof (name as unknown) !== 'string' || name === '') reason = 'a layout name is empty';
      else if (known.has(key)) reason = `layout "${name}" was already discovered`;
      else if (FIRST_PARTY_LAYOUTS.has(name)) reason = `"${name}" is a first-party layout`;
      else if (owner && byPackage(owner, { package: pkg }) < 0)
        reason = `layout "${name}" belongs to "${owner.package}"`;
      if (reason !== undefined) {
        skip(pkg, reason);
        continue;
      }
      known.add(key);
      if (owner) skip(owner.package, `layout "${name}" belongs to "${pkg}"`);
      this.discoveredLayouts = [
        ...this.discoveredLayouts.filter((d) => d !== owner),
        { package: pkg, name, value: item.loader },
      ];
      if (!this.layoutLoaders.has(name)) this.forgetLayout(name);
    }
  }

  private forgetLayout(name: string): void {
    this.layouts.delete(name);
    this.layoutLoading.delete(name);
  }

  /** Explicit layout loaders (R-LAYOUT-2); they win over discovered ones of the same name. */
  registerLayouts(loaders: readonly LayoutLoader[]): void {
    for (const l of loaders) {
      this.layoutLoaders.set(l.name, l.loader);
      this.forgetLayout(l.name);
    }
  }

  private layoutLoader(name: string): LayoutLoader['loader'] | undefined {
    return (
      this.layoutLoaders.get(name) ?? this.discoveredLayouts.find((d) => d.name === name)?.value
    );
  }

  /**
   * The engine for a `layout` name: `ready` when loaded, `missing` when registered but not
   * loaded, `unknown` (the built-in engine stands in) when nobody registered it.
   */
  layout(name: string): { engine: LayoutEngine; state: 'ready' | 'missing' | 'unknown' } {
    const engine = this.layouts.get(name);
    if (engine) return { engine, state: 'ready' };
    if (this.layoutLoader(name)) return { engine: layered, state: 'missing' };
    return { engine: layered, state: builtIn(name) ? 'ready' : 'unknown' };
  }

  /** Loads `name` once; an engine whose loader was replaced while it loaded is dropped. */
  loadLayout(name: string): Promise<void> {
    const loader = this.layoutLoader(name);
    if (!loader || this.layouts.has(name)) return Promise.resolve();
    const inflight = this.layoutLoading.get(name);
    if (inflight?.loader === loader) return inflight.pending;
    const pending: Promise<void> = loader()
      .then((m) => {
        if (this.layoutLoader(name) === loader) this.layouts.set(name, unwrap<LayoutEngine>(m));
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
