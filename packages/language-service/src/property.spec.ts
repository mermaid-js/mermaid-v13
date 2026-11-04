/**
 * Corpus property test (D99 suite 3, R-LANG-4): over every `e2e/diagrams/**\/*.mmd`, every
 * query at every token boundary terminates, never throws and stays in budget.
 *
 * Boundaries: the start and end of every token the facet's lexer produced (types with a
 * facet), plus the start and end of every word, blank run and punctuation character (every
 * type, so the generic features are covered too), plus 0 and the text's length.
 *
 * Budget, as a ratio (timing tests never assert absolute times): no single query call takes
 * longer than {@link RATIO} times the document's own `update` (a full re-parse), with a
 * {@link FLOOR_MS} floor for timer and GC noise on tiny documents. The absolute 10 ms budget
 * on a 50k-character document is the bench package's `language` script.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { performance } from 'node:perf_hooks';
import { beforeAll, describe, expect, it } from 'vitest';
import { createLanguageService } from './index.ts';
import type { DocumentSnapshot } from './index.ts';

const REPO = join(import.meta.dirname, '..', '..', '..');
const CORPUS = join(REPO, 'e2e', 'diagrams');
const RATIO = 5;
const FLOOR_MS = 25;

const corpus = (readdirSync(CORPUS, { recursive: true }) as string[])
  .filter((f) => f.endsWith('.mmd'))
  .sort()
  .map((f) => join(CORPUS, f));
const byType = new Map<string, string[]>();
for (const f of corpus) {
  const type = relative(CORPUS, f).split(/[/\\]/)[0]!;
  byType.set(type, [...(byType.get(type) ?? []), f]);
}

const service = createLanguageService();
beforeAll(() => service.preload());

/** Every token boundary of `doc`, sorted. */
function boundaries(doc: DocumentSnapshot): number[] {
  const at = new Set([0, doc.text.length]);
  for (const m of doc.text.matchAll(/\w+|\s+|[^\w\s]/gu)) {
    at.add(m.index);
    at.add(m.index + m[0].length);
  }
  const tokens = doc.context.result?.tokens;
  for (let i = 0; tokens && i < tokens.length; i++) {
    at.add(tokens.start[i]!);
    at.add(tokens.end[i]!);
  }
  return [...at].sort((a, b) => a - b);
}

/** Best of three `update`s, in ms. */
function updateMs(uri: string, text: string): number {
  let best = Infinity;
  for (let i = 0; i < 3; i++) {
    const t = performance.now();
    service.update(uri, text);
    best = Math.min(best, performance.now() - t);
  }
  return best;
}

/** Every problem found running every query at every boundary of `text`. */
function check(name: string, text: string): string[] {
  const uri = `corpus:///${name}`;
  const limit = Math.max(FLOOR_MS, RATIO * updateMs(uri, text));
  const doc = service.update(uri, text);
  const problems: string[] = [];
  const run = (query: string, call: () => unknown, offset?: number) => {
    const where = offset === undefined ? query : `${query} @${offset}`;
    const t = performance.now();
    try {
      call();
    } catch (error) {
      problems.push(`${name}: ${where} threw ${(error as Error).message}`);
      return;
    }
    const ms = performance.now() - t;
    if (ms > limit) problems.push(`${name}: ${where} took ${ms.toFixed(1)} ms (> ${limit} ms)`);
  };
  run('diagnostics', () => doc.diagnostics());
  run('foldingRanges', () => doc.foldingRanges());
  run('semanticTokens', () => doc.semanticTokens());
  for (const at of boundaries(doc)) {
    run('definition', () => doc.definition(at), at);
    run('references', () => doc.references(at), at);
    run('references(no declaration)', () => doc.references(at, false), at);
    run('prepareRename', () => doc.prepareRename(at), at);
    run('rename', () => doc.rename(at, 'renamed1'), at);
    run('astAt', () => doc.astAt(at).map((id) => doc.rangeOf(id)), at);
  }
  service.close(uri);
  return problems;
}

describe('every query at every token boundary of the corpus', () => {
  it('reads the whole corpus', () => {
    expect(corpus.length).toBeGreaterThan(2000);
    expect(byType.get('flowchart')?.length).toBeGreaterThan(400);
  });

  it.each([...byType.keys()])('%s', (type) => {
    const problems = byType
      .get(type)!
      .flatMap((file) => check(relative(CORPUS, file), readFileSync(file, 'utf8')));
    expect(problems).toEqual([]);
  });
});

describe('the boundaries', () => {
  it('include every token edge and every word edge', () => {
    const doc = service.update('test:///b.mmd', 'flowchart TD\n  A-->B\n');
    expect(boundaries(doc)).toEqual([0, 9, 10, 12, 13, 15, 16, 17, 18, 19, 20, 21]);
  });
});
