/**
 * Prints a reference table of the override specs (D654) for pasting: v12 12.2.0's colours of one
 * diagram type's theme table, or of core's shared variables (`shared`), in the five classic
 * themes under the override matrix. Run by hand, not part of `pnpm regen`; `override-matrix.ts`
 * says how. `--check` compares every pasted table with a fresh capture; `--v13` prints (or
 * checks) v13's values instead, as `V13`, for the rebase at 13.0 (D658).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { THEME_VARIABLES, type DiagramThemeTable } from '@mermaid-js/core/theme';
import {
  ALL,
  CASES,
  THEMES,
  captureReference,
  formatReference,
  hex,
  tableColours,
  v13Resolver,
  type Classic,
  type ReferenceTable,
  type Resolve,
  type ThemeReference,
} from '../override-matrix.ts';
import { loadOracle } from '../oracle.ts';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = join(SRC, '../..');
const V12_VERSION = '12.2.0';

interface Target {
  /** The folder under `packages/conformance/src/`, or `shared`. */
  readonly type: string;
  /** The diagram table; none for core's shared variables. */
  readonly table?: DiagramThemeTable;
  /** The spec the table is pasted into. */
  readonly spec: string;
}

/** Every first-party diagram theme table, found from `packages/diagram-<type>/src/theme/table.ts`. */
async function targets(): Promise<Target[]> {
  const folders = readdirSync(SRC, { withFileTypes: true }).filter((d) => d.isDirectory());
  const out: Target[] = [{ type: 'shared', spec: join(SRC, 'theme-overrides.spec.ts') }];
  for (const dir of readdirSync(PACKAGES).sort()) {
    const path = join(PACKAGES, dir, 'src/theme/table.ts');
    if (!dir.startsWith('diagram-') || !existsSync(path)) continue;
    const name = dir.slice('diagram-'.length);
    const type = folders.find((f) => f.name.toLowerCase() === name)?.name ?? name;
    const { theme } = (await import(pathToFileURL(path).href)) as { theme: DiagramThemeTable };
    out.push({ type, table: theme, spec: join(SRC, type, 'theme-overrides.spec.ts') });
  }
  return out;
}

interface V12 {
  mermaidAPI: {
    reset(): void;
    initialize(config: object): void;
    getConfig(): { themeVariables: Record<string, unknown> };
  };
}

async function v12(): Promise<V12> {
  const { version } = await loadOracle();
  if (version !== V12_VERSION) throw new Error(`mermaid-v12 is ${version}, not ${V12_VERSION}`);
  return ((await import('mermaid-v12')) as unknown as { default: V12 }).default;
}

/**
 * v12's colours in one theme, under each label: the flat name, or for a table with a `section`,
 * the variable's nested key there (D335), as `diagram-themes.ts` `v12Value()` reads it.
 */
function v12Resolver(
  api: V12,
  theme: Classic,
  names: readonly string[],
  table?: DiagramThemeTable
): Resolve {
  const at = new Map(
    ALL.map((label) => {
      api.mermaidAPI.reset();
      api.mermaidAPI.initialize({ theme, themeVariables: CASES[label] });
      const old = { ...api.mermaidAPI.getConfig().themeVariables };
      api.mermaidAPI.reset();
      const read = (name: string): unknown => {
        if (Object.hasOwn(old, name)) return old[name];
        const nested = table?.vars[name]?.nested;
        const block = table?.section === undefined ? undefined : old[table.section];
        return nested !== undefined && block && typeof block === 'object'
          ? (block as Record<string, unknown>)[nested]
          : undefined;
      };
      return [label, Object.fromEntries(names.map((n) => [n, hex(read(n))]))] as const;
    })
  );
  return (label) => at.get(label)!;
}

const SHARED_COLOURS = Object.entries(THEME_VARIABLES)
  .filter(([, d]) => d.kind === 'color')
  .map(([name]) => name);

type Source = 'v12' | 'v13';

async function capture(target: Target, source: Source): Promise<ReferenceTable> {
  const names = target.table ? tableColours(target.table) : SHARED_COLOURS;
  const api = source === 'v12' ? await v12() : undefined;
  const out: Partial<Record<Classic, ThemeReference>> = {};
  for (const theme of THEMES) {
    const resolve = api
      ? v12Resolver(api, theme, names, target.table)
      : await v13Resolver(theme, names, target.table);
    out[theme] = captureReference(names, resolve);
  }
  return out as ReferenceTable;
}

const isEmpty = (table: ReferenceTable): boolean =>
  THEMES.every((t) => Object.keys(table[t]).length === 0);

/** Each pasted table against a fresh capture: the problems found, none when all match. */
async function check(all: readonly Target[], source: Source): Promise<string[]> {
  const problems: string[] = [];
  for (const target of all) {
    const table = await capture(target, source);
    const has = existsSync(target.spec);
    if (isEmpty(table)) {
      if (has) problems.push(`${target.type}: no colour of its table resolves, but it has a spec`);
      continue;
    }
    if (!has) problems.push(`${target.type}: no ${target.spec}`);
    else if (
      !readFileSync(target.spec, 'utf8').includes(formatReference(source.toUpperCase(), table))
    )
      problems.push(`${target.type}: the pasted table differs from a fresh capture`);
  }
  return problems;
}

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const type = args.find((a) => !a.startsWith('--'));
const all = await targets();
const source: Source = flags.has('--v13') ? 'v13' : 'v12';

if (flags.has('--check')) {
  const problems = await check(all, source);
  process.stdout.write(
    problems.length
      ? `${problems.join('\n')}\n`
      : `${all.length} tables checked: every pasted table matches\n`
  );
  process.exitCode = problems.length ? 1 : 0;
} else if (type === undefined) {
  for (const target of all) {
    const table = await capture(target, source);
    const n = THEMES.reduce((sum, t) => sum + Object.keys(table[t]).length, 0);
    process.stdout.write(
      `${target.type}\t${isEmpty(table) ? 'no colour v12 resolves' : `${n} theme / variable pairs`}\n`
    );
  }
} else {
  const target = all.find((t) => t.type === type);
  if (!target) {
    process.stderr.write(`unknown type ${type}: one of ${all.map((t) => t.type).join(', ')}\n`);
    process.exitCode = 2;
  } else {
    process.stdout.write(formatReference(source.toUpperCase(), await capture(target, source)));
  }
}
