/**
 * Ports v12's agentflow parser and DB specs (R-TEST-3) into `src/v12-specs/`, run against v13's
 * parser through `src/v12-specs/adapter.ts`: `agentflow.parser.parse` parses with v13 and the
 * `AgentFlowDB` getters read the model back in v12's shapes. The spec bodies are copied
 * unchanged from `fa796a943` (agentflow changed after mermaid\@12.2.0 only in `shapes.ts`,
 * D462); only imports are rewritten, and tests listed in `SKIP` (with a reason) become
 * `it.skip`.
 *
 * Usage: `pnpm --filter @mermaid-js/diagram-agentflow port:v12-specs` (also runs prettier).
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const V12 = 'fa796a943';
const DIR = 'packages/mermaid/src/diagrams/agentflow';
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const OUT = fileURLToPath(new URL('../src/v12-specs/', import.meta.url));

/** The 33 spec files that are not ported, each with where its coverage lives. */
export const NOT_PORTED: Record<string, string> = {
  'renderer.spec.ts': 'drives the v12 renderer: the SVG renderer is T4 (#548)',
  'colorSlots.spec.ts':
    "tests v12's palette slots and styles.ts: the renderer's palette is T4 (#548)",
  'containerOrder.spec.ts': "reads the colour index v12's getData stamped: T4 (#548)",
  'agentflow-render-positions.spec.ts': "renders through v12's mermaidAPI with jsdom: T5 (#550)",
  'agentflow-max-text-size.spec.ts':
    "renders through v12's mermaidAPI with jsdom; the comment-free fallback is `parser/source.spec.ts`",
  'conformance/conformance.spec.ts':
    'its 8 fixtures are e2e/diagrams/agentflow/conformance/*.mmd, run by src/conformance.spec.ts',
  'conformance/runner.spec.ts': "tests v12's fixture runner, replaced by src/conformance.spec.ts",
  'parser/agentflow-flowchart-parity.spec.ts':
    "imports v12's flowchart parser: its SHARED_SYNTAX parity is conformance's agentflow/shared-syntax.spec.ts (D467)",
};

const DB_API =
  "tests v12's DB methods for tool builders, removed in v13 (D465): positions come from the language service";
const MAPPINGS =
  "reads v12's element mappings (getElementMappings, getElementAtPosition), removed in v13 (D465)";
const D461 = 'v12 reported SHAPE_REMOVED as an error; v13 makes it a warning (D461)';
const MESSAGE = "matches js-yaml's or jison's message text; v13 messages are its own (R-ERR-5)";
const JISON_DIRECT =
  "the spec feeds jison the text without v12's appended line break; through v12's pipeline (the oracle) a last `call` starts a callback and the text is rejected, as v13 does";

/** `file: { test title (or its unique start): reason }`. Reasons are written into the file. */
export const SKIP: Record<string, Record<string, string>> = {
  'agentflow-diagnostics.spec.ts': {
    'DB surface': DB_API,
    emitWarning: DB_API,
    emitError: DB_API,
    'SHAPE_UNSUPPORTED migration (transformData)': DB_API,
    reset: DB_API,
  },
  'agentflow-diagnostics-lifecycle.spec.ts': {
    'reports a removed shape as an error after getData()': D461,
  },
  'agentflow-link-style.spec.ts': {
    'rejects an out-of-range index for interpolate': DB_API,
    'rejects an out-of-range index for style': DB_API,
    'still applies interpolate at a valid index': DB_API,
    'still applies the default interpolate': DB_API,
  },
  'agentflow-semantic-model.spec.ts': {
    'includes diagnostics emitted during the render pipeline': DB_API,
  },
  'parser/agentflow-blank-line-fold.spec.ts': {
    'a blank line directly after an inline @{ } block': MAPPINGS,
    'the fold accumulates': MAPPINGS,
    'a comment line after an @{ } block': MAPPINGS,
    'an edge after a @{ }+blank block': MAPPINGS,
    'still strips trailing whitespace after }': MAPPINGS,
  },
  'parser/agentflow-empty-metadata.spec.ts': {
    'a genuinely malformed block still throws a positioned YAML error': MESSAGE,
  },
  'parser/agentflow-metadata-no-validation.spec.ts': {
    'does not resolve/validate connectorRef': JISON_DIRECT,
  },
  'parser/agentflow-yaml-error-position.spec.ts': {
    'single-line block: maps (block 2:16)': MESSAGE,
    'multi-line block: maps the body line': MESSAGE,
    'multi-line block: error on the @{ line itself': MESSAGE,
    'composes with the blank-line fold fix': MESSAGE,
    'applies the frontmatter line offset on top of the block position': MESSAGE,
  },
};

