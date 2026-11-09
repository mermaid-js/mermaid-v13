/**
 * Ports v12's 141 railroad spec cases (R-TEST-3, spec #526) into `src/v12-specs/`, run against
 * v13 through `src/v12-specs/adapter.ts`: the four detector specs, the four parser specs, the DB
 * spec, the renderer and styles specs, and the parser package's `railroad.test.ts`. The spec
 * bodies are copied unchanged from the last v12 commit; only imports are rewritten (the vitest
 * import is kept), and tests listed in `SKIP` (with a reason) are turned into `it.skip` (or
 * `describe.skip`).
 *
 * Usage: `pnpm --filter @mermaid-js/diagram-railroad port:v12-specs` (also runs prettier).
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const V12 = 'fa796a943';
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const OUT = fileURLToPath(new URL('../src/v12-specs/', import.meta.url));
const DIR = 'packages/mermaid/src/diagrams/railroad';

interface Source {
  /** Path at {@link V12}. */
  file: string;
  /** File name in `src/v12-specs/`. */
  name: string;
  /** What the spec imports from `./adapter.ts`, in place of its own imports. */
  adapter: string;
}

const SOURCES: Source[] = [
  {
    file: `${DIR}/railroadDetector.spec.ts`,
    name: 'railroadDetector.spec.ts',
    adapter: 'railroad',
  },
  { file: `${DIR}/ebnfDetector.spec.ts`, name: 'ebnfDetector.spec.ts', adapter: 'railroadEbnf' },
  { file: `${DIR}/abnfDetector.spec.ts`, name: 'abnfDetector.spec.ts', adapter: 'railroadAbnf' },
  { file: `${DIR}/pegDetector.spec.ts`, name: 'pegDetector.spec.ts', adapter: 'railroadPeg' },
  {
    file: `${DIR}/parser/railroadDiagram.spec.ts`,
    name: 'railroadDiagram.spec.ts',
    adapter: 'db, irParser as parser',
  },
  {
    file: `${DIR}/parser/ebnfDiagram.spec.ts`,
    name: 'ebnfDiagram.spec.ts',
    adapter: 'db, ebnfParser as parser',
  },
  {
    file: `${DIR}/parser/abnfDiagram.spec.ts`,
    name: 'abnfDiagram.spec.ts',
    adapter: 'db, abnfParser as parser',
  },
  {
    file: `${DIR}/parser/pegDiagram.spec.ts`,
    name: 'pegDiagram.spec.ts',
    adapter: 'db, pegParser as parser',
  },
  { file: `${DIR}/railroadDb.spec.ts`, name: 'railroadDb.spec.ts', adapter: 'db' },
  {
    file: `${DIR}/railroadRenderer.spec.ts`,
    name: 'railroadRenderer.spec.ts',
    adapter: 'db, irParser as parser, renderer, reset',
  },
  {
    file: `${DIR}/styles.spec.ts`,
    name: 'styles.spec.ts',
    adapter: 'configApi, getStyles, themes',
  },
  {
    file: 'packages/parser/tests/railroad.test.ts',
    name: 'langium-railroad.spec.ts',
    adapter: 'createRailroadServices, expectNoErrorsOrAlternatives, MermaidParseError, parseAsync',
  },
];

const RENDERER = 'v12 drew with its renderer, which lands with T4 (#613)';
const LAYOUT =
  "v12's renderer and its jsdom measurements; the layout and renderer land with T3 (#612) and T4 (#613)";
const STYLES =
  "v12's `getStyles` CSS; v13 writes no `<style>` (R-SEC-2) and the theme table lands with T4 (#613)";
const SANITIZE =
  "v12's DB ran DOMPurify on text; v13 keeps text as written and never reads it as HTML (R-SEC-2), and the oracle's DOMPurify is the identity, so parity shows no other change";

/** `file name: { test title (or its unique start): reason }`. Reasons are written into the file. */
export const SKIP: Record<string, Record<string, string>> = {
  'railroadDetector.spec.ts': { 'should return diagram with renderer': RENDERER },
  'ebnfDetector.spec.ts': { 'should load the diagram': RENDERER },
  'abnfDetector.spec.ts': { 'should load the diagram': RENDERER },
  'pegDetector.spec.ts': { 'should load the diagram': RENDERER },
  'railroadDb.spec.ts': {
    'should sanitize titles before storing them': SANITIZE,
    'should sanitize rule names and terminal values at the db boundary': SANITIZE,
  },
  'railroadRenderer.spec.ts': { 'Railroad Renderer': LAYOUT },
  'styles.spec.ts': { 'Railroad Styles': STYLES },
};

const git = (...args: string[]) =>
  execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });

/** Every import statement, one or several lines long. */
const IMPORT = /^import\s[^;]*?from\s+['"]([^'"]+)['"];?[ \t]*\r?\n/gm;

let total = 0;
let skipped = 0;
for (const { file, name, adapter } of SOURCES) {
  const original = git('show', `${V12}:${file}`);
  const vitest: string[] = [];
  let body = original.replace(IMPORT, (m: string, from: string) => {
    if (from === 'vitest') vitest.push(m.trimEnd());
    return '';
  });
  const notes: string[] = [];
  for (const [title, reason] of Object.entries(SKIP[name] ?? {})) {
    let hit = 0;
    body = body.replace(
      /\b(it|describe)\((['"`])((?:(?!\2)[^\\]|\\.)*)\2/g,
      (m, fn: string, q: string, t: string) => {
        if (!t.replace(/\\(.)/g, '$1').startsWith(title)) return m;
        hit++;
        return `${fn}.skip(${q}${t}${q}`;
      }
    );
    if (hit === 0) throw new Error(`${name}: no test titled ${title}`);
    notes.push(`// skipped: ${title} — ${reason}`);
  }
  const cases = (body.match(/\bit(?:\.skip)?\(/g) ?? []).length;
  const skips = (body.match(/\bit\.skip\(/g) ?? []).length;
  // A skipped describe skips every case in it: the renderer and styles specs are one each.
  const whole = /\bdescribe\.skip\(/.test(body);
  total += cases;
  skipped += whole ? cases : skips;
  const header = [
    '/* eslint-disable */',
    `// Ported from mermaid v12 (${V12}), ${file}.`,
    '// Copyright (c) 2014 - 2022 Knut Sveidqvist, MIT License.',
    '// Generated by scripts/port-v12-specs.ts: edit SKIP there, not this file.',
    '// @ts-nocheck',
    '// cspell:disable',
    ...vitest,
    `import { ${adapter} } from './adapter.ts';`,
    ...notes,
    '',
  ].join('\n');
  writeFileSync(join(OUT, name), header + body.replace(/^\n+/, ''));
}
process.stdout.write(`${SOURCES.length} files, ${total} tests (${skipped} skipped)\n`);
