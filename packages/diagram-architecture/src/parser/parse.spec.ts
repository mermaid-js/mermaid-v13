import { describe, expect, it } from 'vitest';
import { LineIndex } from '@mermaid-js/core/parser-kit';
import {
  ARCHITECTURE_GROUP_EDGE_UNGROUPED,
  ARCHITECTURE_UNKNOWN_PARENT,
  parseArchitecture,
} from '../index.ts';
import { T } from './tokens.ts';

const src = (...lines: string[]) => ['architecture-beta', ...lines].join('\n');

describe('parseArchitecture: model', () => {
  it('keeps each kind in source order, and v12 order across kinds', () => {
    const { model, diagnostics } = parseArchitecture(
      src(
        'service a(server)[A] in g',
        'junction j in g',
        'group g(cloud)[G]',
        'service 20 "text"',
        'service 10',
        'a:R <-[x]-> L:j',
        'align column a 20'
      )
    );
    expect(diagnostics).toEqual([]);
    expect(model.services.map((s) => s.id)).toEqual(['a', '20', '10']);
    // A service may name a group declared after it: v12 adds every group first.
    expect(model.services[0]).toEqual({
      id: 'a',
      icon: 'server',
      title: 'A',
      in: 'g',
      astId: 'service:a',
    });
    expect(model.services[1]).toEqual({ id: '20', iconText: 'text', astId: 'service:20' });
    expect(model.junctions).toEqual([{ id: 'j', in: 'g', astId: 'junction:j' }]);
    expect(model.groups).toEqual([{ id: 'g', icon: 'cloud', title: 'G', astId: 'group:g' }]);
    expect(model.edges).toEqual([
      {
        lhsId: 'a',
        lhsDir: 'R',
        lhsInto: true,
        lhsGroup: false,
        rhsId: 'j',
        rhsDir: 'L',
        rhsInto: true,
        rhsGroup: false,
        title: 'x',
        astId: 'edge:a->j',
      },
    ]);
    expect(model.alignments).toEqual([
      { direction: 'column', members: ['a', '20'], astId: 'align:1' },
    ]);
    expect(Object.isFrozen(model.services[0])).toBe(true);
  });

  it('converts labels, icons and text icons as v12 did', () => {
    const { model } = parseArchitecture(
      src(
        'service a(logos:aws)[  "The \\"Main\\" API"  ]',
        "service b 'it\\'s\\n'[ 'x' ]",
        'service c[Hello 世界, A/B: v6]',
        'service d[<b>x</b> &amp; y]'
      )
    );
    expect(model.services.map((s) => [s.icon, s.iconText, s.title])).toEqual([
      ['logos:aws', undefined, 'The "Main" API'],
      [undefined, "it's\n", 'x'],
      [undefined, undefined, 'Hello 世界, A/B: v6'],
      [undefined, undefined, '<b>x</b> &amp; y'],
    ]);
  });

  it('takes the last title, accTitle and accDescr, and the front-matter title only without one', () => {
    const own = parseArchitecture(
      src('title  One', 'title Two  words', 'accTitle: A', 'accDescr {\n  line 1\n  line 2\n}')
    ).model;
    expect([own.title, own.titleAstId, own.accTitle, own.accDescr]).toEqual([
      'Two words',
      'title@2',
      'A',
      'line 1\nline 2',
    ]);
    const front = parseArchitecture('---\ntitle: From front matter\n---\narchitecture-beta').model;
    expect([front.title, front.titleAstId]).toEqual(['From front matter', undefined]);
  });

  it('ignores `{group}` on ends in no group, with one warning listing every place (D504)', () => {
    const text = src(
      'group g',
      'service a in g',
      'service b',
      'a{group}:R -- L:b{group}',
      'b{group}:T -- B:a'
    );
    const { model, diagnostics } = parseArchitecture(text);
    expect(model.edges.map((e) => [e.lhsGroup, e.rhsGroup])).toEqual([
      [true, false],
      [false, false],
    ]);
    expect(diagnostics).toHaveLength(1);
    const [w] = diagnostics;
    expect(w?.severity).toBe('warning');
    expect(w?.code).toBe(ARCHITECTURE_GROUP_EDGE_UNGROUPED);
    expect(text.slice(w?.range.start, w?.range.end)).toBe('{group}');
    expect(w?.related?.map((r) => text.slice(r.range.start, r.range.end))).toEqual(['{group}']);
    expect(model.warnings).toEqual([w]);
  });

  it('keeps a declaration with a wrong parent, without the parent', () => {
    const { model, diagnostics } = parseArchitecture(
      src('service a in nope', 'service b', 'a:R -- L:b')
    );
    expect(diagnostics.map((d) => d.code)).toEqual([ARCHITECTURE_UNKNOWN_PARENT]);
    expect(model.services.map((s) => [s.id, s.in])).toEqual([
      ['a', undefined],
      ['b', undefined],
    ]);
    expect(model.edges).toHaveLength(1);
  });

  it('accepts `__proto__` as an id, and pollutes no prototype', () => {
    const { model, diagnostics } = parseArchitecture(
      src(
        'group __proto__',
        'service constructor in __proto__',
        'service toString',
        'constructor:R -- L:toString'
      )
    );
    expect(diagnostics).toEqual([]);
    expect(model.groups.map((g) => g.id)).toEqual(['__proto__']);
    expect(model.services.map((s) => s.in)).toEqual(['__proto__', undefined]);
    expect(Object.prototype).not.toHaveProperty('toString', 'service');
  });
});

