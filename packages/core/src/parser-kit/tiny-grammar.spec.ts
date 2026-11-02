/**
 * A tiny hand-written grammar built only from the public parser kit, the way a diagram
 * parser uses it. It is the reference example for diagram authors.
 *
 *   doc   := (stmt? (NEWLINE | ';'))* EOF
 *   stmt  := node ('-->' node)? | 'style' ID WORD* | 'group' ID NEWLINE doc 'end'
 *   node  := ID ('[' TEXT ']')?
 *
 * `%% …` comments are trivia.
 */
import { describe, expect, it } from 'vitest';
import {
  charTable,
  ExpectedTable,
  FIRST_DIAGRAM_KIND,
  hasClass,
  isBlank,
  isUnicodeLetter,
  Kind,
  kindSet,
  lineEnd,
  LineIndex,
  matchAt,
  newlineAt,
  ParseState,
  scanWhile,
  syncTo,
  TokenCursor,
  TokenWriter,
} from './index.ts';
import type { AstNode, ParseOptions, ParseResult, Range, TokenStream } from './index.ts';

// ---- tokens ---------------------------------------------------------------------------

const T = {
  Id: FIRST_DIAGRAM_KIND,
  Arrow: FIRST_DIAGRAM_KIND + 1,
  Open: FIRST_DIAGRAM_KIND + 2,
  Text: FIRST_DIAGRAM_KIND + 3,
  Close: FIRST_DIAGRAM_KIND + 4,
  Semi: FIRST_DIAGRAM_KIND + 5,
  Style: FIRST_DIAGRAM_KIND + 6,
  Group: FIRST_DIAGRAM_KIND + 7,
  End: FIRST_DIAGRAM_KIND + 8,
} as const;

