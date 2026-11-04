/**
 * Corpus property test (D99 suite 3, R-LANG-4): over every `e2e/diagrams/**\/*.mmd`, every
 * query at every token boundary terminates, never throws and stays in budget.
 *
 * Boundaries: the start and end of every token the facet's lexer produced (types with a
 * facet), plus the start and end of every word, blank run and punctuation character (every
 * type, so the generic features are covered too), plus 0 and the text's length.
 *
 * Invariants: semantic tokens are sorted and never overlap (editors require both), and every
 * completion item replaces a range on the cursor's line that contains the cursor (Monaco and
 * CodeMirror drop items whose range spans lines).
 *
 * Budget, as a ratio (timing tests never assert absolute times): no query call takes longer
 * than {@link RATIO} times the document's own `update` (a full re-parse, best of three), best
 * of three calls, in CPU time, with a {@link FLOOR_MS} floor for timer noise on tiny documents.
 * The absolute 10 ms budget on a 50k-character document is the bench package's
 * `language` script.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createLanguageService } from './index.ts';
import { contextOf } from './snapshot.ts';
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
  const tokens = contextOf(doc).result?.tokens;
  for (let i = 0; tokens && i < tokens.length; i++) {
    at.add(tokens.start[i]!);
    at.add(tokens.end[i]!);
  }
  return [...at].sort((a, b) => a - b);
}

/**
 * CPU time of this process in ms: a loaded machine (a parallel `pnpm test`, a build) makes the
 * worker wait for a core, which wall time would count against the query.
 */
function cpuMs(): number {
  const { user, system } = process.cpuUsage();
  return (user + system) / 1000;
}

/** Best of three `update`s, in CPU ms. */
function updateMs(uri: string, text: string): number {
  let best = Infinity;
  for (let i = 0; i < 3; i++) {
    const t = cpuMs();
    service.update(uri, text);
    best = Math.min(best, cpuMs() - t);
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
    // Best of three when the first call is over: a GC pause or a busy CI core is not repeated,
    // a slow query is.
    let ms = Infinity;
    for (let i = 0; i < 3 && ms > limit; i++) {
      const t = cpuMs();
      try {
        call();
      } catch (error) {
        problems.push(`${name}: ${where} threw ${(error as Error).message}`);
        return;
      }
      ms = Math.min(ms, cpuMs() - t);
    }
    if (ms > limit) problems.push(`${name}: ${where} took ${ms.toFixed(1)} ms (> ${limit} ms)`);
  };
  run('diagnostics', () => doc.diagnostics());
  run('foldingRanges', () => doc.foldingRanges());
  run('semanticTokens', () => doc.semanticTokens());
  const tokens = doc.semanticTokens();
  for (let i = 1; i < tokens.length; i++) {
    const [a, b] = [tokens[i - 1]!.range, tokens[i]!.range];
    if (b.start < a.end)
      problems.push(
        `${name}: semantic tokens [${a.start},${a.end}) and [${b.start},${b.end}) overlap or are unsorted`
      );
  }
  for (const at of boundaries(doc)) {
    run('definition', () => doc.definition(at), at);
    run('references', () => doc.references(at), at);
    run('references(no declaration)', () => doc.references(at, false), at);
    run('prepareRename', () => doc.prepareRename(at), at);
    run('rename', () => doc.rename(at, 'renamed1'), at);
    run('astAt', () => doc.astAt(at).map((id) => doc.rangeOf(id)), at);
    run('completions', () => doc.completions(at), at);
    const bad = doc
      .completions(at)
      .find(
        ({ range: r }) =>
          r.start > at || r.end < at || /[\r\n]/.test(doc.text.slice(r.start, r.end))
      );
    if (bad)
      problems.push(
        `${name}: completion ${JSON.stringify(bad.label)} @${at} replaces [${bad.range.start},${bad.range.end}), off the cursor's line`
      );
    run('hover', () => doc.hover(at), at);
  }
  service.close(uri);
  return problems;
}

describe('every query at every token boundary of the corpus', () => {
  it('reads the whole corpus', () => {
    expect(corpus.length).toBeGreaterThan(2000);
    expect(byType.get('flowchart')?.length).toBeGreaterThan(400);
  });

  it.each([...byType.keys()])(
    '%s',
    (type) => {
      const problems = byType
        .get(type)!
        .flatMap((file) => check(relative(CORPUS, file), readFileSync(file, 'utf8')));
      expect(problems).toEqual([]);
    },
    120_000
  );
});

describe('the boundaries', () => {
  it('include every token edge and every word edge', () => {
    const doc = service.update('test:///b.mmd', 'flowchart TD\n  A-->B\n');
    expect(boundaries(doc)).toEqual([0, 9, 10, 12, 13, 15, 16, 17, 18, 19, 20, 21]);
  });
});