describe('parseArchitecture: AST ids, symbols and statements (D508)', () => {
  const text = src(
    'group g(cloud)[G]',
    'service a in g',
    'service a',
    'junction j in g',
    'a:R -- L:j',
    'a:B -- T:j',
    'j:R -- L:a',
    'align row a j',
    'align column a j',
    'title t'
  );
  const result = parseArchitecture(text);

  it('gives every statement its id, repeats `@n`', () => {
    expect(result.ast.children.map((n) => n.id)).toEqual([
      'architecture',
      'group:g',
      'service:a',
      'service:a@2',
      'junction:j',
      'edge:a->j',
      'edge:a->j@2',
      'edge:j->a',
      'align:1',
      'align:2',
      'title',
    ]);
    // The model keeps the declaration that registered the id.
    expect(result.model.services.map((s) => s.astId)).toEqual(['service:a']);
  });

  it('ranges run from the first token to the last', () => {
    expect(result.ast.children.map((n) => text.slice(n.range.start, n.range.end))).toEqual([
      'architecture-beta',
      'group g(cloud)[G]',
      'service a in g',
      'service a',
      'junction j in g',
      'a:R -- L:j',
      'a:B -- T:j',
      'j:R -- L:a',
      'align row a j',
      'align column a j',
      'title t',
    ]);
  });

  it('defines each id at the declaration that registered it and refers to it elsewhere', () => {
    const lines = new LineIndex(text);
    const at = (o: number) => {
      const p = lines.position(o);
      return `${p.line + 1}:${p.column}`;
    };
    expect(result.symbols.map((s) => `${s.name} ${s.kind} ${s.role} ${at(s.range.start)}`)).toEqual(
      [
        'g group def 2:6',
        'a service def 3:8',
        'g group ref 3:13',
        'a service ref 4:8',
        'j junction def 5:9',
        'g group ref 5:14',
        'a service ref 6:0',
        'j junction ref 6:9',
        'a service ref 7:0',
        'j junction ref 7:9',
        'j junction ref 8:0',
        'a service ref 8:9',
        'a service ref 9:10',
        'j junction ref 9:12',
        'a service ref 10:13',
        'j junction ref 10:15',
      ]
    );
  });

  it('gives a name no declaration registered no symbol', () => {
    const { symbols } = parseArchitecture(
      src('service a', 'a:R -- L:ghost', 'service b in nowhere')
    );
    expect(symbols.map((s) => s.name)).toEqual(['a', 'a', 'b']);
  });

  it('records a statement span per statement', () => {
    expect(result.statements.map((s) => s.kind)).toEqual([
      'header',
      'group',
      'service',
      'service',
      'junction',
      'edge',
      'edge',
      'edge',
      'align',
      'align',
      'title',
    ]);
  });
});

describe('parseArchitecture: errors', () => {
  const errors = (text: string) =>
    parseArchitecture(text)
      .diagnostics.filter((d) => d.severity === 'error')
      .map((d) => d.message);

  it('explains ids v12 cannot read', () => {
    expect(errors(src('service Backend'))).toEqual([
      'Expected an id such as `db`, got `B`; an id cannot start with a capital `L`, `R`, `T` or `B`, which reads as a side: rename `Backend`, such as `backend`.',
    ]);
    expect(errors(src('service in'))).toEqual([
      'Expected an id such as `db`, got `in`; `in` is a keyword, and an id cannot be one: rename it, such as `in1`.',
    ]);
    expect(errors(src('service titlex'))).toEqual([
      'Expected an id such as `db`, got `title`; an id cannot start with `title`, which starts a title: rename `titlex`.',
    ]);
  });

  it('explains sides and arrows', () => {
    expect(errors(src('service a', 'service b', 'a:Right -- L:b'))).toEqual([
      'Expected an arrowhead, `<` or `>`, `--` or a label such as `-[label]-` or `-`, got `ight`; a side is one capital letter, `L`, `R`, `T` or `B`, followed by `:` and the id.',
    ]);
    expect(errors(src('service a', 'service b', 'a:R ==> L:b'))[0]).toMatch(
      /^Unexpected character `==`/
    );
  });

  it('reports an empty diagram text without a header', () => {
    expect(errors('')).toEqual([
      'Expected `architecture-beta`, got the end of the text; an architecture diagram starts with `architecture-beta`.',
    ]);
  });
});

describe('parseArchitecture: probe (R-LANG-7)', () => {
  it('offers sides after `:` and statements at a line start', () => {
    const text = src('service a', 'service b', 'a:');
    const after = parseArchitecture(text, { probe: text.length }).probe;
    expect(after?.expected).toContain(T.Direction);
    const line = parseArchitecture(text, { probe: text.indexOf('service b') }).probe;
    expect(line?.expected).toEqual(
      expect.arrayContaining([T.Service, T.Group, T.Junction, T.Align])
    );
  });
});
