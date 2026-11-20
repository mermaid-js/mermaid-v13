/**
 * The override matrix of D568 and D654 and the comparison the override specs make with it: the
 * five classic themes, each under no override, under each of `OVERRIDDEN` set alone to the light
 * and the dark test colour, and under `darkMode`.
 *
 * The reference values are literals in each spec (D654): `theme-overrides.spec.ts` for core's
 * shared variables (D568) and `<type>/theme-overrides.spec.ts` for a diagram type's variables.
 * Per classic theme, a reference table holds each variable's v12 12.2.0 value with no override,
 * and only the overrides that change it, with the value they change it to. An override a
 * variable does not list leaves it unchanged. The capture tool prints a table ready to paste,
 * run by hand from the repository root (not part of `pnpm regen`):
 *
 * ```bash
 * pnpm --silent --filter @mermaid-js/conformance exec tsx --conditions=mermaid-source src/cli/capture-theme-overrides.ts pie
 * ```
 *
 * The argument is a type's folder under `packages/conformance/src/` (`pie`, `gitgraph`,
 * `treeView`), or `shared` for core's shared variables. The tables are found from
 * `packages/diagram-<type>/src/theme/table.ts`. With no argument the tool lists every table and
 * how many of its theme / variable pairs v12 resolves. `--check` compares every pasted table
 * with a fresh capture and fails on any byte that differs, on a type that needs a spec and has
 * none, and on a spec for a table v12 resolves no colour of. `--v13` prints, or checks, v13's
 * own values instead, as `V13`, for the rebase at 13.0 (D658).
 *
 * The comparison (D654): a diagram variable that matches the reference with no override must
 * match it under every override; one that differs with no override (listed in the spec's
 * `RESPONSE_ONLY`) must move under exactly the overrides that move the reference. Core's shared
 * variables are compared as values under every override (D568).
 */
import {
  createTheme,
  loadTheme,
  type DiagramThemeTable,
  type ThemeName,
} from '@mermaid-js/core/theme';
import { describe, expect, it } from 'vitest';
import { hex } from './hex.ts';

export const THEMES = [
  'default',
  'dark',
  'forest',
  'neutral',
  'base',
] as const satisfies ThemeName[];
export type Classic = (typeof THEMES)[number];

/**
 * The base colours an author overrides one at a time, each to a light and a dark test colour,
 * and `mainBkg`, which the named classic themes pin (D570) and v12 derives some fills from.
 */
export const OVERRIDDEN = [
  'primaryColor',
  'secondaryColor',
  'tertiaryColor',
  'background',
  'primaryTextColor',
  'lineColor',
  'mainBkg',
] as const;
export const TEST_COLOURS = { light: '#ffd966', dark: '#2a4d69' } as const;

/** The overrides by label: `none`, `<variable>:light`, `<variable>:dark` and `darkMode`. */
export const CASES: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
  none: {},
  ...Object.fromEntries(
    OVERRIDDEN.flatMap((name) =>
      Object.entries(TEST_COLOURS).map(([shade, value]) => [`${name}:${shade}`, { [name]: value }])
    )
  ),
  darkMode: { darkMode: true },
};

/** Every label of `CASES`, `none` first. */
export const ALL: readonly string[] = Object.keys(CASES);

/** One entry per theme / override / variable: `keys('base', ['primaryColor:dark'], ['mainBkg'])`. */
export const keys = (
  theme: Classic,
  cases: readonly string[],
  names: readonly string[]
): string[] => cases.flatMap((c) => names.map((n) => `${theme} / ${c} / ${n}`));

/** A colour as exact hex (D71), or `null` where there is none. */
export type Colour = string | null;

/** One variable's reference: its value with no override, or that and each override that moves it. */
export type Reference = Colour | Readonly<Record<string, Colour>>;
/** One theme's references, by variable. */
export type ThemeReference = Readonly<Record<string, Reference>>;
/** A reference table, per classic theme. */
export type ReferenceTable = Readonly<Record<Classic, ThemeReference>>;

/** The colours of one theme's variables under one label of `CASES`. */
export type Resolve = (label: string) => Readonly<Record<string, Colour | undefined>>;

