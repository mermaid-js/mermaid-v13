/**
 * `resolveConfig`: one render's config sources merged in v12's order into a frozen object
 * (DESIGN §9, R-CONF-1…5, R-ARCH-5, D72).
 *
 * Merge order, lowest first: core defaults, the diagram plugin's section defaults,
 * `initialize()`, front matter `config`, then each `%%{init}%%` directive in source order.
 * This mirrors v12's `config.ts` (`setSiteConfig`, `addDirective`, `updateCurrentConfig`,
 * `resolveAppearance`) and `utils/sanitizeDirective.ts`, without global state.
 */
import { deepFreeze } from './freeze.ts';
import { KEY_NOTES, KEY_TREE } from './generated/keys.ts';
import type { MermaidConfig } from './generated/config.type.ts';
import type { KeyTree } from './keys.ts';

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer U)[]
    ? readonly DeepReadonly<U>[]
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

/** The frozen config every stage of one render reads. */
export type ResolvedConfig = DeepReadonly<MermaidConfig>;

/** Config as read from diagram text: any shape, checked against the schema here. */
export type ConfigInput = Readonly<Record<string, unknown>>;

export type ConfigSource = 'initialize' | 'frontMatter' | 'directive';

export type ConfigWarningCode =
  /** The key is not in the schema. Dropped when it comes from diagram text. */
  | 'CONFIG_UNKNOWN_KEY'
  /** The key was removed in v13 and has no effect. */
  | 'CONFIG_REMOVED_KEY'
  /** The key now belongs to another package (`movedTo`). */
  | 'CONFIG_MOVED_KEY'
  /** Diagram text tried to set a secure or integrator-only key. */
  | 'CONFIG_SECURE_KEY'
  /** Diagram text gave a value v12's directive sanitiser rejects. */
  | 'CONFIG_UNSAFE_VALUE'
  /** `look` was set somewhere; it is ignored (D153). At most one per resolve. */
  | 'LOOK_REMOVED';

export interface ConfigWarning {
  readonly code: ConfigWarningCode;
  readonly message: string;
  /** Dotted key path, e.g. `flowchart.htmlLabels`. */
  readonly path: string;
  readonly source: ConfigSource;
}

export interface ResolveConfigOptions {
  /** Receives every warning; a render passes `ctx.warn`. */
  readonly warn?: (warning: ConfigWarning) => void;
  /**
   * The config section of the diagram being rendered (e.g. `flowchart`), for the
   * diagram-scoped `theme` and `layout`. Defaults to the single top-level key
   * of `pluginDefaults`, when it has exactly one.
   */
  readonly section?: string;
}

/**
 * Keys diagram text can never set, whatever `secure` says (R-SEC-5, R-SEC-6, DESIGN §9):
 * v12's default `secure` list plus v13's integrator options. Some of these are render
 * options rather than schema keys; they are listed so diagram text naming them is
 * reported as a secure-key attempt rather than an unknown key.
 */
export const INTEGRATOR_ONLY_KEYS: readonly string[] = Object.freeze([
  'secure',
  'securityLevel',
  'startOnLoad',
  'maxTextSize',
  'maxEdges',
  'suppressErrorRendering',
  'limits',
  'measurer',
  'deterministic',
  'idPrefix',
  'output',
  'linkSchemes',
  'discovery',
  'cdnBase',
]);

/** Never copied from any source: they would reach `Object.prototype` on assignment. */
const POLLUTION_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const APPEARANCE_KEYS = ['theme', 'layout'] as const;

const ignore = (): void => undefined;