const KEYWORDS: Record<string, number> = { style: T.Style, group: T.Group, end: T.End };
const ID = 1;
const CHARS = charTable([ID, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_']);
const isIdChar = (c: number) => hasClass(CHARS, c, ID) || isUnicodeLetter(c);
const ARROW = /-->/y;

function lex(src: string): TokenStream {
  const w = new TokenWriter();
  let i = 0;
  while (i < src.length) {
    const c = src.charCodeAt(i);
    const nl = newlineAt(src, i);
    let j: number;
    if (nl) {
      w.push(Kind.Newline, i, i + nl, src.slice(i, i + nl));
      i += nl;
      continue;
    }
    if (isBlank(c)) {
      i = scanWhile(src, i, isBlank);
      continue;
    }
    if (src.startsWith('%%', i)) {
      j = lineEnd(src, i);
      w.push(Kind.Comment, i, j, src.slice(i, j));
    } else if ((j = matchAt(ARROW, src, i)) >= 0) {
      w.push(T.Arrow, i, j, '-->');
    } else if (c === 91 /* [ */) {
      w.push(T.Open, i, i + 1, '[');
      j = i + 1;
      while (j < src.length && src[j] !== ']' && !newlineAt(src, j)) j++;
      if (j > i + 1) w.push(T.Text, i + 1, j, src.slice(i + 1, j));
      if (src[j] === ']') w.push(T.Close, j, ++j, ']');
    } else if (c === 59 /* ; */) {
      w.push(T.Semi, i, (j = i + 1), ';');
    } else if (isIdChar(c)) {
      j = scanWhile(src, i, isIdChar);
      const word = src.slice(i, j);
      w.push(KEYWORDS[word] ?? T.Id, i, j, word);
    } else {
      w.push(Kind.Error, i, (j = i + 1), src[i] ?? '');
    }
    i = j;
  }
  return w.finish(src.length);
}

const EXPECTED = new ExpectedTable([
  ['a node id', [T.Id]],
  ['an arrow `-->`', [T.Arrow]],
  ['a label `[…]`', [T.Open]],
  ['`]`', [T.Close]],
  ['`end`', [T.End]],
  ['a line break or `;`', [Kind.Newline, T.Semi]],
  ['the end of the text', [Kind.EOF]],
]);

// ---- model and AST --------------------------------------------------------------------

interface TinyModel {
  nodes: { id: string; label?: string; ast: string }[];
  edges: { from: string; to: string; ast: string }[];
}
interface TinyNode extends AstNode<'Node'> {
  name: string;
  label?: string;
}
interface TinyEdge extends AstNode<'Edge'> {
  children: [TinyNode, TinyNode];
}

// ---- parser ---------------------------------------------------------------------------

const BOUNDARY = kindSet(Kind.Newline, T.Semi);

function parse(src: string, options: ParseOptions = {}): ParseResult<TinyModel> {
  const tokens = lex(src);
  const cur = new TokenCursor(tokens);
  const st = new ParseState();
  const model: TinyModel = { nodes: [], edges: [] };
  const known = new Map<string, TinyModel['nodes'][number]>();

  function fail(found: Range, want: number[]): void {
    st.diagnostics.unexpected('UNEXPECTED', found, EXPECTED.names(want), EXPECTED.name(cur.kind));
    syncTo(cur, BOUNDARY);
  }

  function node(): TinyNode | undefined {
    if (!cur.at(T.Id)) return void fail(cur.range, [T.Id]);
    const name = cur.text;
    const start = cur.start;
    const nameRange = cur.range;
    cur.next();
    let label: string | undefined;
    let end = nameRange.end;
    if (cur.at(T.Open)) {
      const open = cur.range;
      cur.next();
      if (cur.at(T.Text)) {
        label = cur.text;
        cur.next();
      }
      if (!cur.at(T.Close)) {
        st.diagnostics.error('UNCLOSED_LABEL', 'Unclosed node label.', cur.range, {
          related: [{ message: 'The label starts here.', range: open }],
        });
        syncTo(cur, BOUNDARY);
        return undefined;
      }
      end = cur.end;
      cur.next();
    }
    const first = !known.has(name);
    st.symbol(name, 'node', nameRange, first ? 'def' : 'ref');
    const ast = st.ids.node(name);
    if (first) {
      const v = { id: name, ast, ...(label === undefined ? {} : { label }) };
      known.set(name, v);
      model.nodes.push(v);
    } else if (label !== undefined) {
      (known.get(name) as TinyModel['nodes'][number]).label = label;
    }
    return {
      id: ast,
      type: 'Node',
      range: { start, end },
      name,
      ...(label === undefined ? {} : { label }),
    };
  }

  function statement(): AstNode | undefined {
    const start = cur.start;
    if (cur.at(T.Style)) {
      cur.next();
      if (!cur.at(T.Id)) return void fail(cur.range, [T.Id]);
      st.symbol(cur.text, 'node', cur.range, 'ref');
      syncTo(cur, BOUNDARY); // style words: anything to the end of the statement
      const range = { start, end: cur.tokens.end[cur.pos - 1] ?? start };
      st.statement('style', range);
      return { id: st.ids.statement('st'), type: 'Style', range };
    }
    if (cur.at(T.Group)) {
      cur.next();
      if (!cur.at(T.Id)) return void fail(cur.range, [T.Id]);
      const id = st.ids.subgraph(cur.text);
      cur.next();
      const children: AstNode[] = [];
      const inner = st.beginStatement('group', start);
      body(children, T.End);
      if (!cur.at(T.End)) {
        st.diagnostics.error('UNCLOSED_GROUP', 'Group is missing its `end`.', cur.range, {
          related: [{ message: 'The group starts here.', range: { start, end: start + 5 } }],
        });
        st.endStatement(inner, cur.start);
        return { id, type: 'Group', range: { start, end: cur.start }, children };
      }
      st.endStatement(inner, cur.end);
      const range = { start, end: cur.end };
      cur.next();
      return { id, type: 'Group', range, children };
    }
    const a = node();
    if (!a) return undefined;
    if (!cur.at(T.Arrow)) {
      st.statement('node', a.range);
      return a;
    }
    cur.next();
    const b = node();
    if (!b) return undefined;
    const id = st.ids.edge(a.name, b.name);
    model.edges.push({ from: a.name, to: b.name, ast: id });
    const range = { start: a.range.start, end: b.range.end };
    st.statement('edge', range);
    const edge: TinyEdge = { id, type: 'Edge', range, children: [a, b] };
    return edge;
  }

  function body(out: AstNode[], closer: number): void {
    while (!cur.at(Kind.EOF) && !cur.at(closer)) {
      if (cur.eat(Kind.Newline) || cur.eat(T.Semi)) continue;
      const s = statement();
      if (s) out.push(s);
      if (!cur.at(Kind.EOF) && !cur.at(closer) && !cur.at(Kind.Newline) && !cur.at(T.Semi)) {
        fail(cur.range, [T.Arrow, T.Open, Kind.Newline, Kind.EOF]);
      }
    }
  }

  const children: AstNode[] = [];
  body(children, -1);
  const ast: AstNode<'Document'> = {
    id: 'doc',
    type: 'Document',
    range: { start: 0, end: src.length },
    children,
  };
  return st.result(model, ast, tokens, options);
}

// ---- helpers --------------------------------------------------------------------------

function idsByName(r: ParseResult<TinyModel>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const walk = (n: AstNode) => {
    const name = (n as TinyNode).name;
    if (n.type === 'Node' && name) (out[name] ??= []).push(n.id);
    if (n.type !== 'Node') (out[`<${n.type}>`] ??= []).push(n.id);
    n.children?.forEach(walk);
  };
  walk(r.ast);
  return out;
}

const text = (src: string, r: Range) => src.slice(r.start, r.end);

// ---- specs ----------------------------------------------------------------------------

describe('parser kit through a tiny grammar', () => {
  const SRC = [
    '%% demo',
    'A[Start] --> B',
    'B --> C[End]; A --> B',
    'style A fill:red',
    'group g1',
    '  C',
    'end',
  ].join('\n');

  it('returns model, AST, diagnostics, symbols and statements', () => {
    const r = parse(SRC);
    expect(r.diagnostics).toEqual([]);
    expect(r.model).toEqual({
      nodes: [
        { id: 'A', label: 'Start', ast: 'n:A' },
        { id: 'B', ast: 'n:B' },
        { id: 'C', label: 'End', ast: 'n:C' },
      ],
      edges: [
        { from: 'A', to: 'B', ast: 'e:A>B' },
        { from: 'B', to: 'C', ast: 'e:B>C' },
        { from: 'A', to: 'B', ast: 'e:A>B#2' },
      ],
    });
    expect(idsByName(r)).toEqual({
      '<Document>': ['doc'],
      '<Edge>': ['e:A>B', 'e:B>C', 'e:A>B#2'],
      A: ['n:A', 'n:A@2'],
      B: ['n:B', 'n:B@2', 'n:B@3'],
      C: ['n:C', 'n:C@2'],
      '<Style>': ['st:1'],
      '<Group>': ['s:g1'],
    });
    expect(JSON.parse(JSON.stringify(r.model))).toEqual(r.model); // plain data
  });

  it('records each id occurrence as a definition or a reference with its range', () => {
    const r = parse(SRC);
    expect(r.symbols.map((s) => [s.name, s.role, text(SRC, s.range)])).toEqual([
      ['A', 'def', 'A'],
      ['B', 'def', 'B'],
      ['B', 'ref', 'B'],
      ['C', 'def', 'C'],
      ['A', 'ref', 'A'],
      ['B', 'ref', 'B'],
      ['A', 'ref', 'A'],
      ['C', 'ref', 'C'],
    ]);
    expect(r.symbols.every((s) => s.kind === 'node')).toBe(true);
  });

  it('records statement spans, nested for folding', () => {
    const r = parse(SRC);
    expect(r.statements.map((s) => [s.kind, text(SRC, s.range)])).toEqual([
      ['edge', 'A[Start] --> B'],
      ['edge', 'B --> C[End]'],
      ['edge', 'A --> B'],
      ['style', 'style A fill:red'],
      ['group', 'group g1\n  C\nend'],
    ]);
    expect(r.statements[4]?.children?.map((s) => [s.kind, text(SRC, s.range)])).toEqual([
      ['node', 'C'],
    ]);
  });

  it('turns N independent errors into N diagnostics and keeps parsing', () => {
    const src = ['A --> ;', 'B', 'C D', '--> E', 'F --> G'].join('\n');
    const r = parse(src);
    expect(r.diagnostics.map((d) => [d.code, text(src, d.range), d.message])).toEqual([
      ['UNEXPECTED', ';', 'Expected a node id, got a line break or `;`.'],
      [
        'UNEXPECTED',
        'D',
        'Expected an arrow `-->`, a label `[…]`, a line break or `;` or the end of the text, got a node id.',
      ],
      ['UNEXPECTED', '-->', 'Expected a node id, got an arrow `-->`.'],
    ]);
    expect(r.diagnostics.every((d) => d.expected && d.expected.length <= 5)).toBe(true);
    expect(r.model.edges).toEqual([{ from: 'F', to: 'G', ast: 'e:F>G' }]);
  });

  it('points an unclosed construct back at its opener', () => {
    const src = 'A --> B[oops\nC';
    const r = parse(src);
    expect(r.diagnostics).toHaveLength(1);
    const d = r.diagnostics[0];
    expect(d?.code).toBe('UNCLOSED_LABEL');
    expect(d?.related?.map((x) => text(src, x.range))).toEqual(['[']);
    expect(new LineIndex(src).position(d?.range.start ?? -1)).toEqual({ line: 0, column: 12 });
    expect(r.model.nodes.map((n) => n.id)).toEqual(['A', 'C']);
  });

  it('keeps ranges in original offsets with CRLF line breaks', () => {
    const src = 'A --> B\r\nC --> D[x]\r\n';
    const r = parse(src);
    expect(r.diagnostics).toEqual([]);
    const d = r.symbols.find((s) => s.name === 'D');
    expect(d && new LineIndex(src).position(d.range.start)).toEqual({ line: 1, column: 6 });
  });

  it('returns the token stream only when keepTokens is set', () => {
    expect(parse(SRC).tokens).toBeUndefined();
    const r = parse(SRC, { keepTokens: true });
    expect(r.tokens?.kind[0]).toBe(Kind.Comment);
    expect(r.tokens?.kind[(r.tokens?.length ?? 0) - 1]).toBe(Kind.EOF);
  });

  describe('AST ids are stable under edits', () => {
    const base = ['A[one] --> B', 'style A fill:red', 'A --> B', 'group g', 'B --> C', 'end'].join(
      '\n'
    );
    const before = idsByName(parse(base));

    it.each([
      ['the element’s own label', base.replace('[one]', '[a much longer label]')],
      ['removing the label', base.replace('[one]', '')],
      ['a comment above', `%% hello\n${base}`],
      ['blank lines and spacing', base.replace(/\n/g, '\n\n   ').replace('-->', '   -->   ')],
      ['a statement about other nodes above', `X --> Y\nZ\n${base}`],
      ['a statement appended below', `${base}\nQ --> R`],
      ['CRLF line breaks', base.replace(/\n/g, '\r\n')],
    ])('%s', (_name, edited) => {
      const after = idsByName(parse(edited));
      for (const key of ['A', 'B', 'C', '<Edge>', '<Style>', '<Group>']) {
        expect(
          after[key]?.filter((id) => !/[XYZQR]/.test(id)),
          key
        ).toEqual(before[key]);
      }
    });
  });

  it('gives identical results for interleaved parses (no shared state)', () => {
    const a1 = parse(SRC);
    parse('P --> Q\nQ --> P');
    const a2 = parse(SRC);
    expect(a2).toEqual(a1);
  });
});
