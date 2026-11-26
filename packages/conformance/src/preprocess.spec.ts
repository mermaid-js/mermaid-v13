/**
 * Preprocess parity over the e2e corpus (every diagram type: front matter and directives are
 * shared). The v12 side re-runs v12's own steps literally: `preprocess.ts` `cleanupText`,
 * `regexes.ts` `frontMatterRegex`, `frontmatter.ts` (dedent + js-yaml `JSON_SCHEMA`) and
 * `utils.ts` `detectDirective` (`'`→`"` swap, `directiveRegex`, `JSON.parse`).
 */
import { JSON_SCHEMA, load } from 'js-yaml';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMermaid } from 'mermaid';
import { preprocess } from '@mermaid-js/core/preprocess';
import { corpusFromDir, REPO_ROOT } from './corpus.ts';
import { loadOracle } from './oracle.ts';
import type { CorpusItem } from './types.ts';

const FRONT_MATTER = /^([^\S\n\r]*)-{3}\s*[\n\r](.*?)[\n\r]\1-{3}\s*[\n\r]+/s;
// eslint-disable-next-line mermaid/no-nested-quantifier -- v12's released directiveRegex is the oracle; small inputs only
const DIRECTIVE = /%{2}{\s*(?:(\w+)\s*:|(\w+))\s*(?:(\w+)|((?:(?!}%{2}).|\r?\n)*))?\s*(?:}%{2})?/gi;

interface Read {
  title?: string;
  config?: unknown;
  /** `[name, args]` per directive; `undefined` when v12's detection threw. */
  directives?: [string, unknown][];
  error?: boolean;
}

function cleanupText(code: string): string {
  return code
    .replace(/\r\n?/g, '\n')
    .replace(
      /<(\w+)([^>]*)>/g,
      (_m, tag: string, attrs: string) => '<' + tag + attrs.replace(/="([^"]*)"/g, "='$1'") + '>'
    );
}

function v12(src: string): Read {
  let text = cleanupText(src);
  const out: Read = {};
  const m = FRONT_MATTER.exec(text);
  if (m) {
    const indent = m[1] ?? '';
    const body = indent
      ? (m[2] ?? '')
          .split('\n')
          .map((l) => (l.startsWith(indent) ? l.slice(indent.length) : l))
          .join('\n')
      : (m[2] ?? '');
    let parsed: unknown;
    try {
      parsed = load(body, { schema: JSON_SCHEMA });
    } catch {
      return { error: true };
    }
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      const p = parsed as Record<string, unknown>;
      if (p.title) out.title = String(p.title as string);
      const config = (p.config ?? {}) as Record<string, Record<string, unknown> | undefined>;
      // preprocess.ts processFrontmatter: legacy displayMode moves to gantt.displayMode.
      if (p.displayMode) (config.gantt ??= {}).displayMode = String(p.displayMode as string);
      if (p.config || p.displayMode) out.config = config;
    }
    text = text.slice(m[0].length);
  } else if (text.trimStart().startsWith('---')) {
    // diagram-orchestration.ts: the `---` pseudo-diagram throws "Diagrams beginning with --- …".
    return { error: true };
  }
  try {
    const swapped = text.trim().replace(/'/gm, '"');
    const found: [string, unknown][] = [];
    for (const d of swapped.matchAll(DIRECTIVE)) {
      const args = d[3] ? d[3].trim() : d[4] ? (JSON.parse(d[4].trim()) as unknown) : undefined;
      found.push([d[1] ?? d[2] ?? '', args]);
    }
    out.directives = found;
  } catch {
    // v12 logs and ignores every directive when one fails to parse.
  }
  return out;
}

function v13(src: string, v12Directives: boolean): Read {
  const r = preprocess(src);
  if (r.diagnostics.some((d) => d.severity === 'error')) return { error: true };
  const out: Read = {};
  if (r.frontMatter?.title !== undefined) out.title = r.frontMatter.title;
  if (r.frontMatter?.config !== undefined) out.config = r.frontMatter.config;
  if (v12Directives) out.directives = r.directives.map((d) => [d.name, d.args]);
  return out;
}

