/**
 * Harvests a parity corpus for one Langium type (R-TEST-3, DESIGN §13.1, D220): the sources
 * v12's specs for the type wrote, plus the examples of v12's syntax page, read from git at the
 * last v12 commit. The result is committed as `corpus/<type>-v12-specs.json`, next to the e2e
 * fixtures. Repeated sources are kept once.
 *
 * A type is a {@link LangiumHarvest} in {@link LANGIUM_HARVEST}. Spec files are read one of two
 * ways: `literals` takes every string literal whose raw text passes `header` (pie's specs
 * write each source out), `run` runs the spec with its imports stubbed and records every
 * string passed to the named parse functions that passes `header` (radar's specs build most of
 * theirs: `mutateGlobalSpacing`, templates on `context`, a `ticks` loop).
 */
import { execFileSync } from 'node:child_process';
import { stripTypeScriptTypes } from 'node:module';
import { join } from 'node:path';
import { REPO_ROOT } from './corpus.ts';
import { runSpec, V12_COMMIT } from './jison/harvest.ts';
import type { LangiumLexerType } from './langium-lexer.ts';
import type { CorpusItem } from './types.ts';

/** One spec file run with stubs: which names record their arguments. */
interface RunFile {
  file: string;
  /** Objects whose `parse` / `parser.parse` record their argument (`parser.parse(str)`). */
  parsers?: readonly string[];
  /** Functions that record each argument (`parse(str)`, `parseAsync('radar', str)`). */
  functions?: readonly string[];
}

/** How to harvest one Langium type. */
export interface LangiumHarvest {
  /** Spec files whose string literals are sources. */
  literals?: readonly string[];
  /** Spec files run with stubs. */
  run?: readonly RunFile[];
  /** A source's test: on the raw literal text (`literals`) or the recorded string (`run`). */
  header: RegExp;
  /** The syntax page, under `packages/mermaid/src/docs/syntax/`. */
  docs: string;
}

const RADAR_DIR = 'packages/mermaid/src/diagrams/radar';

/** The Langium types with a harvested corpus, by v13 diagram id. */
export const LANGIUM_HARVEST = {
  pie: {
    literals: [
      'packages/mermaid/src/diagrams/pie/pie.spec.ts',
      'packages/mermaid/src/diagrams/pie/pieRenderer.spec.ts',
      'packages/parser/tests/pie.test.ts',
    ],
    header: /^\s*(?:\\[nt])*\s*pie(?![\w.])/,
    docs: 'pie.md',
  },
  radar: {
    run: [
      { file: `${RADAR_DIR}/radar.spec.ts`, parsers: ['parser', 'mermaidAPI'] },
      { file: 'packages/parser/tests/radar.test.ts', functions: ['parse', 'parseAsync'] },
    ],
    header: /radar-beta/,
    docs: 'radar.md',
  },
} as const satisfies Partial<Record<LangiumLexerType, LangiumHarvest>>;

export type LangiumHarvestType = keyof typeof LANGIUM_HARVEST;

/** Where `harvest:langium <type>` writes the type's corpus. */
export function langiumHarvestPath(type: LangiumHarvestType): string {
  return join(REPO_ROOT, 'packages/conformance/corpus', `${type}-v12-specs.json`);
}

const git = (...args: string[]) =>
  execFileSync('git', ['-C', REPO_ROOT, ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });

/** The corpus `harvest:langium <type>` writes, in file order, without duplicate sources. */
export async function harvestLangium(type: LangiumHarvestType): Promise<CorpusItem[]> {
  const spec: LangiumHarvest = LANGIUM_HARVEST[type];
  const items: CorpusItem[] = [];
  const seen = new Set<string>();
  const add = (id: string, source: string) => {
    if (seen.has(source)) return;
    seen.add(source);
    items.push({ id, source });
  };
  const show = (file: string) => git('show', `${V12_COMMIT}:${file}`);
  const idOf = (file: string, n: number) =>
    `v12-specs/${file.slice(file.lastIndexOf('/') + 1)}#${n}`;

  for (const file of spec.literals ?? []) {
    let n = 0;
    for (const m of show(file).matchAll(LITERAL)) {
      const raw = m[1] ?? m[2] ?? m[3] ?? '';
      if (!spec.header.test(raw) || raw.includes('${')) continue;
      add(idOf(file, ++n), unescape(raw));
    }
  }
  for (const { file, parsers = [], functions = [] } of spec.run ?? []) {
    let n = 0;
    const record = (source: unknown) => {
      if (typeof source === 'string' && spec.header.test(source)) add(idOf(file, ++n), source);
    };
    await runSpec(stripTypeScriptTypes(show(file)), parsers, record, functions);
  }
  const page = show(`packages/mermaid/src/docs/syntax/${spec.docs}`);
  let k = 0;
  for (const m of page.matchAll(/```mermaid(?:-example)?\n([\s\S]*?)```/g)) {
    add(`v12-docs/${spec.docs}#${++k}`, m[1] ?? '');
  }
  return items;
}

const LITERAL = /`((?:[^`\\]|\\.)*)`|'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g;

const ESCAPES: Record<string, string> = {
  n: '\n',
  r: '\r',
  t: '\t',
  b: '\b',
  f: '\f',
  v: '\v',
  0: '\0',
};

/** The value of a JS string literal's body: its escapes decoded, line continuations dropped. */
function unescape(raw: string): string {
  return raw.replace(/\\(u\{[\da-f]+\}|u[\da-f]{4}|x[\da-f]{2}|\r\n|[\s\S])/gi, (_, e: string) => {
    if (/^[ux]/i.test(e) && e.length > 1)
      return String.fromCodePoint(parseInt(e.replace(/[ux{}]/gi, ''), 16));
    if (e === '\n' || e === '\r\n' || e === '\r') return '';
    return ESCAPES[e] ?? e;
  });
}
