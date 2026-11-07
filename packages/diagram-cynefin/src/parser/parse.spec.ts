import { describe, expect, it } from 'vitest';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import { CynefinTokenKind as T, parseCynefin } from './index.ts';

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

/** Probe mode (R-LANG-7, D95, #470): what the parser would accept at one offset. */
describe('cynefin parser: probe', () => {
  const split = (marked: string): [string, number] => {
    const at = marked.indexOf('¦');
    return [marked.slice(0, at) + marked.slice(at + 1), at];
  };
  const probe = (marked: string) => {
    const [src, at] = split(marked);
    return parseCynefin(src, { probe: at }).probe;
  };
  const expected = (marked: string) => [...(probe(marked)?.expected ?? [])].sort();
  const sorted = (...kinds: number[]) => [...kinds].sort();

  it('returns a probe only on request', () => {
    expect(parseCynefin(H).probe).toBeUndefined();
    expect(probe('cynefin-beta¦')).toMatchObject({ offset: 12 });
  });

  it('expects the header in an empty text', () => {
    expect(probe('¦')?.expected).toEqual(expect.arrayContaining([T.Header]));
  });

  it('expects a domain or a statement at the start of a line', () => {
    expect(probe(H + '¦')?.expected).toEqual(
      expect.arrayContaining([T.DomainName, T.Title, T.AccTitle, T.AccDescr])
    );
    expect(probe(H + '¦')?.expected).not.toContain(T.String);
  });

  it('expects an item at the start of a line inside a block', () => {
    expect(probe(H + 'complex "a"\n¦')?.expected).toEqual(
      expect.arrayContaining([T.String, T.DomainName, T.Title])
    );
  });

  it('expects `-->` or an item after a domain name', () => {
    expect(probe(H + 'complex ¦')?.expected).toEqual(expect.arrayContaining([T.Arrow, T.String]));
  });

  it('expects a domain after `-->`', () => {
    expect(expected(H + 'complex -->¦')).toEqual(sorted(T.DomainName));
    expect(expected(H + 'complex --> ¦')).toEqual(sorted(T.DomainName));
    expect(expected(H + 'complex --> cl¦')).toEqual(sorted(T.DomainName));
  });

  it('expects `:` or the line end after a transition target, and a label after `:`', () => {
    expect(probe(H + 'complex --> clear ¦')?.expected).toContain(T.Colon);
    expect(expected(H + 'complex --> clear :¦')).toEqual(sorted(T.String));
    expect(expected(H + 'complex --> clear : ¦')).toEqual(sorted(T.String));
  });

  it('follows a closed item: right after it another item may follow', () => {
    const p = probe(H + 'complex "a"¦');
    expect(p?.expected).toContain(T.String);
    expect(p?.prefix).toEqual({ start: H.length + 11, end: H.length + 11 });
  });

  it('names where the probe is: code, or inside an item or a statement value', () => {
    const mode = (marked: string) => probe(marked)?.mode;
    expect(mode('¦')).toBe('INITIAL');
    expect(mode(H + 'tit¦')).toBe('INITIAL');
    expect(mode(H + 'title¦')).toBe('INITIAL');
    expect(mode(H + 'title Inc¦ident')).toBe('title');
    expect(mode(H + 'accTitle: x¦')).toBe('accTitle');
    expect(mode(H + 'accDescr {\n  a¦\n}')).toBe('accDescr');
    expect(mode(H + 'accDescr {\n  a\n}¦')).toBe('INITIAL');
    expect(mode(H + 'complex "Pro¦be"')).toBe('string');
    expect(mode(H + 'complex "Probe¦')).toBe('string');
    expect(mode(H + 'complex "Probe"¦')).toBe('INITIAL');
    expect(mode(H + 'complex --> clear : "x¦"')).toBe('string');
    expect(mode(H + '%% c¦')).toBe('comment');
  });
});