/** Files whose every test reads a removed DB method, skipped as a whole. */
const WHOLE_FILE: Record<string, string> = {
  'parser/agentflow-attachment-mapping.spec.ts': MAPPINGS,
  'parser/agentflow-inline-metadata-mapping.spec.ts': MAPPINGS,
  'parser/agentflow-mappings.spec.ts': MAPPINGS,
  'parser/agentflow-subgraph-span.spec.ts': MAPPINGS,
};

const git = (...args: string[]) =>
  execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });

const ADAPTER_NAMES = [
  'AgentFlowDB',
  'AgentflowWarning',
  'PARSER_EMITTED_DIAGNOSTICS',
  'RESERVED_DIAGNOSTICS',
  'getConfig',
  'log',
  'setConfig',
];

const files = git('ls-tree', '-r', '--name-only', V12, `${DIR}/`)
  .split('\n')
  .filter((f) => f.endsWith('.spec.ts'))
  .map((f) => f.slice(DIR.length + 1))
  .filter((f) => !(f in NOT_PORTED))
  .sort();
let total = 0;
let skipped = 0;
for (const file of files) {
  let body = git('show', `${V12}:${DIR}/${file}`)
    .split('\n')
    .filter((line) => !/^import .* from ['"]/.test(line))
    .join('\n');
  // Multi-line imports (`import {\n  a,\n} from '…';`).
  body = body.replace(/^import \{[^}]*\} from ['"][^'"]+['"];\n/gm, '');
  const notes: string[] = [];
  const whole = WHOLE_FILE[file];
  if (whole) {
    body = body.replace(/\b(describe|it)\(/g, '$1.skip(');
    notes.push(`// skipped: every test — ${whole}`);
  }
  for (const [title, reason] of Object.entries(SKIP[file] ?? {})) {
    let hit = 0;
    body = body.replace(
      /\b(it|describe)\((['"`])((?:(?!\2)[^\\]|\\.)*)\2/g,
      (m, fn: string, q: string, t: string) => {
        if (!t.replace(/\\(.)/g, '$1').startsWith(title)) return m;
        hit++;
        return `${fn}.skip(${q}${t}${q}`;
      }
    );
    if (hit === 0) throw new Error(`${file}: no test titled ${title}`);
    notes.push(`// skipped: ${title} — ${reason}`);
  }
  skipped += (body.match(/\bit\.skip\(/g) ?? []).length;
  total += (body.match(/\bit(?:\.skip)?\(/g) ?? []).length;
  const used = ADAPTER_NAMES.filter((n) => new RegExp(`\\b${n}\\b`).test(body));
  const header = [
    '/* eslint-disable */',
    `// Ported from mermaid v12 (${V12}), ${DIR}/${file}.`,
    '// Copyright (c) 2014 - 2022 Knut Sveidqvist, MIT License.',
    '// Generated by scripts/port-v12-specs.ts: edit SKIP there, not this file.',
    '// @ts-nocheck',
    '// cspell:disable',
    "import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';",
    `import agentflow${used.length > 0 ? `, { ${used.join(', ')} }` : ''} from './adapter.ts';`,
    ...new Set(notes),
    '',
  ].join('\n');
  writeFileSync(join(OUT, file.replace(/^.*\//, '')), header + body);
}
process.stdout.write(`${files.length} files, ${total} tests (${skipped} skipped)\n`);
