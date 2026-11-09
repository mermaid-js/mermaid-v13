/**
 * Ports v12's usecase specs (R-TEST-3) into `src/v12-specs/`, run against v13's parser through
 * `src/v12-specs/adapter.ts`: `parser.parse` parses with v13 and `db` reads the model back in
 * v12's shapes (`getData` included); the raw lexer and grammar specs read v13's lexer and
 * parser through Chevrotain-shaped stand-ins, and the JSON spec v13's JSON reader. The spec
 * bodies are copied unchanged from the last v12 commit; only imports are rewritten, the `d3`
 * mock of `usecase.spec.ts` is dropped (nothing here renders), every assertion on v12's
 * `db.getAST()` is dropped (D476: v13 does not port v12's `GraphAST`; the rest of each test
 * still runs), and tests listed in `v12-skips.json` (with a reason) are turned into `it.skip`.
 *
 * Usage: `pnpm --filter @mermaid-js/diagram-usecase port:v12-specs` (also runs prettier).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const V12 = 'fa796a943';
const DIR = 'packages/mermaid/src/diagrams/usecase';
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const OUT = fileURLToPath(new URL('../src/v12-specs/', import.meta.url));

const ADAPTER = (names: string) => `import { ${names} } from './adapter.ts';`;
/** `[v12 file, ported name, imports]`. */
const FILES: readonly (readonly [file: string, name: string, imports: string[]])[] = [
  [
    'usecase.parser.spec.ts',
    'usecase.parser.spec.ts',
    [
      "import { beforeEach, describe, expect, it } from 'vitest';",
      ADAPTER('ARROW_TYPE, db, getAccDescription, getAccTitle, parser'),
    ],
  ],
  [
    'usecase.spec.ts',
    'usecase.spec.ts',
    [
      "import { beforeAll, beforeEach, describe, expect, it } from 'vitest';",
      ADAPTER('addDiagrams, ARROW_TYPE, db, Diagram, getConfig, sanitizeText, setConfig'),
    ],
  ],
  [
    'parser/usecase.parser.spec.ts',
    'usecase.grammar.spec.ts',
    ["import { describe, expect, it } from 'vitest';", ADAPTER('usecaseLexer, usecaseParser')],
  ],
  [
    'parser/usecase.lexer.spec.ts',
    'usecase.lexer.spec.ts',
    ["import { describe, expect, it } from 'vitest';", ADAPTER('usecaseLexer')],
  ],
  [
    'parser/usecaseJson.spec.ts',
    'usecaseJson.spec.ts',
    [
      "import { describe, expect, it } from 'vitest';",
      ADAPTER('parseOrderedJsonObject, UsecaseJsonError'),
    ],
  ],
  [
    'usecaseDb.spec.ts',
    'usecaseDb.spec.ts',
    ["import { beforeEach, describe, expect, it } from 'vitest';", ADAPTER('ARROW_TYPE, db')],
  ],
  [
    'usecase-colorIndex.spec.ts',
    'usecase-colorIndex.spec.ts',
    [
      "import { beforeAll, describe, expect, it } from 'vitest';",
      ADAPTER('addDiagrams, db, Diagram'),
    ],
  ],
];

/** `ported file: { test title (or its unique start): reason }`. Reasons are written into the file. */
const SKIP = JSON.parse(
  readFileSync(new URL('./v12-skips.json', import.meta.url), 'utf8')
) as Record<string, Record<string, string>>;

/** v12's `d3` mock (the specs' renderer stand-in): nothing here renders. */
const D3_MOCK = /^vi\.mock\('d3', \(\) => \{[\s\S]*?^\}\);$/m;

/**
 * The text without each `expect(…)…;` statement that reads `db.getAST()`: from a line that
 * starts (after its indent) with `expect(` to the `;` that ends the statement at depth 0.
 */
function dropAstAssertions(text: string): { text: string; dropped: number } {
  const out: string[] = [];
  let dropped = 0;
  let i = 0;
  while (i < text.length) {
    const next = text.indexOf('\n', i);
    const lineEnd = next === -1 ? text.length : next + 1;
    const line = text.slice(i, lineEnd);
    if (!/^\s*expect\(/.test(line)) {
      out.push(line);
      i = lineEnd;
      continue;
    }
    const end = statementEnd(text, i);
    const statement = text.slice(i, end);
    if (statement.includes('db.getAST()')) dropped++;
    else out.push(statement);
    i = end;
  }
  return { text: out.join(''), dropped };
}

/** The offset after the `;` (and its line break) that ends the statement starting at `from`. */
function statementEnd(text: string, from: number): number {
  let depth = 0;
  for (let p = from; p < text.length; p++) {
    const c = text[p] ?? '';
    if (c === "'" || c === '"' || c === '`') {
      for (p++; p < text.length && text[p] !== c; p++) if (text[p] === '\\') p++;
    } else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ';' && depth === 0) return text[p + 1] === '\n' ? p + 2 : p + 1;
  }
  return text.length;
}

const git = (...args: string[]) =>
  execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });

let total = 0;
let skipped = 0;
for (const [file, name, imports] of FILES) {
  let body = git('show', `${V12}:${DIR}/${file}`)
    .split('\n')
    .filter((line) => !/^import .* from ['"]/.test(line))
    .join('\n')
    .replace(D3_MOCK, "// v12's d3 mock: nothing here renders.");
  const ast = dropAstAssertions(body);
  body = ast.text;
  const notes: string[] = [];
  for (const [title, reason] of Object.entries(SKIP[name] ?? {})) {
    let hit = 0;
    body = body.replace(
      /\b(it|describe)((?:\.each\([\s\S]*?\]\))?)\((\s*)(['"`])((?:(?!\4)[^\\]|\\.)*)\4/g,
      (m, fn: string, each: string, gap: string, q: string, t: string) => {
        if (!t.replace(/\\(.)/g, '$1').startsWith(title)) return m;
        hit++;
        return `${fn}.skip${each}(${gap}${q}${t}${q}`;
      }
    );
    if (hit === 0) throw new Error(`${name}: no test titled ${title}`);
    notes.push(`// skipped: ${title} — ${reason}`);
  }
  skipped += (body.match(/\b(?:it|describe)\.skip/g) ?? []).length;
  total += (body.match(/\bit(?:\.skip)?(?:\.each)?\(/g) ?? []).length;
  const header = [
    '/* eslint-disable */',
    `// Ported from mermaid v12 (${V12}), ${DIR}/${file}.`,
    '// Copyright (c) 2014 - 2022 Knut Sveidqvist, MIT License.',
    '// Generated by scripts/port-v12-specs.ts: edit v12-skips.json there, not this file.',
    '// @ts-nocheck',
    '// cspell:disable',
    ...imports,
    ...(ast.dropped > 0
      ? [
          `// dropped: ${ast.dropped} assertions on db.getAST() — D476, v13 does not port v12's GraphAST`,
        ]
      : []),
    ...notes,
    '',
  ].join('\n');
  writeFileSync(join(OUT, name), header + body);
}
process.stdout.write(`${FILES.length} files, ${total} tests (${skipped} skipped)\n`);
