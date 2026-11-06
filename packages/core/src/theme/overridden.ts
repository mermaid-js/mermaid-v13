// A theme's parts built from `themeVariables` overrides, kept by the overrides' values so a
// render that repeats them (front matter on every render) does not build them again (#276).
import type { ThemeSpec } from './spec.ts';
import type { ThemeWarning } from './theme.ts';

/** What one build gave: the parts, and the warnings checking the overrides gave. */
export interface Kept<P> {
  readonly parts: P;
  readonly warnings: readonly ThemeWarning[];
}

const MAX_KEPT = 16;
const KEPT = new WeakMap<ThemeSpec, Map<ThemeSpec | undefined, Map<string, Kept<unknown>>>>();

const scalar = (v: unknown): string | undefined => {
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') return Number.isFinite(v) ? `n${v}` : undefined;
  if (typeof v === 'boolean' || v === null) return String(v);
  return undefined;
};

/**
 * The overrides as a key: names and values in order, for strings, finite numbers, booleans,
 * null and lists of those. Anything else gives no key, and the parts are built afresh.
 */
export function overridesKey(tv: Readonly<Record<string, unknown>>): string | undefined {
  let key = '';
  for (const name of Object.keys(tv)) {
    const v = tv[name];
    if (v === undefined) continue;
    let part: string | undefined;
    if (Array.isArray(v)) {
      part = '[';
      for (const item of v as unknown[]) {
        const s = scalar(item);
        if (s === undefined) return undefined;
        part += s + ',';
      }
    } else part = scalar(v);
    if (part === undefined) return undefined;
    key += JSON.stringify(name) + ':' + part + ';';
  }
  return key;
}

/** The parts kept for `spec` and `dark` under `key`, with their warnings given again to `warn`. */
export function keptParts(
  spec: ThemeSpec,
  dark: ThemeSpec | undefined,
  key: string,
  warn: ((w: ThemeWarning) => void) | undefined
): unknown {
  const hit = KEPT.get(spec)?.get(dark)?.get(key);
  if (!hit) return undefined;
  for (const w of hit.warnings) warn?.({ ...w });
  return hit.parts;
}

/** Keeps `kept` for `spec` and `dark` under `key`, a few keys per spec. */
export function keepParts<P>(
  spec: ThemeSpec,
  dark: ThemeSpec | undefined,
  key: string,
  kept: Kept<P>
): void {
  let byDark = KEPT.get(spec);
  if (!byDark)
    KEPT.set(spec, (byDark = new Map<ThemeSpec | undefined, Map<string, Kept<unknown>>>()));
  let byKey = byDark.get(dark);
  if (!byKey) byDark.set(dark, (byKey = new Map<string, Kept<unknown>>()));
  if (byKey.size >= MAX_KEPT) byKey.clear();
  byKey.set(key, kept);
}
