import { describe, expect, it } from 'vitest';
import { leanOf, NO_AST_ID, ParseState } from './index.ts';
import type { AstNode, ParseResult } from './index.ts';

const R = { start: 0, end: 1 };

/** One small parse's side outputs, as a parser records them. */
function record(st: ParseState) {
  st.symbol('A', 'node', R, 'def');
  const block = st.beginStatement('subgraph', 0);
  st.statement('chain', R);
  st.endStatement(block, 5);
  st.diagnostics.warning('W', 'a warning', R);
  return block;
}

describe('ParseState in a lean parse (DESIGN §4.2)', () => {
  it('records symbols and statements in a full parse, and gives the model its ids', () => {
    const st = new ParseState();
    record(st);
    expect(st.lean).toBe(false);
    expect(st.astIds).toBe(true);
    expect(st.symbols).toHaveLength(1);
    expect(st.statements).toEqual([
      { kind: 'subgraph', range: { start: 0, end: 5 }, children: [{ kind: 'chain', range: R }] },
    ]);
  });

  it('records no symbol or statement, but every diagnostic, in a lean parse', () => {
    const st = new ParseState({ lean: true });
    record(st);
    expect(st.lean).toBe(true);
    expect(st.symbols).toEqual([]);
    expect(st.statements).toEqual([]);
    expect(st.diagnostics.list.map((d) => d.code)).toEqual(['W']);
  });

  it('hands out one frozen span in a lean parse, so a parser that writes to it fails', () => {
    const st = new ParseState({ lean: true });
    const span = st.beginStatement('subgraph', 3);
    expect(st.statement('chain', R)).toBe(span);
    expect(Object.isFrozen(span) && Object.isFrozen(span.range)).toBe(true);
    expect(() => {
      span.range.end = 9;
    }).toThrow(TypeError);
  });

  it('gives the model ids in a lean parse only when asked', () => {
    expect(new ParseState({ lean: true }).astIds).toBe(false);
    expect(new ParseState({ lean: true, astIds: true }).astIds).toBe(true);
    expect(new ParseState({ astIds: false }).astIds).toBe(true);
    expect(NO_AST_ID).toBe('');
  });

  it('assembles a lean result with the model and the diagnostics list itself', () => {
    const st = new ParseState({ lean: true });
    record(st);
    const model = { a: 1 };
    const r = st.leanResult(model);
    expect(r).toEqual({ lean: true, model, diagnostics: st.diagnostics.list });
    expect(r.diagnostics).toBe(st.diagnostics.list);
    expect('ast' in r || 'symbols' in r || 'statements' in r).toBe(false);
  });
});

describe('leanOf', () => {
  const ast: AstNode = { id: 'doc', type: 'Document', range: R };
  const full: ParseResult<{ n: number }> = {
    model: { n: 1 },
    ast,
    diagnostics: [],
    symbols: [{ name: 'A', kind: 'node', range: R, role: 'def' }],
    statements: [],
    tokens: {
      kind: new Uint16Array(),
      start: new Uint32Array(),
      end: new Uint32Array(),
      source: '',
      length: 0,
    },
  };

  it('keeps the model, diagnostics, embeds and edge count of a full result, and nothing else', () => {
    const embeds = [{ id: 'b', text: 'pie', offset: 3 }];
    const lean = leanOf({ ...full, embeds, edgeCount: 2 });
    expect(lean).toEqual({ lean: true, model: full.model, diagnostics: [], embeds, edgeCount: 2 });
    expect(lean.model).toBe(full.model);
    for (const key of ['ast', 'symbols', 'statements', 'tokens', 'probe'])
      expect(key in leanOf(full), key).toBe(false);
  });

  it('returns a lean result as it is', () => {
    const lean = leanOf(full);
    expect(leanOf(lean)).toBe(lean);
  });
});
