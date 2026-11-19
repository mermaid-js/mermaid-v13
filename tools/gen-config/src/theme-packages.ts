/**
 * The diagram packages' own theme vocabularies (spec #414 T0b, D331, D337).
 *
 * A package that owns theme variables lists them in `src/theme/vocabulary.ts` as
 * `THEME_VARIABLES`, in core's shape (`packages/core/src/theme/vocabulary.ts`: alias, kind,
 * usedBy) plus the nested key under its table's section (D540). `pnpm gen:theme` writes the
 * runtime half, without `usedBy`, to `src/theme/generated/variables.ts` as
 * `THEME_VARIABLE_TABLE`, which the plugin's `DiagramThemeTable.vars` takes. The table itself
 * (rules and family entries) is the `theme` of the plugin `src/index.ts` exports.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type {
  DiagramThemeTable,
  DiagramThemeVar,
  DiagramThemeVarDef,
} from '../../../packages/core/src/theme/diagram.ts';
import type { ThemeVarEntry } from '../../../packages/core/src/theme/vocabulary.ts';
import { readWiring } from '../../workspace/diagrams.ts';

/** The repository's `packages/` directory, where the `diagram-*` packages are. */
export const PACKAGES = fileURLToPath(new URL('../../../packages', import.meta.url));

/** A package's `THEME_VARIABLES`: each row by name, with `usedBy` and its nested key. */
export type Vocabulary = Readonly<Record<string, DiagramThemeVarDef>>;

/** A diagram package's theme files, as {@link themePackages} finds them. */
export interface ThemePackage {
  /** The diagram type: the package directory without `diagram-` (`usedBy`'s name for it). */
  readonly type: string;
  readonly dir: string;
  /** `src/theme/vocabulary.ts`'s `THEME_VARIABLES`, when the package has one. */
  readonly vocabulary?: Vocabulary;
  /** `src/theme/vocabulary.ts`'s optional `THEME_NOTE`: one line for the inventory doc. */
  readonly note?: string;
  /**
   * `workspace.yaml`'s optional `theme.dynamicReads`: names the package builds at run time
   * (`pie${slot + 1}`), which {@link themeReads}' scan for literals can't see.
   */
  readonly dynamicReads?: readonly string[];
  /**
   * `workspace.yaml`'s optional `theme.notDrawnYet: true`: the port has not reached layout,
   * so its sources read no theme variable yet (the usedBy spec holds it to none).
   */
  readonly notDrawnYet?: boolean;
  /**
   * `workspace.yaml`'s optional `theme.listedAhead`: core rows this type is listed on in
   * core's `usedBy` before its sources read them (a core T0 that moved them landed first). Each
   * must be unread, so an entry goes as soon as the type reads it.
   */
  readonly listedAhead?: readonly string[];
  /**
   * `workspace.yaml`'s optional `theme.someThemes`: table rows set only in the themes v12
   * sets them in, which the theme-tables spec lets resolve to `currentColor` elsewhere (#374).
   */
  readonly someThemes?: readonly string[];
  /**
   * `workspace.yaml`'s optional `theme.authorOnly`: table rows only an author sets, which
   * resolve to `currentColor` in every theme while unset.
   */
  readonly authorOnly?: readonly string[];
  /** The `theme` of the plugin `src/index.ts` exports, when it has one. */
  readonly table?: DiagramThemeTable;
}

/** A package's vocabulary file, `src/theme/vocabulary.ts`. */
export const vocabularyPath = (dir: string): string => join(dir, 'src/theme/vocabulary.ts');
/** The file `gen:theme` writes from a package's vocabulary, `src/theme/generated/variables.ts`. */
export const generatedPath = (dir: string): string => join(dir, 'src/theme/generated/variables.ts');

/** The theme table on a plugin a module exports (an object with `id`, `render` and `theme`). */
function pluginTable(mod: Record<string, unknown>): DiagramThemeTable | undefined {
  for (const v of Object.values(mod)) {
    if (typeof v !== 'object' || v === null) continue;
    const p = v as { id?: unknown; render?: unknown; theme?: DiagramThemeTable };
    if (typeof p.render === 'function' && typeof p.id === 'string' && p.theme) return p.theme;
  }
  return undefined;
}

async function load(path: string): Promise<Record<string, unknown> | undefined> {
  if (!existsSync(path)) return undefined;
  return (await import(pathToFileURL(path).href)) as Record<string, unknown>;
}

