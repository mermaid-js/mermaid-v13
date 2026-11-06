/**
 * Writes `corpus/cynefin-v12-specs.json`: every cynefin source written as a string literal in
 * v12's `cynefin.integration.spec.ts` (the `parser.parse` strings) and in the examples package,
 * plus every fenced block of v12's cynefin syntax page (#423 "Harvest"), read from git at the
 * last v12 commit, whose cynefin sources are 12.2.0's. They are a parity corpus next to the e2e
 * fixtures (R-TEST-3, DESIGN §13.1). Repeated sources are kept once.
 *
 * v12's spec strings skipped its preprocessing (they call the parser directly); here they go
 * through it, as every source does. Two doc fences are fragments with no header: v12 does not
 * detect them, so the lexer gate leaves them out.
 *
 * Usage: `pnpm --filter @mermaid-js/conformance harvest:cynefin`
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../corpus.ts';
import type { CorpusItem } from '../types.ts';

const V12 = 'fa796a943';
const FILES = [
  'packages/mermaid/src/diagrams/cynefin/cynefin.integration.spec.ts',
  'packages/examples/src/examples/cynefin.ts',
];
const git = (...args: string[]) =>
  execFileSync('git', ['-C', REPO_ROOT, ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });

const items: CorpusItem[] = [];
const seen = new Set<string>();
const add = (id: string, source: string) => {
  if (seen.has(source)) return;
  seen.add(source);
  items.push({ id, source });
};

const ESCAPES: Record<string, string> = { n: '\n', r: '\r', t: '\t' };

/** The value of a template literal's body: its escapes decoded, line continuations dropped. */
function unescape(raw: string): string {
  return raw.replace(/\\(\r\n|[\s\S])/g, (_, e: string) => {
    if (e === '\n' || e === '\r\n' || e === '\r') return '';
    return ESCAPES[e] ?? e;
  });
}

const LITERAL = /`((?:[^`\\]|\\.)*)`/g;
for (const file of FILES) {
  const text = git('show', `${V12}:${file}`);
  const name = file.slice(file.lastIndexOf('/') + 1);
  let n = 0;
  for (const m of text.matchAll(LITERAL)) {
    const raw = m[1] ?? '';
    if (!/^\s*cynefin-beta/.test(raw) || raw.includes('${')) continue;
    add(`v12-specs/${name}#${++n}`, unescape(raw));
  }
}
// Every fence but the page's ```warning admonition: the syntax template (```md), the
// fragments and full diagrams (```), and the examples (```mermaid-example).
const docs = git('show', `${V12}:packages/mermaid/src/docs/syntax/cynefin.md`);
let k = 0;
for (const m of docs.matchAll(/```([\w-]*)\n([\s\S]*?)```/g)) {
  if (m[1] === 'warning') continue;
  add(`v12-docs/cynefin.md#${++k}`, m[2] ?? '');
}
const out = join(REPO_ROOT, 'packages/conformance/corpus/cynefin-v12-specs.json');
writeFileSync(out, JSON.stringify(items, null, 2) + '\n');
process.stdout.write(`${items.length} sources\n`);