const CORPUS_DIR = 'e2e/diagrams';

/**
 * Decided divergences (see `packages/core/src/preprocess/divergences.spec.ts`). A fixture
 * that stops differing must be removed from here.
 */
const BEFORE_FENCE =
  'A `%%` or directive line before the opening fence: v12 reads no front matter; v13 reads it (D704).';
const DIVERGENT: Record<string, string> = {
  'e2e/diagrams/architecture/nightly-check/comment-before-frontmatter.mmd': BEFORE_FENCE,
  'e2e/diagrams/conf-and-directives/pr-check/comment-before-frontmatter.mmd': BEFORE_FENCE,
  'e2e/diagrams/conf-and-directives/pr-check/directive-before-frontmatter.mmd': BEFORE_FENCE,
  'e2e/diagrams/eventmodeling/nightly-check/comment-before-frontmatter.mmd': BEFORE_FENCE,
  'e2e/diagrams/pie/nightly-check/comment-before-frontmatter.mmd': BEFORE_FENCE,
  'e2e/diagrams/requirement/visual-check/with-a-theme-default.mmd':
    'Leading blank line before the opening fence: v12 render() rejects it (run() trims it first); v13 accepts.',
};

describe('preprocess parity with v12 over the e2e corpus', async () => {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, CORPUS_DIR), CORPUS_DIR)) items.push(item);

  it('has a corpus', () => {
    expect(items.length).toBeGreaterThan(2000);
    expect(items.filter((i) => FRONT_MATTER.test(cleanupText(i.source))).length).toBeGreaterThan(
      100
    );
    expect(items.filter((i) => i.source.includes('%%{')).length).toBeGreaterThan(100);
  });

  it('reads the same title, config and directives from every fixture', () => {
    const differing: string[] = [];
    for (const { id, source } of items) {
      const want = v12(source);
      const got = v13(source, want.directives !== undefined);
      if (JSON.stringify(got) !== JSON.stringify(want)) differing.push(id);
    }
    expect(differing).toEqual(Object.keys(DIVERGENT));
  });
});

/** Registered types with no front-matter fixture this test can render, and why that is enough. */
const NO_FIXTURE: Record<string, string> = {
  'flowchart-elk':
    'No fixture opens with `flowchart-elk`, and it needs the elk layout plugin; the flowchart package parses it from `bodyStart` as it does `flowchart-v2`.',
};

/**
 * Preprocess is shared, so a `%%` line or a directive above the fence must not change what any
 * type draws: one front-matter fixture per registered type, with and without the line.
 */
describe('a `%%` line before the front matter, for every diagram type (#1216, D704, D705)', async () => {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, CORPUS_DIR), CORPUS_DIR)) items.push(item);
  const m = createMermaid();
  m.initialize({ deterministic: true });
  const types = m
    .getRegisteredDiagramsMetadata()
    .map((d) => d.id)
    .filter((id) => id !== 'error' && id !== '---');

  /** The first fixture per type that opens with front matter and renders without it. */
  const perType = new Map<string, CorpusItem>();
  for (const item of items) {
    if (!/^\s*---/.test(item.source) || !preprocess(item.source).frontMatter) continue;
    let type: string;
    try {
      type = m.detectType(item.source);
    } catch {
      continue;
    }
    if (perType.has(type)) continue;
    try {
      await m.render('x', item.source);
    } catch {
      continue;
    }
    perType.set(type, item);
  }

  it('has a front-matter fixture for every registered type', () => {
    expect(types.filter((t) => !perType.has(t))).toEqual(Object.keys(NO_FIXTURE));
  });

  it.each([
    ['a `%%` comment line', '%% a comment before the front matter\n'],
    ['an empty `%%{init}%%` directive line', '%%{init: {}}%%\n'],
  ])('draws the same SVG after %s', async (_name, head) => {
    const differing: string[] = [];
    for (const [type, { id, source }] of perType) {
      const [want, got] = [await m.render('x', source), await m.render('x', head + source)];
      if (got.svg !== want.svg || got.diagramType !== want.diagramType)
        differing.push(`${type} ${id}`);
    }
    expect(differing).toEqual([]);
  });
});