/** v12 `sanitizeDirective`: theme variables from diagram text must match this. */
const THEME_VARIABLE_VALUE = /^[\d "#%(),.;A-Za-z]+$/;
const CSS_KEYS = ['themeCSS', 'fontFamily', 'altFontFamily'];

type Plain = Record<string, unknown>;

const isPlainObject = (value: unknown): value is Plain =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Merges one render's config sources into a new, deep-frozen config.
 *
 * Never throws on bad config: unknown, removed and secure keys, and unsafe values, are
 * reported through `options.warn`. Diagram text (front matter and directives) cannot set
 * secure or integrator-only keys and loses its unknown keys; `initialize()` keeps its
 * unknown keys, as v12 did, but is still warned about them. Keys of diagram types that are
 * not ported yet are schema keys and pass silently (R-CONF-5).
 *
 * The same as `resolveText(resolveSite(…), …)`; a caller rendering many diagrams with one
 * `initialize()` keeps the site and resolves only the text.
 *
 * @param defaults - core defaults, normally `CORE_DEFAULTS`.
 * @param initialize - what the integrator passed to `initialize()`.
 * @param frontMatter - the `config` object of the diagram's front matter, already parsed.
 * @param directives - the objects of `%%{init}%%` directives, already parsed, in source order.
 * @param pluginDefaults - the diagram plugin's section defaults, e.g. `{ flowchart: {...} }`.
 */
export function resolveConfig(
  defaults: DeepReadonly<MermaidConfig>,
  initialize?: DeepReadonly<MermaidConfig>,
  frontMatter?: ConfigInput,
  directives: readonly ConfigInput[] = [],
  pluginDefaults?: DeepReadonly<MermaidConfig>,
  options: ResolveConfigOptions = {}
): ResolvedConfig {
  const site = resolveSite(defaults, initialize, pluginDefaults, options);
  return resolveText(site, frontMatter, directives, options);
}

/**
 * The integrator's side of a config, before any diagram text: core defaults, the plugin's
 * section defaults and `initialize()`, merged and frozen. Its warnings went to the `warn` it
 * was resolved with; a caller that keeps a site replays them itself.
 */
export interface ResolvedSite {
  /** The config when the diagram text sets none. */
  readonly plain: ResolvedConfig;
  readonly base: Readonly<Plain>;
  readonly site: Readonly<Plain>;
  readonly plugin: Readonly<Plain>;
  readonly defaults: Readonly<Plain>;
  readonly tree: Readonly<Record<string, KeyTree>>;
  readonly secure: ReadonlySet<string>;
  readonly section: string | undefined;
  /** Whether `initialize()` already earned the one `LOOK_REMOVED` warning. */
  readonly lookWarned: boolean;
}

/** Resolves the integrator's side of a config (see {@link resolveConfig}). */
export function resolveSite(
  defaults: DeepReadonly<MermaidConfig>,
  initialize?: DeepReadonly<MermaidConfig>,
  pluginDefaults?: DeepReadonly<MermaidConfig>,
  options: ResolveConfigOptions = {}
): ResolvedSite {
  const warn = options.warn ?? ignore;
  const looks = lookStripper(warn);
  const plugin = looks.strip(clone(pluginDefaults ?? {}) as Plain);
  // A section the plugin brings that the schema does not know (a third-party diagram)
  // is its own business: accept whatever keys it gets.
  const tree: Record<string, KeyTree> = { ...(KEY_TREE as Record<string, KeyTree>) };
  for (const key of Object.keys(plugin)) {
    tree[key] ??= 'open';
  }

  const base = looks.strip(clone(defaults) as Plain);
  merge(base, plugin);
  const site = check(
    looks.strip(clone(initialize ?? {}) as Plain, 'initialize'),
    tree,
    'initialize',
    warn
  );
  merge(base, site);

  // Secure keys come from the integrator's side only, merged as v12 merged arrays (union),
  // so `initialize({ secure })` can extend the list but not shrink it.
  const secure = new Set<string>([...INTEGRATOR_ONLY_KEYS, ...stringList(base.secure)]);
  const section = options.section ?? soleKey(plugin);
  const layers = {
    base: deepFreeze(base),
    site: deepFreeze(site),
    plugin: deepFreeze(plugin),
    defaults: deepFreeze(looks.strip(clone(defaults) as Plain)),
  };
  return {
    plain: layered(layers, section, {}),
    ...layers,
    tree,
    secure,
    section,
    lookWarned: looks.warned(),
  };
}

/** Merges diagram text (front matter, then directives) over a resolved site. */
export function resolveText(
  site: ResolvedSite,
  frontMatter?: ConfigInput,
  directives: readonly ConfigInput[] = [],
  options: Pick<ResolveConfigOptions, 'warn'> = {}
): ResolvedConfig {
  if (frontMatter === undefined && directives.length === 0) return site.plain;
  const warn = options.warn ?? ignore;
  const looks = lookStripper(warn, site.lookWarned);
  // v12 fed front matter and directives through one `addDirective` layer.
  const text: Plain = {};
  const sources: [ConfigInput | undefined, ConfigSource][] = [
    [frontMatter, 'frontMatter'],
    ...directives.map((d): [ConfigInput, ConfigSource] => [d, 'directive']),
  ];
  for (const [input, source] of sources) {
    if (input === undefined) {
      continue;
    }
    const allowed: Plain = {};
    for (const [key, value] of Object.entries(looks.strip({ ...input }, source))) {
      if (site.secure.has(key)) {
        warn({
          code: 'CONFIG_SECURE_KEY',
          path: key,
          source,
          message: `Config key "${key}" can only be set by the integrator, not by diagram text; ignored.`,
        });
      } else {
        allowed[key] = value;
      }
    }
    merge(text, check(allowed, site.tree, source, warn));
  }
  if (typeof text.fontFamily === 'string') {
    const vars = isPlainObject(text.themeVariables) ? text.themeVariables : {};
    if (vars.fontFamily === undefined) {
      text.themeVariables = { ...vars, fontFamily: text.fontFamily };
    }
  }
  return layered(site, site.section, text);
}

// The site's base with `text` merged over it, appearance resolved, frozen. Parts `text` does
// not touch stay shared with the (frozen) site.
function layered(
  layers: Pick<ResolvedSite, 'base' | 'site' | 'plugin' | 'defaults'>,
  section: string | undefined,
  text: Plain
): ResolvedConfig {
  const config: Plain = { ...layers.base };
  merge(config, text);
  resolveAppearance(config, section, [text, layers.site, layers.plugin, layers.defaults]);
  return deepFreeze(config) as ResolvedConfig;
}

/**
 * `look` is removed (D153): whatever value it has, at the top level or in any section, it
 * is dropped before the schema check, so it is never a `CONFIG_UNKNOWN_KEY` and never reaches
 * the resolved config. The first one a user source sets earns one `LOOK_REMOVED` warning;
 * defaults (core or plugin) are stripped silently. A plugin that wants `look: handDrawn` as
 * an alias claims it through the plugin config mechanism (D153), not here.
 */
function lookStripper(warn: (w: ConfigWarning) => void, already = false) {
  let warned = already;
  const report = (path: string, source: ConfigSource | undefined) => {
    if (warned || source === undefined) {
      return;
    }
    warned = true;
    const note = KEY_NOTES.look;
    warn({
      code: 'LOOK_REMOVED',
      path,
      source,
      message: [
        `Config key "${path}" is ignored: \`look\` was removed in ${note?.since ?? 'v13'}.`,
        note?.replacement === undefined ? undefined : `Replacement: ${note.replacement}.`,
      ]
        .filter((s) => s !== undefined)
        .join(' '),
    });
  };
  /** Removes `look` from `config` and its sections in place; `source` undefined = silent. */
  const strip = (config: Plain, source?: ConfigSource): Plain => {
    if ('look' in config) {
      delete config.look;
      report('look', source);
    }
    for (const [key, value] of Object.entries(config)) {
      if (key !== 'themeVariables' && isPlainObject(value) && 'look' in value) {
        const copy = { ...value };
        delete copy.look;
        config[key] = copy;
        report(`${key}.look`, source);
      }
    }
    return config;
  };
  return { strip, warned: () => warned };
}

/**
 * v12 `resolveAppearance`: `theme` and `layout` land on the top level, highest first:
 * diagram text, `initialize()`, the diagram's default, the global default. Within a layer
 * the diagram-scoped value beats the global one. (v12 also passed over unknown theme names;
 * that check belongs with the theme registry, core/theme.)
 */
function resolveAppearance(config: Plain, section: string | undefined, layers: Plain[]) {
  const scopedOf = (layer: Plain): Plain | undefined => {
    const value = section === undefined ? undefined : layer[section];
    return isPlainObject(value) ? value : undefined;
  };
  let scoped = scopedOf(config);
  for (const key of APPEARANCE_KEYS) {
    for (const layer of layers) {
      const value = [scopedOf(layer)?.[key], layer[key]].find((v) => typeof v === 'string');
      if (value === undefined) {
        continue;
      }
      config[key] = value;
      if (scoped?.[key] !== undefined && scoped[key] !== value) {
        if (Object.isFrozen(scoped)) config[section as string] = scoped = { ...scoped };
        scoped[key] = value;
      }
      break;
    }
  }
}

/** Copies `input`, checking every key against the schema tree and sanitising diagram text. */
function check(
  input: unknown,
  tree: Record<string, KeyTree>,
  source: ConfigSource,
  warn: (w: ConfigWarning) => void
): Plain {
  const fromText = source !== 'initialize';

  const walkObject = (value: Plain, node: KeyTree, path: string): Plain => {
    const out: Plain = {};
    for (const [key, child] of Object.entries(value)) {
      if (POLLUTION_KEYS.has(key) || child === undefined || child === null) {
        continue;
      }
      const at = path === '' ? key : `${path}.${key}`;
      const childNode = typeof node === 'object' ? node[key] : 'open';
      if (childNode === undefined) {
        warn({
          code: 'CONFIG_UNKNOWN_KEY',
          path: at,
          source,
          message: fromText
            ? `Unknown config key "${at}"; ignored.`
            : `Unknown config key "${at}".`,
        });
        if (!fromText) {
          out[key] = clone(child);
        }
        continue;
      }
      if (childNode === 'removed' || childNode === 'moved') {
        const note = KEY_NOTES[at];
        const moved = childNode === 'moved';
        warn({
          code: moved ? 'CONFIG_MOVED_KEY' : 'CONFIG_REMOVED_KEY',
          path: at,
          source,
          message: [
            moved
              ? `Config key "${at}" moved to ${note?.movedTo ?? 'another package'}.`
              : `Config key "${at}" was removed in ${note?.since ?? 'v13'} and has no effect.`,
            note?.reason,
            note?.replacement === undefined ? undefined : `Replacement: ${note.replacement}.`,
          ]
            .filter((s) => s !== undefined)
            .join(' '),
        });
        if (moved) {
          out[key] = clone(child);
        }
        continue;
      }
      const kept = walkValue(child, childNode, at, key);
      if (kept !== undefined) {
        out[key] = kept;
      }
    }
    return out;
  };

  const walkValue = (value: unknown, node: KeyTree, path: string, key: string): unknown => {
    if (isPlainObject(value)) {
      const out = walkObject(value, node, path);
      if (fromText && key === 'themeVariables') {
        for (const [name, v] of Object.entries(out)) {
          if (typeof v === 'string' && !THEME_VARIABLE_VALUE.test(v)) {
            out[name] = '';
          }
        }
      }
      return out;
    }
    if (Array.isArray(value)) {
      return value.map((item, i) => walkValue(item, node, `${path}.${i}`, key));
    }
    if (fromText && typeof value === 'string') {
      if (value.includes('<') || value.includes('>') || value.includes('url(data:')) {
        warn({
          code: 'CONFIG_UNSAFE_VALUE',
          path,
          source,
          message: `Config value of "${path}" contains markup or a data URL; ignored.`,
        });
        return undefined;
      }
      if (CSS_KEYS.some((css) => key.includes(css))) {
        return balancedCss(value);
      }
    }
    return value;
  };

  return isPlainObject(input) ? walkObject(input, tree as KeyTree, '') : {};
}

/** v12 `sanitizeCss`. */
function balancedCss(value: string): string {
  let open = 0;
  let close = 0;
  for (const ch of value) {
    if (open < close) {
      return '{ /* ERROR: Unbalanced CSS */ }';
    }
    if (ch === '{') {
      open++;
    } else if (ch === '}') {
      close++;
    }
  }
  return open === close ? value : '{ /* ERROR: Unbalanced CSS */ }';
}

/**
 * Deep-merges `src` into `dst` as v12's `assignWithDepth` did: arrays union, nullish skipped.
 * Frozen objects and arrays in `dst` are shared with a resolved site: they are copied, not changed.
 */
function merge(dst: Plain, src: Plain): void {
  for (const [key, value] of Object.entries(src)) {
    if (value === undefined || value === null || POLLUTION_KEYS.has(key)) {
      continue;
    }
    const current = dst[key];
    if (isPlainObject(value)) {
      if (isPlainObject(current)) {
        const into = Object.isFrozen(current) ? { ...current } : current;
        dst[key] = into;
        merge(into, value);
      } else {
        const fresh: Plain = {};
        merge(fresh, value);
        dst[key] = fresh;
      }
    } else if (Array.isArray(value) && Array.isArray(current)) {
      const into = Object.isFrozen(current) ? [...(current as unknown[])] : current;
      dst[key] = into;
      for (const item of value) {
        if (!into.includes(item)) {
          into.push(clone(item));
        }
      }
    } else {
      dst[key] = clone(value);
    }
  }
}

/** A mutable deep copy of plain data, skipping pollution keys. */
function clone(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(clone);
  }
  if (isPlainObject(value)) {
    const out: Plain = {};
    for (const [key, child] of Object.entries(value)) {
      if (!POLLUTION_KEYS.has(key)) {
        out[key] = clone(child);
      }
    }
    return out;
  }
  return value;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function soleKey(value: Plain): string | undefined {
  const keys = Object.keys(value);
  return keys.length === 1 ? keys[0] : undefined;
}
