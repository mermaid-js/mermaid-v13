/**
 * Writes `corpus/<type>-v12-specs.json` for a v12 Langium type: every source of the type written
 * as a string literal in its v12 specs and examples, plus the examples of its v12 syntax page,
 * read from git at the last v12 commit. They are a parity corpus next to the e2e fixtures
 * (R-TEST-3, DESIGN §13.1). Repeated sources are kept once.
 *
 * Usage: `pnpm --filter @mermaid-js/conformance harvest:<type>` (`harvest-v12.ts <type>`).
 *
 * A literal is a source of the type when, after optional blanks and an optional `---` front
 * matter block, it starts with one of the type's headers (not followed by a word character or a
 * `.`), and holds no `${` placeholder. Every `mermaid` and `mermaid-example` fence of the syntax
 * page is taken; one inside an HTML comment (not shown on the page) is kept too, marked so in
 * its id.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../corpus.ts';
import type { CorpusItem } from '../types.ts';

/**
 * The last v12 commit in this repo. Its diagram, parser and spec files are `mermaid@12.2.0`'s
 * (D316; the tag is not in this repo); its syntax pages add a `description:` front matter.
 */
const V12 = 'fa796a943';

interface Harvest {
  /** The headers that start a source of the type, as a regex alternation. */
  header: string;
  /** The files whose string literals are harvested. */
  files: string[];
  /** The syntax page whose fences are harvested. */
  docs: string;
}

const HARVESTS: Record<string, Harvest> = {
  pie: {
    header: 'pie',
    files: [
      'packages/mermaid/src/diagrams/pie/pie.spec.ts',
      'packages/mermaid/src/diagrams/pie/pieRenderer.spec.ts',
      'packages/parser/tests/pie.test.ts',
    ],
    docs: 'packages/mermaid/src/docs/syntax/pie.md',
  },
  packet: {
    header: 'packet(?:-beta)?',
    files: [
      'packages/mermaid/src/diagrams/packet/packet.spec.ts',
      'packages/mermaid/src/diagrams/packet/renderer.spec.ts',
      'packages/parser/tests/packet.test.ts',
      'packages/examples/src/examples/packet.ts',
      'packages/mermaid/src/rendering-util/multi-diagram-id-uniqueness.spec.ts',
    ],
    docs: 'packages/mermaid/src/docs/syntax/packet.md',
  },
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

const git = (...args: string[]) =>
  execFileSync('git', ['-C', REPO_ROOT, ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });

const LITERAL = /`((?:[^`\\]|\\.)*)`|'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g;
const FENCE = /```mermaid(?:-example)?\n([\s\S]*?)```/g;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;

/** The harvested sources of one type, in file order. */
function harvest(spec: Harvest): CorpusItem[] {
  const items: CorpusItem[] = [];
  const seen = new Set<string>();
  const add = (id: string, source: string) => {
    if (seen.has(source)) return;
    seen.add(source);
    items.push({ id, source });
  };
  const header = new RegExp(
    `^\\s*(?:---\\n[^]*?\\n---[\\t ]*\\n\\s*)?(?:${spec.header})(?![\\w.])`
  );
  for (const file of spec.files) {
    const text = git('show', `${V12}:${file}`);
    const name = file.slice(file.lastIndexOf('/') + 1);
    let n = 0;
    for (const m of text.matchAll(LITERAL)) {
      const raw = m[1] ?? m[2] ?? m[3] ?? '';
      if (raw.includes('${')) continue;
      const source = unescape(raw);
      if (header.test(source)) add(`v12-specs/${name}#${++n}`, source);
    }
  }
  const docs = git('show', `${V12}:${spec.docs}`);
  const page = spec.docs.slice(spec.docs.lastIndexOf('/') + 1);
  const comments = [...docs.matchAll(HTML_COMMENT)].map((m) => [m.index, m.index + m[0].length]);
  let k = 0;
  for (const m of docs.matchAll(FENCE)) {
    const hidden = comments.some(([s = 0, e = 0]) => m.index > s && m.index < e);
    add(`v12-docs/${page}#${++k}${hidden ? ' (in an HTML comment)' : ''}`, m[1] ?? '');
  }
  return items;
}

const type = process.argv[2] ?? '';
const spec = HARVESTS[type];
if (!spec) throw new Error(`usage: harvest-v12.ts <${Object.keys(HARVESTS).join('|')}>`);
const items = harvest(spec);
writeFileSync(
  join(REPO_ROOT, `packages/conformance/corpus/${type}-v12-specs.json`),
  JSON.stringify(items, null, 2) + '\n'
);
process.stdout.write(`${items.length} sources\n`);
