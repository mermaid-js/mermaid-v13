/**
 * The plugin manifest: the `mermaid` key of a plugin's package.json (DESIGN §12.1, R-PLUG-3,
 * D40, D52). `plugin` is the kind. Diagram manifests name a tiny detector loaded eagerly;
 * extension manifests have none and are loaded when activated.
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
}

export interface ExtensionManifest {
  readonly plugin: 'extension';
  readonly id: string;
  readonly entry?: string;
  readonly export?: string;
}

export type PluginManifest = DiagramManifest | ExtensionManifest;

const FORMATS: ReadonlySet<string> = new Set(['svg', 'ascii']);
const RE_ID = /^[a-z][a-z0-9-]*$/i;

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
    return { plugin: 'extension', ...common };
  }
  if (m.plugin !== 'diagram') return fail('"plugin" must be "diagram" or "extension"');
  const formats = m.formats ?? ['svg'];
  if (!Array.isArray(formats) || formats.length === 0)
    fail(`"formats" of "${id}" must be a non-empty array`);
  for (const f of formats as unknown[])
    if (typeof f !== 'string' || !FORMATS.has(f)) fail(`unknown format ${JSON.stringify(f)}`);
  const detector = optionalString(m, 'detector');
  return {
    plugin: 'diagram',
    ...common,
    formats: [...new Set(formats as PluginFormat[])],
    ...(detector !== undefined ? { detector } : {}),
  };
}