/** v12 and v13 `parse()`: accepted or not, and the theme a directive or front matter set. */
async function parsers() {
  await loadOracle();
  const mermaid12 = (
    (await import('mermaid-v12')) as unknown as {
      default: {
        parse(text: string): Promise<{ config?: { theme?: string } }>;
        mermaidAPI: { reset(): void };
      };
    }
  ).default;
  const m = createMermaid();
  const read = async (run: () => Promise<{ config?: { theme?: string } }>) => {
    try {
      return { accepted: true, theme: (await run()).config?.theme };
    } catch {
      return { accepted: false };
    }
  };
  return {
    parse12: (src: string) => {
      mermaid12.mermaidAPI.reset();
      return read(() => mermaid12.parse(src));
    },
    parse13: (src: string) => read(() => m.parse(src)),
  };
}

const BODIES = [
  'flowchart LR\n  A --> B\n',
  'classDiagram\n  class A\n',
  'sequenceDiagram\n  A->>B: hi\n',
  'erDiagram\n  A ||--o{ B : x\n',
  'stateDiagram-v2\n  [*] --> A\n',
];

describe('directives around comments and without a name, against the v12 oracle (#208)', () => {
  // v12 reads a directive only where a word follows `%%{` (blanks allowed). A comment line right
  // after the opener leaves the rest as diagram text; most grammars then reject it.
  const HEADS = [
    '%% c\n%%{init: {"theme": "dark"}}%%\n',
    '%%{\n%% c\ninit: {"theme": "dark"}}%%\n',
    '%%{\n  %% c\n  init: {"theme": "dark"}}%%\n',
    '%%{init:\n%% c\n{"theme": "dark"}}%%\n',
    '%%{\n  init: {"theme": "dark"}}%%\n',
    '%%{}%%\n',
    '%%{ }%%\n',
    '%%{"theme": "dark"}%%\n',
    '%%{: {"theme": "dark"}}%%\n',
  ];
  const cases = HEADS.flatMap((head) => BODIES.map((body) => head + body));
  // ... and inside the body, after the header line.
  cases.push(...BODIES.map((body) => body.replace('\n', '\n  %%{}%%\n')));

  it('accepts, rejects and sets the theme as v12 does', async () => {
    const { parse12, parse13 } = await parsers();
    const differing: string[] = [];
    for (const src of cases) {
      const [want, got] = [await parse12(src), await parse13(src)];
      if (JSON.stringify(got) !== JSON.stringify(want)) differing.push(src);
    }
    expect(differing).toEqual([]);
  });
});

describe('front matter that js-yaml rejects is reported, against the v12 oracle (#208)', () => {
  // A lone `-` or `?` is an indicator, not text, after `key:` and in a flow collection.
  const INVALID = [
    'title: -',
    'title: ?',
    'title: - # c',
    'description: -\n  Vertical (TB) counterpart',
    'config:\n  theme: ?',
    'config: {theme: -}',
    'config:\n  themeVariables: {a: [-]}',
  ];
  it.each(INVALID)('rejects %j', async (yaml) => {
    expect(() => load(yaml, { schema: JSON_SCHEMA })).toThrow();
    const src = `---\n${yaml}\n---\nflowchart LR\n  A\n`;
    const { parse12, parse13 } = await parsers();
    expect(await parse12(src)).toEqual({ accepted: false });
    expect(await parse13(src)).toEqual({ accepted: false });
    expect(preprocess(src).diagnostics.map((d) => d.code)).toContain('YAML_SYNTAX');
  });
});
