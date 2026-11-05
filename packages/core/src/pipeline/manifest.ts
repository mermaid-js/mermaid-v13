/**
 * The plugin manifest: the `mermaid` key of a plugin's package.json (DESIGN §12.1, R-PLUG-3,
 * D40, D52, D177). `plugin` is the kind. Diagram manifests name a tiny detector loaded eagerly;
 * extension manifests have none and are loaded when activated; layout manifests name their
 * layouts, registered lazily, and the entry loads when a diagram names one of them.
 */

export type PluginFormat = 'svg' | 'ascii';

export interface DiagramManifest {
  readonly plugin: 'diagram';
  readonly id: string;
  /** Output formats, read by `supportsFormat` without loading the package. Default `['svg']`. */
  readonly formats: readonly PluginFormat[];
  /** Module path of the eager detector. */
  readonly detector?: string;
  /** Module path of the lazily loaded plugin. */
  readonly entry?: string;
  /** The named export holding the plugin (default: the module's default export). */
  readonly export?: string;
  /**
   * Module path of the lazily loaded text-output entry (D76), loaded only for
   * `format: 'ascii'`. Its `ascii` export is the hook. Needs `ascii` in `formats`.
   */
  readonly ascii?: string;
}

export interface ExtensionManifest {
  readonly plugin: 'extension';
  readonly id: string;
  readonly entry?: string;
  readonly export?: string;
}

/**
 * A layout package (D177): `{ "plugin": "layout", "names": [...], "entry", "export"?, "config"? }`.
 * Each name is registered lazily, as `registerLayoutLoaders` does.
 */
export interface LayoutManifest {
  readonly plugin: 'layout';
  /** Optional for layouts (the names identify them); checked as a plugin id when given. */
  readonly id?: string;
  /** The layout names it provides, e.g. `elk`, `elk.stress`. */
  readonly names: readonly string[];
  /** Module path of the lazily loaded layouts. */
  readonly entry: string;
  /**
   * The named export holding them (default: the module's default export): a `LayoutLoader[]`
   * (`{ name, loader }`, looked up by name) or one engine for every name.
   */
  readonly export?: string;
  /**
   * Module path of the eagerly loaded config fragment (D153): its `config` export, else its
   * default export. Activation loads it with the manifest, so the keys are known before the
   * entry loads. Its `extension` export, if any, is the package's extension plugin, run only on
   * renders laid out by one of `names` (ELK's `lineHops`).
   */
  readonly config?: string;
}

export type PluginManifest = DiagramManifest | ExtensionManifest | LayoutManifest;

const FORMATS: ReadonlySet<string> = new Set(['svg', 'ascii']);
const RE_ID = /^[a-z][a-z0-9-]*$/i;
/** A layout name: v12's `elk.sporeOverlap` has dots and capitals. */
const RE_LAYOUT = /^[a-z][a-z0-9.-]*$/i;

const fail = (why: string): never => {
  throw new TypeError(`Invalid mermaid plugin manifest: ${why}`);
};

const optionalString = (m: Record<string, unknown>, key: string): string | undefined => {
  const v = m[key];
  if (v !== undefined && (typeof v !== 'string' || v === '')) fail(`"${key}" must be a string`);
  return v as string | undefined;
};

/**
 * Checks a manifest (the `mermaid` value of a package.json) and returns it typed, with
 * `formats` defaulted. Throws `TypeError` naming the problem. Unknown keys are kept out.
 */
export function readManifest(value: unknown): PluginManifest {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return fail('expected an object');
  const m = value as Record<string, unknown>;
  if (m.plugin === 'layout') return readLayout(m);
  const id = m.id;
  if (typeof id !== 'string' || !RE_ID.test(id)) return fail('"id" must be a plugin id');
  const entry = optionalString(m, 'entry');
  const exp = optionalString(m, 'export');
  const common = {
    id,
    ...(entry !== undefined ? { entry } : {}),
    ...(exp !== undefined ? { export: exp } : {}),
  };
  if (m.plugin === 'extension') {
    if (m.detector !== undefined) fail(`extension "${id}" must not have a detector`);
    if (m.formats !== undefined) fail(`extension "${id}" has no formats`);
    if (m.ascii !== undefined) fail(`extension "${id}" has no ascii entry`);
    return { plugin: 'extension', ...common };
  }
  if (m.plugin !== 'diagram') return fail('"plugin" must be "diagram", "extension" or "layout"');
  const formats = m.formats ?? ['svg'];
  if (!Array.isArray(formats) || formats.length === 0)
    fail(`"formats" of "${id}" must be a non-empty array`);
  for (const f of formats as unknown[])
    if (typeof f !== 'string' || !FORMATS.has(f)) fail(`unknown format ${JSON.stringify(f)}`);
  const detector = optionalString(m, 'detector');
  const ascii = optionalString(m, 'ascii');
  if (ascii !== undefined && !(formats as unknown[]).includes('ascii'))
    fail(`"${id}" has an ascii entry but no "ascii" in formats`);
  return {
    plugin: 'diagram',
    ...common,
    formats: [...new Set(formats as PluginFormat[])],
    ...(detector !== undefined ? { detector } : {}),
    ...(ascii !== undefined ? { ascii } : {}),
  };
}

function readLayout(m: Record<string, unknown>): LayoutManifest {
  const id = m.id;
  if (id !== undefined && (typeof id !== 'string' || !RE_ID.test(id)))
    fail('"id" must be a plugin id');
  const names = m.names;
  if (!Array.isArray(names) || names.length === 0)
    fail('"names" of a layout must be a non-empty array');
  for (const n of names as unknown[]) {
    if (typeof n !== 'string' || !RE_LAYOUT.test(n))
      fail(`layout name ${JSON.stringify(n)} is not a name`);
    // Installing a layout package changes no default (D127, D171).
    if (n === 'layered' || n === 'dagre') fail(`layout name "${n}" is built in`);
  }
  const entry = optionalString(m, 'entry');
  if (entry === undefined) fail('a layout needs an "entry"');
  for (const key of ['detector', 'formats', 'ascii'])
    if (m[key] !== undefined) fail(`a layout has no "${key}"`);
  const exp = optionalString(m, 'export');
  const config = optionalString(m, 'config');
  return {
    plugin: 'layout',
    ...(id !== undefined ? { id: id as string } : {}),
    names: [...new Set(names as string[])],
    entry: entry as string,
    ...(exp !== undefined ? { export: exp } : {}),
    ...(config !== undefined ? { config } : {}),
  };
}
