/**
 * The Monarch tokenizer (#36) and the TextMate grammar (#176) read a leading front matter block
 * as front matter: YAML in it never leaves a flowchart mode open into the diagram, so the
 * diagram's highlighting is the same with or without it.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { preprocess } from '@mermaid-js/core/preprocess';
import { detectFlowchart } from '@mermaid-js/diagram-flowchart';
import { generate, generatedDir } from './generate.ts';
import { monarchCategorise, textMateCategorise } from './highlight-testing.ts';
import type { Categorise } from './highlight-testing.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const files = generate((p) => readFileSync(join(root, p), 'utf8'));
const out = (name: string) => files.get(`${generatedDir('flowchart')}/${name}`) ?? '';
const HIGHLIGHTERS: [string, Categorise][] = [
  ['Monarch', monarchCategorise(out('flowchart.monarch.json'))],
  [
    'TextMate',
    await textMateCategorise(out('flowchart.tmLanguage.json'), 'source.mermaid-flowchart'),
  ],
];

function mmdFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return mmdFiles(join(dir, e.name));
    return e.name.endsWith('.mmd') ? [join(dir, e.name)] : [];
  });
}

/** Front matter whose YAML would open a flowchart mode (`'`, `(`, `"`, `[`, `{`). */
const FIXTURES: [string, string][] = [
  ['quote', "---\ntitle: it's (open\n---\nflowchart LR\n  A --> B\n"],
  ['string', '---\ntitle: "unclosed\nconfig:\n  theme: [dark\n---\nflowchart LR\n  A[x] --> B\n'],
  ['shape data', '---\na: A@{ shape\n---\ngraph TD\n  A --> B\n'],
  ['crlf', "---\r\ntitle: it's\r\n---\r\nflowchart LR\r\n  A --> B\r\n"],
  // The fence is on the first non-blank line, at any indent (core preprocess, #36 review).
  ['blank line first', "\n---\ntitle: it's (open\n---\nflowchart LR\n  A --> B\n"],
  ['blank lines with spaces', "  \n\n \t\n---\ntitle: it's (open\n---\nflowchart LR\n  A --> B\n"],
  ['indented fences', "  ---\n  title: it's (open\n  ---\nflowchart LR\n  A --> B\n"],
  ['indented crlf', "\r\n  ---\r\n  title: it's\r\n  ---\r\nflowchart LR\r\n  A --> B\r\n"],
];

const blank = (src: string, end: number) => src.slice(0, end).replace(/[^\n]/g, ' ');

describe.each(HIGHLIGHTERS)('%s front matter', (_name, highlight) => {
  const corpus = mmdFiles(join(root, 'e2e/diagrams'))
    .map((f) => [f.slice(root.length), readFileSync(f, 'utf8')] as const)
    .filter(([, src]) => src.startsWith('---') && detectFlowchart(src) !== undefined);

  it('highlights the diagram after front matter as if the front matter were blank', () => {
    expect(corpus.length).toBeGreaterThan(20);
    const differ: string[] = [];
    for (const [file, src] of [...FIXTURES, ...corpus]) {
      const end = preprocess(src).bodyStart;
      expect(end, file).toBeGreaterThan(0);
      const got = highlight(src).slice(end);
      const want = highlight(blank(src, end) + src.slice(end)).slice(end);
      if (got.join() !== want.join()) differ.push(file);
    }
    expect(differ).toEqual([]);
  });

  it('marks the fences as meta and YAML keys as variables', () => {
    const src = '---\ntitle: x # note\n---\nflowchart LR\n';
    const cats = highlight(src);
    expect(cats.slice(0, 3)).toEqual(['Meta', 'Meta', 'Meta']);
    expect(cats.slice(4, 9)).toEqual(Array(5).fill('Variable'));
    expect(cats[src.indexOf('#')]).toBe('Comment');
    expect(cats.slice(20, 23)).toEqual(['Meta', 'Meta', 'Meta']);
    expect(cats[src.indexOf('flowchart')]).toBe('Keyword');
  });

  it('reads `---` only on the first line as an opening fence', () => {
    const cats = highlight('flowchart LR\n---\n');
    expect(cats.slice(13, 16)).not.toEqual(['Meta', 'Meta', 'Meta']);
  });

  it('reads one block: a `---` line after the closing fence opens nothing', () => {
    const src = '---\na: 1\n---\n---\nflowchart LR\n';
    const cats = highlight(src);
    expect(cats.slice(13, 16)).not.toEqual(['Meta', 'Meta', 'Meta']);
  });
});
