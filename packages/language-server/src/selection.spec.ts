/**
 * Selection ranges over the corpus (#810): at every word and punctuation boundary of every
 * `e2e/diagrams/**\/*.mmd`, the chain never throws, starts with a range holding the cursor,
 * and every range strictly contains the one before, in offsets and as LSP positions.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createLanguageService, LineIndex } from '@mermaid-js/language-service';
import type { DocumentSnapshot, Range } from '@mermaid-js/language-service';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Position, SelectionRange } from 'vscode-languageserver';
import { toSelectionRange } from './convert.ts';
import { selectionChain } from './selection.ts';

const CORPUS = join(import.meta.dirname, '..', '..', '..', 'e2e', 'diagrams');
const corpus = (readdirSync(CORPUS, { recursive: true }) as string[])
  .filter((f) => f.endsWith('.mmd'))
  .sort();
const byType = new Map<string, string[]>();
for (const f of corpus) {
  const type = f.split(/[/\\]/)[0]!;
  byType.set(type, [...(byType.get(type) ?? []), f]);
}

const service = createLanguageService();
beforeAll(() => service.preload());

/** 0, the text's length, and the start and end of every word, blank run and punctuation. */
function boundaries(text: string): number[] {
  const at = new Set([0, text.length]);
  for (const m of text.matchAll(/\w+|\s+|[^\w\s]/gu)) {
    at.add(m.index);
    at.add(m.index + m[0].length);
  }
  return [...at].sort((a, b) => a - b);
}

const holds = (outer: Range, inner: Range) =>
  outer.start <= inner.start &&
  inner.end <= outer.end &&
  (outer.start < inner.start || inner.end < outer.end);
const before = (a: Position, b: Position) =>
  a.line < b.line || (a.line === b.line && a.character < b.character);
const notAfter = (a: Position, b: Position) => !before(b, a);

/** Every problem with the chains of `doc`. */
function check(name: string, doc: DocumentSnapshot): string[] {
  const problems: string[] = [];
  const index = new LineIndex(doc.text);
  for (const at of boundaries(doc.text)) {
    let chain: Range[];
    let lsp: SelectionRange;
    try {
      chain = selectionChain(doc, at);
      lsp = toSelectionRange(index, chain);
    } catch (error) {
      problems.push(`${name} @${at}: threw ${(error as Error).message}`);
      continue;
    }
    const first = chain[0];
    if (!first || first.start > at || at > first.end)
      problems.push(`${name} @${at}: the first range does not hold the cursor`);
    for (let i = 1; i < chain.length; i++)
      if (!holds(chain[i]!, chain[i - 1]!))
        problems.push(`${name} @${at}: range ${i} does not strictly contain range ${i - 1}`);
    const last = chain[chain.length - 1];
    if (last?.start !== 0 || last.end !== doc.text.length)
      problems.push(`${name} @${at}: the last range is not the whole text`);
    for (let s: SelectionRange = lsp; s.parent; s = s.parent) {
      const [inner, outer] = [s.range, s.parent.range];
      const nested =
        notAfter(outer.start, inner.start) &&
        notAfter(inner.end, outer.end) &&
        (before(outer.start, inner.start) || before(inner.end, outer.end));
      if (!nested)
        problems.push(
          `${name} @${at}: LSP range ${JSON.stringify(outer)} is not strictly around ${JSON.stringify(inner)}`
        );
    }
  }
  return problems;
}

describe('selection ranges at every boundary of the corpus', () => {
  it('reads the whole corpus', () => {
    expect(corpus.length).toBeGreaterThan(2000);
  });

  it.each([...byType.keys()])(
    '%s',
    (type) => {
      const problems = byType.get(type)!.flatMap((file) => {
        const text = readFileSync(join(CORPUS, file), 'utf8');
        const uri = `corpus:///${file}`;
        const found = check(relative(CORPUS, join(CORPUS, file)), service.update(uri, text));
        service.close(uri);
        return found;
      });
      expect(problems).toEqual([]);
    },
    120_000
  );
});
