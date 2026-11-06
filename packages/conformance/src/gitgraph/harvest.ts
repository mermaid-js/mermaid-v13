/**
 * Harvests gitGraph's v12 parity corpus (R-TEST-3, DESIGN §13.1), read from git at the last v12
 * commit: every source `gitGraph.spec.ts` passes to `parser.parse` (the spec is run with its
 * imports stubbed, so `+` chains and the `__proto__`/`constructor` loop give their real text),
 * the string literals of `@mermaid-js/parser`'s `gitGraph.test.ts` and of the in-source tests
 * of `gitGraphParser.ts` and `gitGraphRenderer.ts` (they build ASTs, not sources: none today),
 * and the examples of v12's gitGraph syntax page. Repeated sources are kept once. Committed as
 * `corpus/gitGraph-v12-specs.json`; `harvest.spec.ts` keeps the two equal.
 */
import { execFileSync } from 'node:child_process';
import { stripTypeScriptTypes } from 'node:module';
import { join } from 'node:path';
import { REPO_ROOT } from '../corpus.ts';
import { runSpec, unescape, V12_COMMIT } from '../jison/harvest.ts';
import type { CorpusItem } from '../types.ts';

/** Where the harvest is committed. */
export const GITGRAPH_HARVEST = join(
  REPO_ROOT,
  'packages/conformance/corpus/gitGraph-v12-specs.json'
);

const GIT = 'packages/mermaid/src/diagrams/git';
const SPEC = `${GIT}/gitGraph.spec.ts`;
/** Files whose sources are string literals, and where in each to look. */
const LITERAL_FILES: readonly [file: string, from: RegExp | undefined][] = [
  ['packages/parser/tests/gitGraph.test.ts', undefined],
  [`${GIT}/gitGraphParser.ts`, /if \(import\.meta\.vitest\)/],
  [`${GIT}/gitGraphRenderer.ts`, /if \(import\.meta\.vitest\)/],
];
const DOCS = 'packages/mermaid/src/docs/syntax/gitgraph.md';
const HEADER = /^\s*gitGraph/;
const LITERAL = /`((?:[^`\\]|\\.)*)`|'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g;

const show = (file: string) =>
  execFileSync('git', ['-C', REPO_ROOT, 'show', `${V12_COMMIT}:${file}`], {
    encoding: 'utf8',
    maxBuffer: 1 << 26,
  });
const name = (file: string) => file.slice(file.lastIndexOf('/') + 1);

/** The corpus, in file order, without repeated sources. */
export function harvestGitGraph(): CorpusItem[] {
  const items: CorpusItem[] = [];
  const seen = new Set<string>();
  const add = (id: string, source: string) => {
    if (seen.has(source)) return;
    seen.add(source);
    items.push({ id, source });
  };

  let n = 0;
  runSpec(stripTypeScriptTypes(show(SPEC)), ['parser'], (source) => {
    n++;
    if (typeof source === 'string') add(`v12-specs/${name(SPEC)}#${n}`, source);
  });

  for (const [file, from] of LITERAL_FILES) {
    const text = show(file);
    const start = from ? (from.exec(text)?.index ?? text.length) : 0;
    let k = 0;
    for (const m of text.slice(start).matchAll(LITERAL)) {
      const raw = m[1] ?? m[2] ?? m[3] ?? '';
      if (raw.includes('${')) continue;
      const source = unescape(raw);
      if (HEADER.test(source)) add(`v12-specs/${name(file)}#${++k}`, source);
    }
  }

  let d = 0;
  for (const m of show(DOCS).matchAll(/```mermaid(?:-example)?\n([\s\S]*?)```/g)) {
    add(`v12-docs/${name(DOCS)}#${++d}`, m[1] ?? '');
  }
  return items;
}
