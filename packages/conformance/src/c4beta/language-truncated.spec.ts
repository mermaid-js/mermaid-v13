/**
 * The c4-beta language service on text being typed (R-LANG-4, spec #730 T6): every source of the
 * c4-beta corpus and every c4-beta golden fixture is cut at each line end and half way through
 * each line, the text a user has when a line is half written, and every query runs at the cut
 * and, on the whole text, at every word edge. None may throw, and the facet may not fail: the
 * service turns a throwing facet into a `LANGUAGE_FACET_FAILED` diagnostic, a rename into a
 * refusal that says so, and an empty answer for completion and hover, so the first two are read
 * and the facet's completion and hover are called directly.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { language } from '@mermaid-js/diagram-c4/language';
import { createLanguageService } from '@mermaid-js/language-service';
import type { DocumentSnapshot } from '@mermaid-js/language-service';
import { readFixture } from '@mermaid-js/language-service/testing';
import { c4betaCorpus } from './corpus.ts';

/** Every this many words, a cut falls inside the word. */
const WORD_STEP = 5;
const GOLDENS = fileURLToPath(new URL('../../../language-service/goldens/c4', import.meta.url));

/** Every c4-beta golden fixture of every feature: the text, markers removed. */
function goldenSources(): { id: string; source: string }[] {
  return readdirSync(GOLDENS, { recursive: true, encoding: 'utf8' })
    .filter((f) => /(^|[/\\])beta-[^/\\]*\.mmd$/.test(f))
    .sort()
    .map((f) => ({ id: f, source: readFixture(readFileSync(join(GOLDENS, f), 'utf8')).text }));
}

/**
 * The cuts of `text`: before each line break, half way through each line, in the middle of
 * every fifth word, and the end.
 */
function cuts(text: string): number[] {
  const at = new Set([0, text.length]);
  const words = [...text.matchAll(/\w{2,}/gu)];
  words.forEach((m, k) => {
    if (k % WORD_STEP === 0) at.add(m.index + Math.ceil(m[0].length / 2));
  });
  let start = 0;
  for (const line of text.split(/(?<=\n)/)) {
    const end = start + line.length;
    at.add(end);
    at.add(end - (/\r?\n$/.exec(line)?.[0].length ?? 0));
    at.add(start + Math.floor(line.length / 2));
    start = end;
  }
  return [...at].sort((a, b) => a - b);
}

/** The word edges of `text`, for the whole-text queries. */
function wordEdges(text: string): number[] {
  const at = new Set([0, text.length]);
  for (const m of text.matchAll(/\w+|\s+|[^\w\s]/gu)) {
    at.add(m.index);
    at.add(m.index + m[0].length);
  }
  return [...at].sort((a, b) => a - b);
}

const service = createLanguageService();
beforeAll(() => service.preload());

/** The facet's own completion and hover at `at`, which the service would turn into nothing. */
function facetAt(text: string, at: number): void {
  const result = language.parse(text, { keepTokens: true, probe: at });
  if (result.probe) language.completions(result.probe, { text, result });
  const plain = language.parse(text, { keepTokens: true });
  const t = plain.tokens;
  let token: { kind: number; range: { start: number; end: number } } | undefined;
  for (let j = 0; t && j < t.length; j++) {
    const start = t.start[j] ?? 0;
    const end = t.end[j] ?? 0;
    if (start <= at && at <= end) token = { kind: t.kind[j] ?? 0, range: { start, end } };
  }
  const symbol = plain.symbols.find((s) => s.range.start <= at && at <= s.range.end);
  language.hover(
    { offset: at, ...(token && { token }), ...(symbol && { symbol }) },
    { text, result: plain }
  );
}

/** What went wrong running every query of `doc` at `offsets`. */
function problemsAt(label: string, doc: DocumentSnapshot, offsets: readonly number[]): string[] {
  const problems: string[] = [];
  const run = (what: string, call: () => unknown) => {
    try {
      call();
    } catch (error) {
      problems.push(`${label}: ${what} threw ${(error as Error).message}`);
    }
  };
  run('diagnostics', () => {
    for (const d of doc.diagnostics())
      if (d.code === 'LANGUAGE_FACET_FAILED') problems.push(`${label}: ${d.message}`);
  });
  run('folding', () => doc.foldingRanges());
  run('semanticTokens', () => doc.semanticTokens());
  for (const at of offsets) {
    run(`facet completions and hover @${at}`, () => facetAt(doc.text, at));
    run(`completions @${at}`, () => doc.completions(at));
    run(`hover @${at}`, () => doc.hover(at));
    run(`definition @${at}`, () => doc.definition(at));
    run(`references @${at}`, () => doc.references(at));
    run(`prepareRename @${at}`, () => doc.prepareRename(at));
    run(`astAt @${at}`, () => doc.astAt(at).map((id) => doc.rangeOf(id)));
    for (const to of ['renamed1', 'a b', 'title']) {
      run(`rename ${to} @${at}`, () => {
        const result = doc.rename(at, to);
        if ('refused' in result && result.refused.includes('language support failed'))
          problems.push(`${label}: rename ${to} @${at}: ${result.refused}`);
      });
    }
  }
  return problems;
}

describe('c4-beta queries on half-written text', () => {
  const sources = [
    ...c4betaCorpus().filter((s) => !/\((CRLF|directive|front matter|comment lines)\)$/.test(s.id)),
    ...goldenSources(),
  ];

  it('reads the corpus and the goldens', () => {
    expect(sources.length).toBeGreaterThan(80);
  });

  it('never throws and never fails the facet, cut at every line end and mid-line', () => {
    const problems: string[] = [];
    let inputs = 0;
    for (const { id, source } of sources) {
      for (const cut of cuts(source)) {
        inputs++;
        const text = source.slice(0, cut);
        const doc = service.update(`test:///${id}@${cut}.mmd`, text);
        problems.push(...problemsAt(`${id} cut at ${cut}`, doc, [text.length]));
        service.close(`test:///${id}@${cut}.mmd`);
      }
    }
    expect(problems).toEqual([]);
    expect(inputs).toBeGreaterThan(2000);
  });

  it('never throws on the whole text at every word edge', () => {
    const problems: string[] = [];
    for (const { id, source } of sources) {
      const doc = service.update(`test:///${id}.mmd`, source);
      problems.push(...problemsAt(id, doc, wordEdges(source)));
      service.close(`test:///${id}.mmd`);
    }
    expect(problems).toEqual([]);
  });
});
