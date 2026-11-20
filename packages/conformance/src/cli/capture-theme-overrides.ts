/**
 * Prints a reference table of the override specs (D654) for pasting: v12 12.2.0's colours of one
 * diagram type's theme table, or of core's shared variables (`shared`), in the five classic
 * themes under the override matrix. Run by hand, not part of `pnpm regen`; `override-matrix.ts`
 * says how. `--check` compares every pasted table with a fresh capture; `--v13` prints (or
 * checks) v13's values instead, as `V13`, for the rebase at 13.0 (D658).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { THEME_VARIABLES, type DiagramThemeTable } from '@mermaid-js/core/theme';
import { captureTable, checkPasted, findTables, v12Colour } from '../override-capture.ts';
import {
  ALL,
  CASES,
  THEMES,
  formatReference,
  tableColours,
  v13Resolver,
  type Classic,
  type ReferenceTable,
  type Resolve,
} from '../override-matrix.ts';
import { loadOracle } from '../oracle.ts';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const V12_VERSION = '12.2.0';

interface Target {
  /** The folder under `packages/conformance/src/`, or `shared`. */
  readonly type: string;
  /** The diagram table; none for core's shared variables. */
  readonly table?: DiagramThemeTable;
  /** The spec the table is pasted into. */
  readonly spec: string;
}

const targets: Target[] = [{ type: 'shared', spec: join(SRC, 'theme-overrides.spec.ts') }];
for (const { type, path } of findTables(SRC, join(SRC, '../..'))) {
  const { theme } = (await import(pathToFileURL(path).href)) as { theme: DiagramThemeTable };
  targets.push({ type, table: theme, spec: join(SRC, type, 'theme-overrides.spec.ts') });
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

/** v12's colours of `names` in one theme, under each label of the matrix. */
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
      return [label, Object.fromEntries(names.map((n) => [n, v12Colour(old, n, table)]))] as const;
    })
  );
  return (label) => at.get(label)!;
}

const SHARED_COLOURS = Object.entries(THEME_VARIABLES)
  .filter(([, d]) => d.kind === 'color')
  .map(([name]) => name);

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const type = args.find((a) => !a.startsWith('--'));
const name = flags.has('--v13') ? 'V13' : 'V12';
const api = name === 'V12' ? await v12() : undefined;

function capture({ table }: Target): Promise<ReferenceTable> {
  const names = table ? tableColours(table) : SHARED_COLOURS;
  return captureTable(names, (theme) =>
    api ? Promise.resolve(v12Resolver(api, theme, names, table)) : v13Resolver(theme, names, table)
  );
}

const count = (table: ReferenceTable): number =>
  THEMES.reduce((sum, t) => sum + Object.keys(table[t]).length, 0);

if (flags.has('--check')) {
  const problems: string[] = [];
  for (const target of targets) {
    const spec = existsSync(target.spec) ? readFileSync(target.spec, 'utf8') : undefined;
    const problem = checkPasted(target.type, await capture(target), spec, name);
    if (problem) problems.push(problem);
  }
  const ok = `${targets.length} tables checked: every pasted table matches\n`;
  process.stdout.write(problems.length ? `${problems.join('\n')}\n` : ok);
  process.exitCode = problems.length ? 1 : 0;
} else if (type === undefined) {
  for (const target of targets) {
    process.stdout.write(
      `${target.type}\t${count(await capture(target))} theme / variable pairs\n`
    );
  }
} else {
  const target = targets.find((t) => t.type === type);
  if (target) process.stdout.write(formatReference(name, await capture(target)));
  else {
    process.stderr.write(`unknown type ${type}: one of ${targets.map((t) => t.type).join(', ')}\n`);
    process.exitCode = 2;
  }
}
