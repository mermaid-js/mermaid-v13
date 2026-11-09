/**
 * Writes `corpus/<type>-v12-specs.json` for a v12 Langium type: every source of the type written
 * as a string literal in its v12 specs and examples, plus the examples of its v12 syntax page,
 * read from git at the last v12 commit. They are a parity corpus next to the e2e fixtures
 * (R-TEST-3, DESIGN §13.1). Repeated sources are kept once.
 *
 * Usage: `pnpm --filter @mermaid-js/conformance harvest:<type>` (`harvest-v12.ts <type>`).
 * `harvest-v12.spec.ts` checks that every committed corpus is what this writes.
 *
 * A literal is a source of the type when, after optional blanks and an optional `---` front
 * matter block, it starts with one of the type's headers (not followed by a word character,
 * `.` or `-`), and holds no `${` placeholder. A test's title (the first argument of `describe`,
 * `it` or `test`) is a name, not a source, unless it is a bare header, which is a source too.
 * Every `mermaid` and `mermaid-example` fence of the syntax page is taken; one inside an HTML
 * comment (not shown on the page) is kept too, marked so in its id.
 *
 * Read at `V12_COMMIT` (`fa796a943`), the last v12 commit here: its diagram, parser and spec
 * files are `mermaid@12.2.0`'s (D316; the tag is not in this repo); its syntax pages add a
 * `description:` front matter.
 */
import { execFileSync } from 'node:child_process';
import { realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from '../corpus.ts';
import { V12_COMMIT } from '../jison/harvest.ts';
import type { CorpusItem } from '../types.ts';

interface Harvest {
  /** The headers that start a source of the type, as a regex alternation. */
  header: string;
  /** The files whose string literals are harvested. */
  files: readonly string[];
  /** The syntax page whose fences are harvested; none when v12 had no page (info). */
  docs?: string;
}

/** The Langium types harvested, by v13 diagram id. */
export const HARVESTS = {
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
  info: {
    header: 'info',
    files: [
      'packages/mermaid/src/diagrams/info/info.spec.ts',
      'packages/parser/tests/info.test.ts',
    ],
  },
  radar: {
    header: 'radar-beta',
    files: [
      'packages/mermaid/src/diagrams/radar/radar.spec.ts',
      'packages/parser/tests/radar.test.ts',
      'packages/examples/src/examples/radar.ts',
      'packages/mermaid/src/rendering-util/multi-diagram-id-uniqueness.spec.ts',
    ],
    docs: 'packages/mermaid/src/docs/syntax/radar.md',
  },
  treemap: {
    header: 'treemap(?:-beta)?',
    files: [
      'packages/mermaid/src/diagrams/treemap/utils.test.ts',
      'packages/parser/tests/treemap.test.ts',
      'packages/examples/src/examples/treemap.ts',
      'packages/mermaid/src/rendering-util/multi-diagram-id-uniqueness.spec.ts',
    ],
    docs: 'packages/mermaid/src/docs/syntax/treemap.md',
  },
  cynefin: {
    header: 'cynefin-beta',
    files: [
      'packages/mermaid/src/diagrams/cynefin/cynefin.integration.spec.ts',
      'packages/examples/src/examples/cynefin.ts',
    ],
    docs: 'packages/mermaid/src/docs/syntax/cynefin.md',
  },
  wardley: {
    header: 'wardley-beta',
    files: [
      'packages/mermaid/src/diagrams/wardley/wardleyParser.spec.ts',
      'packages/mermaid/src/diagrams/wardley/wardleyBuilder.spec.ts',
      'packages/examples/src/examples/wardley.ts',
      'packages/mermaid/src/rendering-util/multi-diagram-id-uniqueness.spec.ts',
    ],
    docs: 'packages/mermaid/src/docs/syntax/wardley.md',
  },
} as const satisfies Record<string, Harvest>;

export type HarvestType = keyof typeof HARVESTS;

/** Where `harvest-v12.ts <type>` writes the type's corpus. */
export const harvestPath = (type: HarvestType): string =>
  join(REPO_ROOT, 'packages/conformance/corpus', `${type}-v12-specs.json`);

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
/** The end of the text before a test's title. */
const TITLE_CALL = /\b(?:describe|it|test)(?:\.only|\.skip)?\(\s*$/;

/** The sources `harvest-v12.ts <type>` writes, in file order, without duplicates. */
export function harvest(type: HarvestType): CorpusItem[] {
  const spec: Harvest = HARVESTS[type];
  const items: CorpusItem[] = [];
  const seen = new Set<string>();
  const add = (id: string, source: string) => {
    if (seen.has(source)) return;
    seen.add(source);
    items.push({ id, source });
  };
  const header = new RegExp(
    `^\\s*(?:---\\n[^]*?\\n---[\\t ]*\\n\\s*)?(?:${spec.header})(?![\\w.-])`
  );
  const bare = new RegExp(`^(?:${spec.header})$`);
  for (const file of spec.files) {
    const text = git('show', `${V12_COMMIT}:${file}`);
    const name = file.slice(file.lastIndexOf('/') + 1);
    let n = 0;
    for (const m of text.matchAll(LITERAL)) {
      const raw = m[1] ?? m[2] ?? m[3] ?? '';
      if (raw.includes('${')) continue;
      const source = unescape(raw);
      if (!header.test(source)) continue;
      const title = TITLE_CALL.test(text.slice(Math.max(0, m.index - 40), m.index));
      if (title && !bare.test(source)) continue;
      add(`v12-specs/${name}#${++n}`, source);
    }
  }
  if (spec.docs === undefined) return items;
  const docs = git('show', `${V12_COMMIT}:${spec.docs}`);
  const page = spec.docs.slice(spec.docs.lastIndexOf('/') + 1);
  const comments = [...docs.matchAll(HTML_COMMENT)].map((m) => [m.index, m.index + m[0].length]);
  let k = 0;
  for (const m of docs.matchAll(FENCE)) {
    const hidden = comments.some(([s = 0, e = 0]) => m.index > s && m.index < e);
    add(`v12-docs/${page}#${++k}${hidden ? ' (in an HTML comment)' : ''}`, m[1] ?? '');
  }
  return items;
}

// The CLI, only when this file is the script run (a spec imports `harvest`).
const entry = process.argv[1];
if (entry && realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url))) {
  const type = process.argv[2] ?? '';
  if (!Object.hasOwn(HARVESTS, type)) {
    process.stderr.write(`usage: harvest-v12.ts <${Object.keys(HARVESTS).join('|')}>\n`);
    process.exit(2);
  }
  const items = harvest(type as HarvestType);
  writeFileSync(harvestPath(type as HarvestType), JSON.stringify(items, null, 2) + '\n');
  process.stdout.write(`${items.length} sources\n`);
}
