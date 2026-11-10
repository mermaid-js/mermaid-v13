import type { DiagramThemeTable } from './diagram.ts';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';
import type { ThemeRuleTable } from './spec.ts';
import type { ThemeVarEntry } from './vocabulary.ts';

const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

export function themeDefinitions(
  table: DiagramThemeTable | undefined,
  rules: ThemeRuleTable | undefined
): { defs: Record<string, ThemeVarEntry>; fragment: Record<string, string> } {
  const defs: Record<string, ThemeVarEntry> = { ...THEME_VARIABLE_TABLE };
  // A fragment's rule for a name the diagram's own table defines loses to the table (D337). A
  // table var that shadows a core name is ignored, so it takes no fragment rule away either.
  const fragment: Record<string, string> = {};
  for (const [name, r] of Object.entries(rules ?? {})) {
    if (table && own(table.vars, name) && !own(THEME_VARIABLE_TABLE, name)) continue;
    fragment[name] = r;
    if (!own(defs, name)) defs[name] = { alias: name, kind: 'color' };
  }
  for (const [name, v] of Object.entries(table?.vars ?? {}))
    if (!own(THEME_VARIABLE_TABLE, name)) defs[name] = v;
  return { defs, fragment };
}

/** Identity inputs select an independent, bounded set of value variants. */
type Level<T> = WeakMap<object, Level<T> | Map<string, T>>;
export class ThemeCache<T> {
  private readonly root: Level<T> = new WeakMap();

  variants(keys: readonly object[]): Map<string, T> {
    let level = this.root;
    for (const key of keys.slice(0, -1)) {
      let next = level.get(key) as Level<T> | undefined;
      if (!next) level.set(key, (next = new WeakMap()));
      level = next;
    }
    const last = keys[keys.length - 1]!;
    let variants = level.get(last) as Map<string, T> | undefined;
    if (!variants) level.set(last, (variants = new Map()));
    return variants;
  }
}

/** Sort only checked entries: no author object, getter or toJSON participates in the key. */
const sorted = <T>(entries: Iterable<readonly [string, T]>): (readonly [string, T])[] =>
  [...entries].sort(([a], [b]) => {
    if (a === b) return 0;
    return a < b ? -1 : 1;
  });

export function themeValueKey(
  authorDark: boolean,
  overrides: ReadonlyMap<string, string>,
  palettes: readonly {
    readonly user: Readonly<Partial<Record<string, readonly string[]>>>;
    readonly slots: ReadonlyMap<string, string>;
  }[]
): string {
  return JSON.stringify([
    authorDark,
    sorted(overrides),
    ...palettes.map((p) => [sorted(Object.entries(p.user)), sorted(p.slots)]),
  ]);
}