/** The reference value under one label: the value with no override, unless the label is listed. */
export function referenceAt(ref: Reference, label: string): Colour {
  if (ref === null || typeof ref === 'string') return ref;
  return Object.hasOwn(ref, label) ? ref[label]! : ref.none!;
}

export interface CompareOptions {
  /**
   * D654: where a variable differs from the reference with no override, compare only its
   * response (whether it moves) under each override. Without it, every value is compared, as
   * D568 does for the shared variables.
   */
  readonly response: boolean;
}

/**
 * Each `theme / override / variable` of one theme where v13 differs from the reference. With
 * `response`, a variable that differs with no override is reported once, under `none`, and then
 * only where its response differs.
 */
export function findDifferences(
  theme: Classic,
  reference: ThemeReference,
  resolve: Resolve,
  { response }: CompareOptions
): string[] {
  const at = new Map(ALL.map((label) => [label, resolve(label)]));
  const out: string[] = [];
  for (const [name, ref] of Object.entries(reference)) {
    const now = (label: string): Colour => at.get(label)![name] ?? null;
    const byResponse = response && now('none') !== referenceAt(ref, 'none');
    for (const label of ALL) {
      const differs =
        byResponse && label !== 'none'
          ? (now(label) !== now('none')) !== (referenceAt(ref, label) !== referenceAt(ref, 'none'))
          : now(label) !== referenceAt(ref, label);
      if (differs) out.push(`${theme} / ${label} / ${name}`);
    }
  }
  return out;
}

/** The found differences against the listed ones: each found and not listed, each listed and gone. */
export function reconcile(
  found: readonly string[],
  listed: readonly string[]
): { unlisted: string[]; gone: string[] } {
  return {
    unlisted: found.filter((k) => !listed.includes(k)),
    gone: listed.filter((k) => !found.includes(k)),
  };
}

/**
 * One theme's references from a resolver: each named variable that resolves to a colour with no
 * override, with the overrides that move it.
 */
export function captureReference(names: readonly string[], resolve: Resolve): ThemeReference {
  const at = ALL.map((label) => [label, resolve(label)] as const);
  const out: Record<string, Reference> = {};
  for (const name of names) {
    const none = at[0]![1][name] ?? null;
    if (none === null) continue;
    const moved = at.filter(([, vars]) => (vars[name] ?? null) !== none);
    out[name] =
      moved.length === 0
        ? none
        : {
            none,
            ...Object.fromEntries(moved.map(([label, vars]) => [label, vars[name] ?? null])),
          };
  }
  return out;
}

const WIDTH = 100;
const prop = (key: string): string => (/^[A-Za-z_$][\w$]*$/.test(key) ? key : `'${key}'`);
const literal = (c: Colour): string => (c === null ? 'null' : `'${c}'`);

function formatEntry(name: string, ref: Reference): string {
  const indent = '    ';
  if (ref === null || typeof ref === 'string') return `${indent}${prop(name)}: ${literal(ref)},`;
  const props = Object.entries(ref).map(([k, v]) => `${prop(k)}: ${literal(v)}`);
  const line = `${indent}${prop(name)}: { ${props.join(', ')} },`;
  if (line.length <= WIDTH) return line;
  return [`${indent}${prop(name)}: {`, ...props.map((p) => `${indent}  ${p},`), `${indent}},`].join(
    '\n'
  );
}

/**
 * A reference table as one TypeScript statement, `const <name>: ReferenceTable = {…};`, in the
 * form Prettier leaves alone, so the capture tool's output is pasted byte for byte.
 */
export function formatReference(name: string, table: ReferenceTable): string {
  const lines = [`const ${name}: ReferenceTable = {`];
  for (const theme of THEMES) {
    const entries = Object.entries(table[theme]);
    if (entries.length === 0) lines.push(`  ${theme}: {},`);
    else lines.push(`  ${theme}: {`, ...entries.map(([n, r]) => formatEntry(n, r)), '  },');
  }
  lines.push('};', '');
  return lines.join('\n');
}

/** The colour variables of a diagram table (D331). */
export const tableColours = (table: DiagramThemeTable): string[] =>
  Object.entries(table.vars)
    .filter(([, d]) => d.kind === 'color')
    .map(([name]) => name);

/**
 * v13's colours of `names` in one classic theme, under each label of `CASES`: core's shared
 * variables, or with `table`, that diagram table's variables.
 */
