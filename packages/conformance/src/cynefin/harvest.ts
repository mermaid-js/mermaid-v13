/**
 * The cynefin harvest (#423 "Harvest"): every cynefin source written as a string literal in
 * v12's `cynefin.integration.spec.ts` (the `parser.parse` strings) and in the examples package,
 * plus every fenced block of v12's cynefin syntax page, read from git at the last v12 commit
 * ({@link V12_COMMIT}), whose cynefin sources are 12.2.0's byte for byte. Repeated sources are
 * kept once. `cli/harvest-cynefin.ts` writes it to {@link CYNEFIN_HARVEST_PATH}, and
 * `harvest.spec.ts` checks the committed file is what it writes today.
 *
 * v12's spec strings skipped its preprocessing (they call the parser directly); the main gate
 * runs them through it, as every source, and a second gate lexes them raw. Two doc fences are
 * fragments with no header, which v12 does not detect.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { REPO_ROOT } from '../corpus.ts';
import { V12_COMMIT } from '../jison/harvest.ts';
import type { CorpusItem } from '../types.ts';

export const CYNEFIN_HARVEST_PATH = join(
  REPO_ROOT,
  'packages/conformance/corpus/cynefin-v12-specs.json'
);

const FILES = [
  'packages/mermaid/src/diagrams/cynefin/cynefin.integration.spec.ts',
  'packages/examples/src/examples/cynefin.ts',
];
const DOCS = 'packages/mermaid/src/docs/syntax/cynefin.md';
const ESCAPES: Record<string, string> = { n: '\n', r: '\r', t: '\t' };
const LITERAL = /`((?:[^`\\]|\\.)*)`/g;
// Every fence but the page's ```warning admonition: the syntax template (```md), the
// fragments and full diagrams (```), and the examples (```mermaid-example).
const FENCE = /```([\w-]*)\n([\s\S]*?)```/g;

const show = (file: string) =>
  execFileSync('git', ['-C', REPO_ROOT, 'show', `${V12_COMMIT}:${file}`], {
    encoding: 'utf8',
    maxBuffer: 1 << 26,
  });

/** The value of a template literal's body: its escapes decoded, line continuations dropped. */
function unescape(raw: string): string {
  return raw.replace(/\\(\r\n|[\s\S])/g, (_, e: string) => {
    if (e === '\n' || e === '\r\n' || e === '\r') return '';
    return ESCAPES[e] ?? e;
  });
}

/** The harvested sources, in file order. */
export function harvestCynefin(): CorpusItem[] {
  const items: CorpusItem[] = [];
  const seen = new Set<string>();
  const add = (id: string, source: string) => {
    if (seen.has(source)) return;
    seen.add(source);
    items.push({ id, source });
  };
  for (const file of FILES) {
    const name = file.slice(file.lastIndexOf('/') + 1);
    let n = 0;
    for (const m of show(file).matchAll(LITERAL)) {
      const raw = m[1] ?? '';
      if (!/^\s*cynefin-beta/.test(raw) || raw.includes('${')) continue;
      add(`v12-specs/${name}#${++n}`, unescape(raw));
    }
  }
  let k = 0;
  for (const m of show(DOCS).matchAll(FENCE)) {
    if (m[1] === 'warning') continue;
    add(`v12-docs/cynefin.md#${++k}`, m[2] ?? '');
  }
  return items;
}
