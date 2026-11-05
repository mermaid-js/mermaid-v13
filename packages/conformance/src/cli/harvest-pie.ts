/**
 * Writes `corpus/pie-v12-specs.json`: every pie source written as a string literal in v12's pie
 * specs (`pie.spec.ts`, `pieRenderer.spec.ts`) and in `@mermaid-js/parser`'s `pie.test.ts`, plus
 * the examples of v12's pie syntax page, read from git at the last v12 commit. They are a parity
 * corpus next to the e2e fixtures (R-TEST-3, DESIGN §13.1). Repeated sources are kept once.
 *
 * Usage: `pnpm --filter @mermaid-js/conformance harvest:pie`
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../corpus.ts';
import type { CorpusItem } from '../types.ts';

const V12 = 'fa796a943';
const FILES = [
  'packages/mermaid/src/diagrams/pie/pie.spec.ts',
  'packages/mermaid/src/diagrams/pie/pieRenderer.spec.ts',
  'packages/parser/tests/pie.test.ts',
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

const LITERAL = /`((?:[^`\\]|\\.)*)`|'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g;
for (const file of FILES) {
  const text = git('show', `${V12}:${file}`);
  const name = file.slice(file.lastIndexOf('/') + 1);
  let n = 0;
  for (const m of text.matchAll(LITERAL)) {
    const raw = m[1] ?? m[2] ?? m[3] ?? '';
    if (!/^\s*(?:\\[nt])*\s*pie(?![\w.])/.test(raw) || raw.includes('${')) continue;
    add(`v12-specs/${name}#${++n}`, unescape(raw));
  }
}
const docs = git('show', `${V12}:packages/mermaid/src/docs/syntax/pie.md`);
let k = 0;
for (const m of docs.matchAll(/```mermaid(?:-example)?\n([\s\S]*?)```/g)) {
  add(`v12-docs/pie.md#${++k}`, m[1] ?? '');
}
const out = join(REPO_ROOT, 'packages/conformance/corpus/pie-v12-specs.json');
writeFileSync(out, JSON.stringify(items, null, 2) + '\n');
process.stdout.write(`${items.length} sources\n`);
