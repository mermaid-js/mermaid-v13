import { describe, expect, it } from 'vitest';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import { parseCynefin } from './index.ts';

const H = 'cynefin-beta\n';
const parse = (src: string) => {
  const r = parseCynefin(src);
  expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return r;
};
const ids = (src: string) => {
  const out: string[] = [];
  const walk = (n: AstNode) => {
    out.push(n.id);
    for (const c of n.children ?? []) walk(c);
  };
  for (const c of parseCynefin(src).ast.children) walk(c);
  return out;
};

/** The parser seam (spec #423 T2): the model as v12's `cynefinDb.ts` held it, frozen. */
describe('cynefin parser: model', () => {
  it('keeps the first position of a domain and the items of its last block (D364)', () => {
    const { model } = parse(H + 'complex\n"a"\nclear\n"b"\ncomplex\n"c"\n"d"\n');
    expect(model.domains.map((d) => [d.name, d.ast, d.items.map((i) => i.label)])).toEqual([
      ['complex', 'd:complex@2', ['c', 'd']],
      ['clear', 'd:clear', ['b']],
    ]);
  });

  it('reads blocks, items and statements that share a line', () => {
    const { model } = parse('cynefin-beta complex "a" clear "b" chaotic title T\n');
    expect(model.domains.map((d) => [d.name, d.items.map((i) => i.label)])).toEqual([
      ['complex', ['a']],
      ['clear', ['b']],
      ['chaotic', []],
    ]);
    expect(model.title).toBe('T');
  });

  it('converts labels as Langium did: quotes off, `\\x` unescaped, never trimmed', () => {
    const { model } = parse(H + 'complex\n"a\\nb\\tc\\\\d\\qe" \'x\' "  y  " ""\n');
    expect(model.domains[0]?.items.map((i) => i.label)).toEqual(['a\nb\tc\\dqe', 'x', '  y  ', '']);
  });

  it('keeps transitions in source order, an empty label as none, self-loops out (D365)', () => {
    const { model } = parse(
      H + 'complex --> clear : "a"\nclear --> clear\nclear-->complex:""\ncomplex --> clear\n'
    );
    expect(model.transitions).toEqual([
      { from: 'complex', to: 'clear', label: 'a', ast: 't:complex>clear' },
      { from: 'clear', to: 'complex', ast: 't:clear>complex' },
      { from: 'complex', to: 'clear', ast: 't:complex>clear#2' },
    ]);
  });

  it('lets the last title win, and an empty one fall back to the front matter (D218)', () => {
    expect(parse(H + 'title one\ntitle two\n').model.title).toBe('two');
    expect(parse(H + 'title one\ntitle\n').model.title).toBeUndefined();
    const fm = '---\ntitle: Front\n---\n';
    expect(parse(fm + H + 'title\n').model.title).toBe('Front');
    expect(parse(fm + H + 'title In text\n').model.title).toBe('In text');
  });

  it('reads accTitle and accDescr as commonDb kept them', () => {
    const { model } = parse(H + 'accTitle:   a   b  \naccDescr {\n  one\n\n    two\n}\n');
    expect([model.accTitle, model.accDescr]).toEqual(['a b', 'one\ntwo']);
  });

  it('is frozen', () => {
    const { model } = parse(H + 'complex "a"\ncomplex --> clear\n');
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.domains)).toBe(true);
    expect(Object.isFrozen(model.domains[0])).toBe(true);
    expect(Object.isFrozen(model.domains[0]?.items)).toBe(true);
    expect(Object.isFrozen(model.domains[0]?.items[0])).toBe(true);
    expect(Object.isFrozen(model.transitions)).toBe(true);
    expect(Object.isFrozen(model.transitions[0])).toBe(true);
    expect(Object.isFrozen(model.warnings)).toBe(true);
  });
});