export async function v13Resolver(
  theme: Classic,
  names: readonly string[],
  table?: DiagramThemeTable
): Promise<Resolve> {
  const spec = await loadTheme(theme);
  const at = new Map(
    ALL.map((label) => {
      const t = createTheme(spec, {
        cssVariables: false,
        themeVariables: CASES[label] as Record<string, unknown>,
        ...(table ? { diagram: table } : {}),
      });
      return [
        label,
        Object.fromEntries(names.map((n) => [n, hex(t.value(n), () => null)])),
      ] as const;
    })
  );
  return (label) => at.get(label)!;
}

/**
 * A group's key: the decision that accounts for it, with a MIGRATION row citing it (D654). A
 * ticket's group (`#1035 T<n>`) is not one: spec #1035 closed them all (#1043).
 */
export const GROUP = /^D\d+\b/;

export interface OverrideSpec {
  /** The reference values, pasted from the capture tool. */
  readonly reference: ReferenceTable;
  /** Each difference from the reference, keyed `theme / override / variable`, grouped (`GROUP`). */
  readonly differences: Readonly<Record<string, readonly string[]>>;
}

export interface DiagramOverrideSpec extends OverrideSpec {
  /**
   * Each variable that differs from the reference with no override, keyed
   * `theme / none / variable`: a difference the type's no-override spec accounts for, so this
   * spec compares only the variable's response (D654).
   */
  readonly responseOnly: readonly string[];
}

/**
 * The tests of D568's spec: core's shared variables, each compared as a value under every
 * override.
 */
export function describeSharedOverrides(spec: OverrideSpec): void {
  describeOverrides(spec, [], undefined);
}

/**
 * The tests of a diagram type's override spec (D654): its table's variables, each compared as a
 * value where it matches the reference with no override, and by its response where it does not.
 */
export function describeDiagramOverrides(
  table: DiagramThemeTable | undefined,
  { responseOnly, ...spec }: DiagramOverrideSpec
): void {
  if (!table) throw new Error('the diagram has no theme table');
  it('lists only differences with no override as compared by their response', () => {
    for (const key of responseOnly) expect(key.split(' / ')[1], key).toBe('none');
  });
  describeOverrides(spec, responseOnly, table);
}

/**
 * The tests of one override spec: the listed differences are well formed, and in each theme
 * under each override v13 differs from the reference exactly where they say. With a table, a
 * variable that differs with no override is compared by its response.
 */
function describeOverrides(
  { reference, differences }: OverrideSpec,
  responseOnly: readonly string[],
  table: DiagramThemeTable | undefined
): void {
  const response = table !== undefined;
  const listed = [...Object.values(differences).flat(), ...responseOnly];
  const colours = table ? tableColours(table) : undefined;

  it('lists each difference once, keyed by a theme, an override and a compared variable', () => {
    expect(new Set(listed).size).toBe(listed.length);
    for (const key of listed) {
      const [theme, label, name] = key.split(' / ');
      expect(THEMES, key).toContain(theme);
      expect(ALL, key).toContain(label);
      if (THEMES.includes(theme as Classic)) {
        expect(Object.keys(reference[theme as Classic]), key).toContain(name);
      }
    }
  });

  it('names a decision for each group (D568, D654)', () => {
    for (const why of Object.keys(differences)) expect(why).toMatch(GROUP);
  });

  if (colours) {
    it("compares only the table's colour variables", () => {
      for (const theme of THEMES) {
        for (const name of Object.keys(reference[theme])) expect(colours, name).toContain(name);
      }
    });
  }

  describe.each(THEMES)('%s', (theme) => {
    const names = Object.keys(reference[theme]);
    let found: Promise<string[]> | undefined;
    const differing = (): Promise<string[]> =>
      (found ??= v13Resolver(theme, names, table).then((resolve) =>
        findDifferences(theme, reference[theme], resolve, { response })
      ));
    it.each(ALL)('%s: differs from the reference only where the lists say', async (label) => {
      const at = (entries: readonly string[]): string[] =>
        entries.filter((k) => k.startsWith(`${theme} / ${label} / `));
      expect(reconcile(at(await differing()), at(listed))).toEqual({ unlisted: [], gone: [] });
    });
  });
}
