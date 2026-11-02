/**
 * Preprocess parity over the e2e corpus (every diagram type: front matter and directives are
 * shared). The v12 side re-runs v12's own steps literally: `preprocess.ts` `cleanupText`,
 * `regexes.ts` `frontMatterRegex`, `frontmatter.ts` (dedent + js-yaml `JSON_SCHEMA`) and
 * `utils.ts` `detectDirective` (`'`→`"` swap, `directiveRegex`, `JSON.parse`).
 */
import { JSON_SCHEMA, load } from 'js-yaml';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { preprocess } from '@mermaid-js/core/preprocess';
import { corpusFromDir, REPO_ROOT } from './corpus.ts';
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
const DIVERGENT: Record<string, string> = {
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
