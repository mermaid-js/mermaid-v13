/**
 * Plugin config fragments (D153, D177, DESIGN §12.1): a plugin's own config keys with their
 * defaults, its theme variables, and the legacy keys that alias to its own. Core adds the
 * fragments of the registered plugins to the validator, so their keys are known only while
 * the plugin is registered. Core never names a plugin: the fragment carries everything.
 */
import type { KeyTree } from './keys.ts';

/**
 * A legacy key that maps to one of the plugin's keys. In each config source (`initialize()`,
 * front matter, a directive) that sets `from`, the value moves to `to` before the schema
 * check, unless that source sets `to` itself. With `when`, only that value is aliased; other
 * values stay where they are (and are checked as usual).
 */
export interface ConfigAlias {
  /** Dotted path of the legacy key, e.g. `look`. */
  readonly from: string;
  /** Dotted path of the plugin's key, e.g. `handDrawn.enabled`. */
  readonly to: string;
  /** Alias only this value of `from`. */
  readonly when?: string | number | boolean;
  /** What `to` gets; default: the value of `from`. */
  readonly value?: unknown;
}

/** A plugin's config fragment. Generated from its schema fragment by `pnpm gen:config`. */
export interface ConfigFragment {
  /** Who owns it (the plugin id); one fragment per id, a later registration replaces it. */
  readonly id: string;
  /** The plugin's keys by top-level key, as the key tree core's schema generates. */
  readonly keys: Readonly<Record<string, KeyTree>>;
  /** Defaults of those keys, merged over core's defaults and below everything else. */
  readonly defaults?: Readonly<Record<string, unknown>>;
  readonly aliases?: readonly ConfigAlias[];
  /**
   * The plugin's own theme variables, each with its default as a derivation rule or a value
   * (`'mix(primaryColor, white, 20%)'`, `'#333'`). A theme variable core already has is an error.
   */
  readonly themeVariables?: Readonly<Record<string, string>>;
}

const RE_KEY = /^[A-Za-z_$][\w$-]*$/;
const POLLUTION = new Set(['__proto__', 'constructor', 'prototype']);

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function checkTree(tree: unknown, at: string, id: string): void {
  if (tree === 0 || tree === 'open' || tree === 'removed' || tree === 'moved') return;
  if (!isObject(tree)) throw new TypeError(`Config fragment "${id}": bad key tree at "${at}"`);
  for (const [k, child] of Object.entries(tree)) {
    if (POLLUTION.has(k)) throw new TypeError(`Config fragment "${id}": key "${k}" is not allowed`);
    checkTree(child, at === '' ? k : `${at}.${k}`, id);
  }
}

function checkPath(path: unknown, what: string, id: string): void {
  const ok =
    typeof path === 'string' &&
    path.split('.').every((part) => RE_KEY.test(part) && !POLLUTION.has(part));
  if (!ok) throw new TypeError(`Config fragment "${id}": alias ${what} must be a dotted key path`);
}

/**
 * Checks a fragment a plugin brings and returns it. Throws `TypeError` naming the problem.
 * `taken` lists the theme variables core already defines.
 */
export function checkFragment(
  value: unknown,
  taken: ReadonlySet<string> = new Set()
): ConfigFragment {
  if (!isObject(value) || typeof value.id !== 'string' || value.id === '')
    throw new TypeError('A config fragment needs a non-empty string id');
  const id = value.id;
  if (!isObject(value.keys)) throw new TypeError(`Config fragment "${id}": keys must be an object`);
  checkTree(value.keys, '', id);
  if (value.defaults !== undefined && !isObject(value.defaults))
    throw new TypeError(`Config fragment "${id}": defaults must be an object`);
  if (value.aliases !== undefined) {
    if (!Array.isArray(value.aliases))
      throw new TypeError(`Config fragment "${id}": aliases must be an array`);
    for (const a of value.aliases as unknown[]) {
      if (!isObject(a)) throw new TypeError(`Config fragment "${id}": an alias must be an object`);
      checkPath(a.from, '"from"', id);
      checkPath(a.to, '"to"', id);
    }
  }
  if (value.themeVariables !== undefined) {
    if (!isObject(value.themeVariables))
      throw new TypeError(`Config fragment "${id}": themeVariables must be an object`);
    for (const [name, rule] of Object.entries(value.themeVariables)) {
      if (typeof rule !== 'string')
        throw new TypeError(`Config fragment "${id}": theme variable "${name}" needs a string`);
      if (taken.has(name) || POLLUTION.has(name))
        throw new TypeError(
          `Config fragment "${id}": theme variable "${name}" is core's; name the plugin's own`
        );
    }
  }
  return value as unknown as ConfigFragment;
}

/** `tree` with each fragment's keys merged in (objects merge; a fragment's leaf wins). */
export function withFragments(
  tree: Readonly<Record<string, KeyTree>>,
  fragments: readonly ConfigFragment[]
): Record<string, KeyTree> {
  const merged = (a: KeyTree | undefined, b: KeyTree): KeyTree => {
    if (typeof a !== 'object' || typeof b !== 'object') return b;
    const out: Record<string, KeyTree> = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = merged(out[k], v);
    return out;
  };
  const out: Record<string, KeyTree> = { ...tree };
  for (const f of fragments)
    for (const [k, v] of Object.entries(f.keys)) out[k] = merged(out[k], v);
  return out;
}

/**
 * Applies the aliases to one config source: returns a copy with each aliased `from` moved to
 * its `to`, or `input` itself when no alias applies.
 */
export function applyAliases(
  input: Readonly<Record<string, unknown>>,
  aliases: readonly ConfigAlias[]
): Readonly<Record<string, unknown>> {
  let out: Record<string, unknown> | undefined;
  for (const a of aliases) {
    const from = a.from.split('.');
    const src = out ?? input;
    const v = get(src, from);
    if (v === undefined || (a.when !== undefined && v !== a.when)) continue;
    out ??= copy(input);
    remove(out, from);
    const to = a.to.split('.');
    if (get(out, to) === undefined) set(out, to, a.value === undefined ? v : a.value);
  }
  return out ?? input;
}

function get(obj: Readonly<Record<string, unknown>>, path: readonly string[]): unknown {
  let at: unknown = obj;
  for (const p of path) {
    if (!isObject(at) || !Object.hasOwn(at, p)) return undefined;
    at = at[p];
  }
  return at;
}

// Copies along `path` (shallow per level), so the caller's objects are never changed.
function copy(obj: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = isObject(v) ? copy(v) : v;
  return out;
}

function remove(obj: Record<string, unknown>, path: readonly string[]): void {
  let at: Record<string, unknown> = obj;
  for (const p of path.slice(0, -1)) {
    const next = at[p];
    if (!isObject(next)) return;
    at = next;
  }
  delete at[path[path.length - 1]!];
}

function set(obj: Record<string, unknown>, path: readonly string[], value: unknown): void {
  let at: Record<string, unknown> = obj;
  for (const p of path.slice(0, -1)) {
    const next = at[p];
    at = at[p] = isObject(next) ? next : {};
  }
  at[path[path.length - 1]!] = value;
}
