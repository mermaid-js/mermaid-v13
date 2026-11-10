import { describe, expect, it } from 'vitest';
import { C4TokenKind, detectC4, parseC4 } from '@mermaid-js/diagram-c4';
import type { C4ParseResult } from '@mermaid-js/diagram-c4';
import { c4GateCorpus } from './corpus.ts';

/** Offsets probed per source, besides 0 and the end: token edges, evenly spread. */
const PER_SOURCE = 24;

function outputs(r: C4ParseResult): string {
  const { model, ast, diagnostics, symbols, statements } = r;
  return JSON.stringify({ model, ast, diagnostics, symbols, statements });
}

/** 0, the end, and token starts and ends spread over the source. */
function offsets(r: C4ParseResult, length: number): number[] {
  const tokens = r.tokens;
  const out = new Set([0, length]);
  if (!tokens) return [...out];
  const step = Math.max(1, Math.floor(tokens.length / PER_SOURCE));
  for (let j = 0; j < tokens.length; j += step) {
    out.add(tokens.start[j] ?? 0);
    out.add(tokens.end[j] ?? 0);
  }
  return [...out];
}

/**
 * R-LANG-7 (#543): a probe changes nothing but `probe`. Model, AST, diagnostics, symbols and
 * statements are the same with and without one, at offsets across the c4 gate corpus (the e2e
 * fixtures, the v12 spec strings and the cases, rejected ones included, each in every generated
 * variant); the probe reports the offset and a mode (a jison start condition, or where the
 * offset is outside code).
 */
describe('c4 probe leaves the parse unchanged', () => {
  it('over the gate corpus', async () => {
    const sources = (await c4GateCorpus()).filter((i) => detectC4(i.source));
    expect(sources.length).toBeGreaterThan(1000);
    const problems: string[] = [];
    let probes = 0;
    for (const { id, source } of sources) {
      const plain = parseC4(source, { keepTokens: true });
      const want = outputs(plain);
      for (const at of offsets(plain, source.length)) {
        probes++;
        const r = parseC4(source, { keepTokens: true, probe: at });
        if (outputs(r) !== want) problems.push(`${id} @${at}: output differs`);
        const p = r.probe;
        if (!p || p.offset !== at || p.prefix.end !== at || p.prefix.start > at || p.mode === '') {
          problems.push(`${id} @${at}: bad probe ${JSON.stringify(p)}`);
        }
      }
    }
    expect(problems).toEqual([]);
    expect(probes).toBeGreaterThan(20_000);
  }, 120_000);

  it('expects a header first, a statement after each line break, an argument in a call', () => {
    const src = 'C4Context\nPerson(a, "A")\n\nRel(a, a, "x")\n';
    const probe = (at: number) => parseC4(src, { probe: at }).probe!;
    expect(probe(0).expected).toEqual([
      C4TokenKind.C4Context,
      C4TokenKind.C4Container,
      C4TokenKind.C4Component,
      C4TokenKind.C4Dynamic,
      C4TokenKind.C4Deployment,
    ]);
    const statement = probe(src.indexOf('\n\n') + 1).expected;
    expect(statement).toContain(C4TokenKind.Person);
    expect(statement).toContain(C4TokenKind.Title);
    expect(statement).not.toContain(C4TokenKind.RBrace);
    expect(probe(src.length).expected).toEqual(statement);
    const inArgs = probe(src.indexOf('(a') + 1);
    expect(inArgs.mode).toBe('attribute');
    expect(inArgs.expected).toContain(C4TokenKind.Str);
    expect(inArgs.expected).toContain(C4TokenKind.ArgsClose);
    expect(probe(src.indexOf('"A"') + 1).mode).toBe('string');
    const inBoundary = 'C4Context\nBoundary(b, "B") {\n  Person(a, "A")\n  \n}';
    const at = inBoundary.lastIndexOf('  \n') + 2;
    expect(parseC4(inBoundary, { probe: at }).probe!.expected).toContain(C4TokenKind.RBrace);
  });
});