describe('cynefin parser: AST', () => {
  it('gives every node its semantic id (pitfall 9)', () => {
    expect(
      ids(
        H +
          'title T\naccTitle: a\naccDescr: d\ncomplex "a" "a"\ncomplex "a" "b@#"\n' +
          'complex --> clear\ncomplex --> clear : "x"\ncomplex --> complex\n'
      )
    ).toEqual([
      'header',
      'title',
      'accTitle',
      'accDescr',
      'd:complex',
      'i:complex/a',
      'i:complex/a@2',
      'd:complex@2',
      'i:complex/a@3',
      'i:complex/b%40%23',
      't:complex>clear',
      't:complex>clear#2',
      't:complex>complex',
    ]);
  });

  it('keeps the self-loop statement in the AST, with its source range', () => {
    const src = H + 'complex --> complex : "x"\n';
    const t = parse(src).ast.children[1];
    expect(t?.type).toBe('Transition');
    expect(t && src.slice(t.range.start, t.range.end)).toBe('complex --> complex : "x"');
  });

  it('runs a block from its name to its last item', () => {
    const src = H + 'complex\n  "a"\n\n  "b"\n\nclear\n';
    const [, complex, clear] = parse(src).ast.children;
    expect(complex && src.slice(complex.range.start, complex.range.end)).toBe(
      'complex\n  "a"\n\n  "b"'
    );
    expect(clear && src.slice(clear.range.start, clear.range.end)).toBe('clear');
  });

  it('gives the model the ids of the drawn nodes', () => {
    const { model } = parse(H + 'clear "a"\nclear "a" "b"\n');
    expect(model.domains[0]?.items.map((i) => i.ast)).toEqual(['i:clear/a@2', 'i:clear/b']);
  });
});

describe('cynefin parser: symbols and statements', () => {
  it('defines a domain at its first block and refers to it elsewhere (D367)', () => {
    const src = H + 'complex\nclear --> complex\ncomplex "a"\n';
    const syms = parse(src).symbols.map((s) => [
      s.name,
      s.kind,
      s.role,
      src.slice(s.range.start, s.range.end),
    ]);
    expect(syms).toEqual([
      ['complex', 'domain', 'def', 'complex'],
      ['clear', 'domain', 'ref', 'clear'],
      ['complex', 'domain', 'ref', 'complex'],
      ['complex', 'domain', 'ref', 'complex'],
    ]);
  });

  it('records a statement per line, items inside their block', () => {
    const { statements } = parse(H + 'title T\ncomplex\n "a"\ncomplex --> clear\n');
    expect(statements.map((s) => [s.kind, (s.children ?? []).map((c) => c.kind)])).toEqual([
      ['header', []],
      ['title', []],
      ['domain', ['item']],
      ['transition', []],
    ]);
  });
});

describe('cynefin parser: warnings', () => {
  it('warns once for every replaced block, naming them (D364)', () => {
    const r = parse(H + 'complex\n"a"\nclear\ncomplex\n"b"\nclear\ncomplex\n');
    const w = r.diagnostics.filter((d) => d.code === 'CYNEFIN_DUPLICATE_DOMAIN');
    expect(w).toHaveLength(1);
    expect(w[0]?.severity).toBe('warning');
    expect(w[0]?.message).toBe(
      'Only the last block of a domain is drawn: the `complex` block at line 2, the `clear` block at line 4 and the `complex` block at line 5 are replaced by a later block, and their items are not drawn. Put all the items of a domain in one block.'
    );
    expect(r.model.warnings).toEqual(w);
  });

  it('warns once for every self-loop, naming them (D365)', () => {
    const r = parse(H + 'complex --> complex\nclear --> chaotic\nclear --> clear : "x"\n');
    const w = r.diagnostics.filter((d) => d.code === 'CYNEFIN_SELF_LOOP');
    expect(w).toHaveLength(1);
    expect(w[0]?.severity).toBe('warning');
    expect(w[0]?.message).toBe(
      'A transition from a domain to itself is not drawn: `complex --> complex` at line 2 and `clear --> clear` at line 4. A transition goes from one domain to another.'
    );
  });

  it('gives no warning for a plain diagram', () => {
    expect(parse(H + 'complex "a"\nclear "b"\ncomplex --> clear\n').diagnostics).toEqual([]);
  });
});
