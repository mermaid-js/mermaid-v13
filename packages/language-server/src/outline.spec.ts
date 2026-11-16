/**
 * The outline over the goldens' fixtures (#810, D580): `documentSymbol` lists every definition
 * that `definition` reaches from some offset, each once, and nothing else; every symbol's
 * name lies inside its range, and its children's ranges inside its own.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLanguageService, LineIndex } from '@mermaid-js/language-service';
import { goldenCases, readFixture } from '@mermaid-js/language-service/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import type { DocumentSymbol, Range } from 'vscode-languageserver';
import { toDocumentSymbols, toRange } from './convert.ts';

const GOLDENS = join(import.meta.dirname, '..', '..', 'language-service', 'goldens');
const cases = goldenCases(GOLDENS);
const service = createLanguageService();
beforeAll(() => service.preload());

const key = (r: Range) => `${r.start.line}:${r.start.character}-${r.end.line}:${r.end.character}`;
const inside = (inner: Range, outer: Range) =>
  (outer.start.line < inner.start.line ||
    (outer.start.line === inner.start.line && outer.start.character <= inner.start.character)) &&
  (inner.end.line < outer.end.line ||
    (inner.end.line === outer.end.line && inner.end.character <= outer.end.character));

/** Every symbol of the tree, with the problems of its nesting. */
function flatten(symbols: readonly DocumentSymbol[], problems: string[], parent?: DocumentSymbol) {
  const out: DocumentSymbol[] = [];
  for (const s of symbols) {
    if (!inside(s.selectionRange, s.range)) problems.push(`${s.name}: name outside its range`);
    if (parent && !inside(s.range, parent.range))
      problems.push(`${s.name}: range outside ${parent.name}'s`);
    out.push(s, ...flatten(s.children ?? [], problems, s));
  }
  return out;
}

describe('documentSymbol on the goldens fixtures', () => {
  it('reads the fixtures of every diagram', () => {
    expect(new Set(cases.map((c) => c.diagram)).size).toBeGreaterThan(30);
  });

  it.each([...new Set(cases.map((c) => c.diagram))])(
    '%s: lists every definition `definition` reaches, once',
    (diagram) => {
      let listed = 0;
      for (const c of cases.filter((x) => x.diagram === diagram)) {
        const { text } = readFixture(readFileSync(c.input, 'utf8'));
        const doc = service.update(`golden:///${diagram}/${c.feature}/${c.name}.mmd`, text);
        const index = new LineIndex(text);
        const reached = new Set<string>();
        for (let offset = 0; offset <= text.length; offset++) {
          const def = doc.definition(offset);
          if (def) reached.add(key(toRange(index, def)));
        }
        const problems: string[] = [];
        const names = flatten(toDocumentSymbols(index, doc.symbols()), problems).map((s) =>
          key(s.selectionRange)
        );
        const where = `${c.feature}/${c.name}`;
        expect(problems, where).toEqual([]);
        expect(names.sort(), where).toEqual([...reached].sort());
        listed += names.length;
      }
      // Some types name nothing (timeline, info); these name things in every fixture set.
      if (['flowchart', 'class', 'state', 'sequence', 'er', 'mindmap'].includes(diagram))
        expect(listed).toBeGreaterThan(0);
    },
    60_000
  );
});
