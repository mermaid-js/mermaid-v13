/**
 * Writes `corpus/flowchart-v12-specs.json`: every flowchart source written as a string literal
 * in v12's flowchart specs, plus the examples of v12's flowchart syntax page, read from git at
 * the last v12 commit. They are a parity corpus next to the e2e fixtures (R-TEST-3, DESIGN §13.1).
 *
 * Usage: `pnpm --filter @mermaid-js/conformance harvest:flowchart`
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../corpus.ts';
import type { CorpusItem } from '../types.ts';

const V12 = 'fa796a943';
const DIR = 'packages/mermaid/src/diagrams/flowchart';
const git = (...args: string[]) =>
  execFileSync('git', ['-C', REPO_ROOT, ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });

const items: CorpusItem[] = [];
const seen = new Set<string>();
const add = (id: string, source: string) => {
  if (seen.has(source)) return;
  seen.add(source);
  items.push({ id, source });
};

const files = git('ls-tree', '-r', '--name-only', V12, '--', DIR)
  .split('\n')
  .filter((f) => /\.spec\.[jt]s$/.test(f))
  .sort();
const LITERAL = /`((?:[^`\\]|\\.)*)`|'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g;
for (const file of files) {
  const text = git('show', `${V12}:${file}`);
  let n = 0;
  for (const m of text.matchAll(LITERAL)) {
    const raw = m[1] ?? m[2] ?? m[3] ?? '';
    if (!/^\s*(?:\\n)?\s*(graph|flowchart)/.test(raw) || raw.includes('${')) continue;
    try {
      // Decode the JS escapes of the literal.
      const source = new Function('return `' + raw.replace(/`/g, '\\`') + '`')() as string;
      add(`v12-specs/${file.slice(DIR.length + 1)}#${++n}`, source);
    } catch {
      continue;
    }
  }
}
const docs = git('show', `${V12}:packages/mermaid/src/docs/syntax/flowchart.md`);
let k = 0;
for (const m of docs.matchAll(/```mermaid(?:-example)?\n([\s\S]*?)```/g)) {
  add(`v12-docs/flowchart.md#${++k}`, m[1] ?? '');
}
const out = join(REPO_ROOT, 'packages/conformance/corpus/flowchart-v12-specs.json');
writeFileSync(out, JSON.stringify(items, null, 2) + '\n');
process.stdout.write(`${items.length} sources\n`);