/**
 * Every `diagram-*` package under `root`, in name order, with its vocabulary and table. With
 * `tables: 'vocabulary'` only the packages with a vocabulary load their plugin, so `gen:theme`
 * imports no diagram while none has one.
 */
export async function themePackages(
  root = PACKAGES,
  { tables = 'all' }: { tables?: 'all' | 'vocabulary' } = {}
): Promise<ThemePackage[]> {
  const dirs = readdirSync(root)
    .filter((d) => d.startsWith('diagram-'))
    .sort();
  const out: ThemePackage[] = [];
  for (const d of dirs) {
    const dir = join(root, d);
    const vocabularyModule = await load(vocabularyPath(dir));
    const vocabulary = vocabularyModule?.THEME_VARIABLES as Vocabulary | undefined;
    const note = vocabularyModule?.THEME_NOTE as string | undefined;
    // The per-package theme spec data lives in the unpublished workspace.yaml, not in the
    // package's sources, so it ships in no dist file.
    const { dynamicReads, notDrawnYet, listedAhead, someThemes, authorOnly } =
      readWiring(dir).theme ?? {};
    const index =
      tables === 'all' || vocabulary ? await load(join(dir, 'src/index.ts')) : undefined;
    const table = index && pluginTable(index);
    out.push({
      type: d.slice('diagram-'.length),
      dir,
      ...(vocabulary && { vocabulary }),
      ...(note !== undefined && { note }),
      ...(dynamicReads && { dynamicReads }),
      ...(notDrawnYet === true && { notDrawnYet: true }),
      ...(listedAhead && { listedAhead }),
      ...(someThemes && { someThemes }),
      ...(authorOnly && { authorOnly }),
      ...(table && { table }),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------- reads

/** A package's sources a read scan looks at: its `.ts` files, without specs and generated ones. */
function sources(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'generated' ? [] : sources(path);
    // A vocabulary declares names; it reads none.
    if (path.endsWith(join('src', 'theme', 'vocabulary.ts'))) return [];
    return e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts') ? [path] : [];
  });
}

const SHARED = join(PACKAGES, 'shared');

/**
 * Shared subpaths whose exports each read their own variables (one shape, one set of paddings):
 * an importer reads only those of the exports it uses, so it names them in its `workspace.yaml`
 * `theme.dynamicReads` and the scan does not follow the import.
 */
const PER_EXPORT: ReadonlySet<string> = new Set(['shapes/kit', 'shapes/basic', 'shapes/extended']);

/** The `mermaid-source` file of each `@mermaid-js/shared` subpath, by subpath (`svg/route`). */
function sharedEntries(): Map<string, string> {
  const manifest = join(SHARED, 'package.json');
  if (!existsSync(manifest)) return new Map();
  const { exports = {} } = JSON.parse(readFileSync(manifest, 'utf8')) as {
    exports?: Record<string, { 'mermaid-source'?: string }>;
  };
  return new Map(
    Object.entries(exports).flatMap(([key, target]) => {
      const source = target['mermaid-source'];
      return source === undefined ? [] : [[key.replace(/^\.\//, ''), join(SHARED, source)]];
    })
  );
}

/** The text of every `@mermaid-js/shared` file that `text` imports, directly or through one. */
function sharedSources(text: string): string[] {
  const entries = sharedEntries();
  const seen = new Set<string>();
  const queue = [...text.matchAll(/'@mermaid-js\/shared\/([\w/-]+)'/g)].flatMap((m) => {
    const entry = PER_EXPORT.has(m[1]!) ? undefined : entries.get(m[1]!);
    return entry === undefined ? [] : [entry];
  });
  const out: string[] = [];
  for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    const body = readFileSync(file, 'utf8');
    out.push(body);
    for (const m of body.matchAll(/from '(\.{1,2}\/[\w./-]+\.ts)'/g)) {
      queue.push(join(dirname(file), m[1]!));
    }
  }
  return out;
}

/**
 * The theme variables each package's sources read (#207), by type. A diagram reads a variable
 * by passing its name as a string literal to a call, either a `Theme` method
 * (`theme.color('lineColor')`) or a local helper over one (`n('extensionMarkerGap')`), or
 * through a table of names (`glyphBand: 'actorGlyphBand'`), or in a table rule as `inline(name)`
 * (D332) or `slot(palette, n, name)` (D474), which reads both; a var's `nested:` key is v12's
 * name and an element's `class:` an SVG class, not a read. Names the package builds at run time
 * are its `workspace.yaml` `theme.dynamicReads`. Only names in `known` (core's and every
 * package's vocabulary) count.
 */
export function themeReads(
  packages: readonly Pick<ThemePackage, 'type' | 'dir' | 'dynamicReads'>[],
  known: ReadonlySet<string>
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const { type, dir, dynamicReads = [] } of packages) {
    const own = sources(join(dir, 'src')).map((f) => readFileSync(f, 'utf8'));
    // A read made on the package's behalf by `@mermaid-js/shared` code is the package's read.
    const text = [...own, ...sharedSources(own.join('\n'))].join('\n');
    const names = [
      ...[...text.matchAll(/(?:\b\w+\(|\b(?!(?:nested|class)\b)\w+:)\s*'(\w+)'/g)].map(
        (m) => m[1]!
      ),
      // A table rule's `inline(name)` or `inline(name, fallback)`: a shared input read as the
      // theme wrote it (D332).
      ...[...text.matchAll(/\binline\((\w+)[,)]/g)].map((m) => m[1]!),
      // A table rule's `slot(palette, n, fallback)`: the palette's slot where the palette is
      // non-empty, else the fallback (D474), so both are read.
      ...[...text.matchAll(/\bslot\((\w+),\s*\d+,\s*(\w+)\)/g)].flatMap((m) => [m[1]!, m[2]!]),
    ];
    out.set(type, new Set([...names, ...dynamicReads].filter((n) => known.has(n))));
  }
  return out;
}

/** Every name a diagram may read: core's and every package's vocabulary. */
export function knownNames(
  core: Readonly<Record<string, unknown>>,
  packages: readonly Pick<ThemePackage, 'vocabulary'>[]
): Set<string> {
  return new Set([
    ...Object.keys(core),
    ...packages.flatMap((p) => Object.keys(p.vocabulary ?? {})),
  ]);
}

/**
 * A core row's users as the inventory lists them: core's own `usedBy` as written (it was kept by
 * hand until every type was found from its sources, and it stays as it was so core's bytes do
 * not move), then every other diagram package whose sources read the row (`reads`), sorted. So
 * a port never edits core's vocabulary to list itself: its reads list it.
 */
export function coreUsers(
  name: string,
  listed: readonly string[],
  reads: ReadonlyMap<string, ReadonlySet<string>>
): string[] {
  const readers = [...reads].filter(([, set]) => set.has(name)).map(([type]) => type);
  return [...listed, ...readers.filter((t) => !listed.includes(t)).sort()];
}

/**
 * The used-by rule for core rows: a diagram package core's `usedBy` names must read the row, or
 * name it in its `theme.listedAhead` (listed before its renderer reads it); each such row
 * must be listed and unread. A reader need not be listed: {@link coreUsers} adds it.
 */
export function coreListedErrors(
  core: Readonly<Record<string, { readonly usedBy: readonly string[] }>>,
  packages: readonly Pick<ThemePackage, 'type' | 'listedAhead'>[],
  reads: ReadonlyMap<string, ReadonlySet<string>>
): string[] {
  const out: string[] = [];
  const byType = new Map(packages.map((p) => [p.type, p]));
  for (const [name, { usedBy }] of Object.entries(core))
    for (const type of usedBy) {
      const pkg = byType.get(type);
      if (pkg === undefined || reads.get(type)?.has(name) === true) continue;
      if (!(pkg.listedAhead ?? []).includes(name))
        out.push(`core \`${name}\`: lists ${type}, which neither reads it nor lists it ahead`);
    }
  for (const { type, listedAhead = [] } of packages)
    for (const name of listedAhead) {
      if (!(core[name]?.usedBy ?? []).includes(type))
        out.push(`${type}: LISTED_AHEAD \`${name}\` is not listed on core's row`);
      if (reads.get(type)?.has(name) === true)
        out.push(`${type}: LISTED_AHEAD \`${name}\` is read now; drop it from LISTED_AHEAD`);
    }
  return out;
}

/** A vocabulary's runtime half: each row without `usedBy`, as a table's `vars` holds it. */
export function runtimeVars(vocabulary: Vocabulary): Record<string, DiagramThemeVar> {
  return Object.fromEntries(
    Object.entries(vocabulary).map(([name, { alias, kind, nested }]) => [
      name,
      nested === undefined ? { alias, kind } : { alias, kind, nested },
    ])
  );
}

/**
 * `src/theme/generated/variables.ts`: the vocabulary's runtime half as one string of name, alias,
 * kind and nested key (`-` for none), split in a `@__PURE__` call so a bundle that never reads
 * it drops it, and smaller gzipped than objects, as core's table is.
 */
export function packageTable(vocabulary: Vocabulary): string {
  const rows = Object.entries(vocabulary).map(
    ([name, d]) => `${name} ${d.alias} ${d.kind} ${d.nested ?? '-'}`
  );
  return [
    '// Generated by tools/gen-config from src/theme/vocabulary.ts.',
    '// Do not edit: run `pnpm gen:theme`.',
    '',
    "import type { DiagramThemeVar, ThemeVarKind } from '@mermaid-js/core/theme';",
    '',
    'function table(text: string): Record<string, DiagramThemeVar> {',
    "  const rows = text.split(' ');",
    '  const out: Record<string, DiagramThemeVar> = {};',
    '  for (let i = 0; i < rows.length; i += 4) {',
    '    const alias = rows[i + 1]!;',
    '    const kind = rows[i + 2] as ThemeVarKind;',
    '    const nested = rows[i + 3]!;',
    "    out[rows[i]!] = nested === '-' ? { alias, kind } : { alias, kind, nested };",
    '  }',
    '  return out;',
    '}',
    '',
    "/** The diagram's theme variables, for `DiagramThemeTable.vars`: `THEME_VARIABLES` without `usedBy`. */",
    'export const THEME_VARIABLE_TABLE: Readonly<Record<string, DiagramThemeVar>> =',
    `  /* @__PURE__ */ table('${rows.join(' ')}');`,
    '',
  ].join('\n');
}

/**
 * First-party name uniqueness at build time (D337): no name or alias in a package's vocabulary
 * is core's or another package's, and no nested key repeats within a package (D540). Aliases are
 * the private `--_<alias>` properties of one root, so they must be unique too.
 */
export function vocabularyCollisions(
  core: Readonly<Record<string, ThemeVarEntry>>,
  packages: readonly Pick<ThemePackage, 'type' | 'vocabulary'>[]
): string[] {
  const out: string[] = [];
  const names = new Map<string, string>(Object.keys(core).map((n) => [n, 'core']));
  const aliases = new Map<string, string>(
    Object.entries(core).map(([n, d]) => [d.alias, `core's \`${n}\``])
  );
  for (const { type, vocabulary } of packages) {
    const nested = new Map<string, string>();
    for (const [name, d] of Object.entries(vocabulary ?? {})) {
      const n = names.get(name);
      if (n === undefined) names.set(name, type);
      else out.push(`${type}: \`${name}\` is also ${n}'s`);
      const a = aliases.get(d.alias);
      if (a === undefined) aliases.set(d.alias, `${type}'s \`${name}\``);
      else out.push(`${type}: \`${name}\`'s alias \`${d.alias}\` is also ${a}'s`);
      if (d.nested === undefined) continue;
      const m = nested.get(d.nested);
      if (m === undefined) nested.set(d.nested, name);
      else out.push(`${type}: \`${name}\`'s nested key \`${d.nested}\` is also \`${m}\`'s`);
    }
  }
  return out;
}

/**
 * The used-by rule for package rows (spec #414 T0b): only its own type reads a package's row,
 * since a row two types read belongs in core, and its `usedBy` lists that type exactly when the
 * package's sources read it. `reads` holds the names each type's sources read.
 */
export function packageReadErrors(
  packages: readonly Pick<ThemePackage, 'type' | 'vocabulary'>[],
  reads: ReadonlyMap<string, ReadonlySet<string>>
): string[] {
  const out: string[] = [];
  for (const { type, vocabulary } of packages)
    for (const [name, d] of Object.entries(vocabulary ?? {})) {
      for (const [other, set] of reads)
        if (other !== type && set.has(name))
          out.push(`${type}: \`${name}\` is read by ${other} too; a shared row belongs in core`);
      const expected = reads.get(type)?.has(name) === true ? [type] : [];
      if (d.usedBy.join() !== expected.join())
        out.push(
          `${type}: \`${name}\` lists usedBy [${d.usedBy.join(', ')}], its sources say [${expected.join(', ')}]`
        );
    }
  return out;
}
