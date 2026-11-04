/**
 * Writes `corpus/class-v12-specs.json`: every class-diagram source written as a string literal
 * (or a `+` chain of them) in v12's class specs, plus the examples of v12's class syntax page,
 * read from git at the last v12 commit. They are a parity corpus next to the e2e fixtures
 * (R-TEST-3, DESIGN §13.1). Pattern: `harvest-flowchart.ts`.
 *
 * Usage: `pnpm --filter @mermaid-js/conformance exec tsx src/cli/harvest-class.ts`
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../corpus.ts';
import type { CorpusItem } from '../types.ts';

const V12 = 'fa796a943';
const DIR = 'packages/mermaid/src/diagrams/class';
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
const LIT = String.raw`\`(?:[^\`\\]|\\.)*\`|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"`;
const PART = new RegExp(LIT, 'g');
/** The literals of `text`, grouped into `a + b + …` chains. */
function chains(text: string): string[][] {
  const out: string[][] = [];
  let end = -1;
  for (const m of text.matchAll(PART)) {
    const last = out[out.length - 1];
    if (last && /^\s*\+\s*$/.test(text.slice(end, m.index))) last.push(m[0]);
    else out.push([m[0]]);
    end = m.index + m[0].length;
  }
  return out;
}
/**
 * The values of one JS string literal (its escapes decoded): one, or one per keyword for a
 * template whose only interpolation is `${keyword}` (the spec's `it.each(keywords)`).
 */
function decode(lit: string, keywords: readonly string[]): string[] {
  const body = lit.slice(1, -1);
  const raw = lit.startsWith('`') ? body : body.replace(/`/g, '\\`');
  if (!lit.startsWith('`') || !body.includes('${')) {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call -- decodes a JS literal from the v12 specs (trusted repo text)
    return [new Function('return `' + raw + '`')() as string];
  }
  if (body.replace(/\$\{keyword\}/g, '').includes('${')) throw new Error('template');
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- decodes a JS literal from the v12 specs (trusted repo text)
  const f = new Function('keyword', 'return `' + raw + '`') as (k: string) => string;
  return keywords.map(f);
}
/** The spec's `const keywords = [...]` list, if it has one. */
function keywordsOf(text: string): string[] {
  const m = /const keywords = (\[[\s\S]*?\n\s*\]);/.exec(text);
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call -- decodes a JS literal from the v12 specs (trusted repo text)
  return m ? (new Function('return ' + (m[1] ?? '[]'))() as string[]) : [];
}
for (const file of files) {
  const text = git('show', `${V12}:${file}`);
  const keywords = keywordsOf(text);
  let n = 0;
  for (const parts of chains(text)) {
    let sources = [''];
    try {
      for (const p of parts) {
        const vs = decode(p, keywords);
        sources = sources.flatMap((s) => vs.map((v) => s + v));
      }
    } catch {
      continue;
    }
    for (const source of sources) {
      if (!/^\s*classDiagram/.test(source)) continue;
      add(`v12-specs/${file.slice(DIR.length + 1)}#${++n}`, source);
    }
  }
}
const docs = git('show', `${V12}:packages/mermaid/src/docs/syntax/classDiagram.md`);
let k = 0;
for (const m of docs.matchAll(/```mermaid(?:-example)?\n([\s\S]*?)```/g)) {
  add(`v12-docs/classDiagram.md#${++k}`, m[1] ?? '');
}
const out = join(REPO_ROOT, 'packages/conformance/corpus/class-v12-specs.json');
writeFileSync(out, JSON.stringify(items, null, 2) + '\n');
process.stdout.write(`${items.length} sources\n`);
