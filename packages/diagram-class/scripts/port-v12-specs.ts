/**
 * Ports v12's class parser specs (R-TEST-3) into `src/v12-specs/`, run against v13's parser
 * through `src/v12-specs/adapter.ts`, which exposes the parse result with v12's ClassDB and
 * ClassMember names. The spec bodies are copied unchanged from the last v12 commit; only
 * imports are rewritten, and tests listed in `SKIP` (with a reason) are turned into `it.skip`.
 *
 * Not ported: `classDiagram-colorIndex.spec.ts` (it tests `getData`, the LayoutData the
 * layout ticket #155 builds) and `svgDraw.spec.js` (v12's dead legacy renderer).
 *
 * Usage: `pnpm --filter @mermaid-js/diagram-class port:v12-specs` (also runs prettier).
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const V12 = 'fa796a943';
const DIR = 'packages/mermaid/src/diagrams/class';
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const OUT = fileURLToPath(new URL('../src/v12-specs/', import.meta.url));

/** v12 spec file → name of the ported file. */
const FILES: Record<string, string> = {
  'classDiagram.spec.ts': 'classDiagram.spec.ts',
  'classDiagram-styles.spec.js': 'classDiagram-styles.spec.ts',
  'classTypes.spec.ts': 'classTypes.spec.ts',
  'parser/class.spec.js': 'class.spec.ts',
};

const SANITIZED =
  'expects the URL after `@braintree/sanitize-url`, which v12 ran at parse time; v13 keeps the URL as written and checks it when SVG is written (the parity normaliser applies the same sanitiser)';
const DOM_ID =
  "snapshots v12's `domId`, which takes a counter v12 never resets between diagrams; v13 writes no element ids from it";

/** `file: { test or describe title (or its unique start): reason }`. Reasons are written into the file. */
export const SKIP: Record<string, Record<string, string>> = {};

/**
 * Single lines taken out where one assertion needs it and the rest of the test holds:
 * `file: [line as written (trimmed), reason]`. A line inside a snapshot is dropped; any other
 * becomes a comment.
 */
export const SKIP_LINES: Record<string, [line: string, reason: string][]> = {
  'classDiagram.spec.ts': [
    ["expect(c1.link).toBe('https://example.com/');", SANITIZED],
    ['"domId": "classId-Student-154",', DOM_ID],
  ],
};

/** v12 tests skipped upstream that v12 (the oracle) and v13 both pass: `file: [title]`. */
export const UNSKIP: Record<string, string[]> = {
  'classDiagram.spec.ts': ['should handle a leading newline'],
};

/**
 * v12 specs that match jison's message text (`Expecting 'STR'`) keep only the rejection: v13
 * messages never name tokens (R-ERR-5).
 */
const JISON_MESSAGE = /\.toThrow(Error)?\(\/[^/]*(?:Expecting|Unrecognized)[^/]*\/\)/g;
/** The specs' config imports, answered by the adapter (`setConfig`, `reset`). */
const CONFIG_IMPORT = /await import\('\.\.\/\.\.\/(?:diagram-api\/diagramAPI|config)\.js'\)/g;

const git = (...args: string[]) =>
  execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });

let total = 0;
let skipped = 0;
for (const [file, name] of Object.entries(FILES)) {
  let body = git('show', `${V12}:${DIR}/${file}`)
    .split('\n')
    .filter(
      (line) =>
        !/^import .* from ['"]/.test(line) &&
        !line.startsWith('// @ts-expect-error') &&
        !line.startsWith('/* eslint-disable ')
    )
    .join('\n');
  const notes: string[] = [];
  body = body.replace(JISON_MESSAGE, (_m, error = '') => {
    notes.push('// rewritten: a jison message check keeps only the rejection (R-ERR-5)');
    return `.toThrow${error}()`;
  });
  body = body.replace(CONFIG_IMPORT, () => {
    notes.push("// rewritten: v12's config imports come from the adapter");
    return "await import('./adapter.ts')";
  });
  for (const [line, reason] of SKIP_LINES[name] ?? []) {
    const lines = body.split('\n');
    const at = lines.findIndex((l) => l.trim() === line);
    if (at < 0) throw new Error(`${name}: no line ${line}`);
    const indent = /^\s*/.exec(lines[at] ?? '')?.[0] ?? '';
    if (line.startsWith('"')) lines.splice(at, 1);
    else lines[at] = `${indent}// skipped assertion: ${line}`;
    body = lines.join('\n');
    notes.push(`// skipped assertion: ${line} — ${reason}`);
  }
  for (const title of UNSKIP[name] ?? []) {
    const marker = `it.skip('${title}'`;
    if (!body.includes(marker)) throw new Error(`${name}: no skipped test ${title}`);
    body = body.replace(marker, `it('${title}'`);
    notes.push(`// un-skipped: ${title} — v12 (the oracle) and v13 both accept it`);
  }
  for (const [title, reason] of Object.entries(SKIP[name] ?? {})) {
    let hit = 0;
    body = body.replace(
      /\b(it|describe|it\.each\([^)]*\))\((['"`])((?:(?!\2)[^\\]|\\.)*)\2/g,
      (m, fn: string, q: string, t: string) => {
        const plain = t.replace(/\\(.)/g, '$1');
        if (
          !plain.startsWith(title) &&
          !(fn.startsWith('it.each') && title.startsWith(plain.split('%s')[0] ?? '\0'))
        )
          return m;
        hit++;
        return `${fn.replace(/^(it|describe)/, '$1.skip')}(${q}${t}${q}`;
      }
    );
    if (hit === 0) throw new Error(`${name}: no test titled ${title}`);
    notes.push(`// skipped: ${title} — ${reason}`);
  }
  skipped += (body.match(/\b(?:it|describe)\.skip/g) ?? []).length;
  total += (body.match(/\bit(?:\.skip|\.each\([^)]*\))?\(/g) ?? []).length;
  const header = [
    '/* eslint-disable */',
    `// Ported from mermaid v12 (${V12}), ${DIR}/${file}.`,
    '// Copyright (c) 2014 - 2022 Knut Sveidqvist, MIT License.',
    '// Generated by scripts/port-v12-specs.ts: edit SKIP there, not this file.',
    '// @ts-nocheck',
    '// cspell:disable',
    "import { beforeEach, describe, expect, it, vi } from 'vitest';",
    "import { ClassDB, ClassMember, parser } from './adapter.ts';",
    'type ClassMap = Map<string, any>;',
    'type NamespaceNode = any;',
    ...new Set(notes),
    '',
  ].join('\n');
  writeFileSync(join(OUT, name), header + body);
}
process.stdout.write(`${Object.keys(FILES).length} files, ${total} tests (${skipped} skipped)\n`);
