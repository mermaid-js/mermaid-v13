import { describe, expect, it } from 'vitest';
import { parseKanban } from '../index.ts';
import type { KanbanModel } from '../index.ts';

/**
 * The kanban parser through `parseKanban` (spec #424 T2). Expected values are mermaid\@12's, from
 * the oracle (`getSections()` and `getData()`), unless a test says otherwise.
 */
const model = (src: string): KanbanModel => {
  const r = parseKanban(src);
  expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return r.model;
};

const errors = (src: string) =>
  parseKanban(src)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => d.code);

describe('kanban parser: columns and cards', () => {
  it('makes items at the first indent columns, and deeper items cards of the last one', () => {
    const m = model('kanban\n  a\n    b\n      c\n  d\n    e\n');
    expect(m.items.map((i) => [i.id, i.isColumn, i.column, i.parentId, i.level])).toEqual([
      ['a', true, 0, undefined, 2],
      ['b', false, 0, 'a', 4],
      ['c', false, 0, 'a', 6],
      ['d', true, 1, undefined, 2],
      ['e', false, 1, 'd', 4],
    ]);
    expect(m.columns).toEqual([
      { item: 0, cards: [1, 2] },
      { item: 3, cards: [4] },
    ]);
  });

  it('gives cards to the column they follow when columns share an id (D373)', () => {
    // v12 listed `c` under both `a` columns; v13 keeps v12's parentId and groups by position.
    const m = model('kanban\n  a\n  a\n    c');
    expect(m.columns).toEqual([
      { item: 0, cards: [] },
      { item: 1, cards: [2] },
    ]);
    expect(m.items[2]?.parentId).toBe('a');
  });

  it('takes a column on the header line, counts a tab as one, and reads blank lines', () => {
    expect(model('kanban a\n    b').items.map((i) => [i.id, i.level, i.isColumn])).toEqual([
      ['a', 1, true],
      ['b', 4, false],
    ]);
    expect(model('kanban\n\ta\n\t\tb').items.map((i) => [i.id, i.level])).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
    expect(model('\n \nkanban\nroot\n A\n \n\n B').items.map((i) => i.id)).toEqual([
      'root',
      'A',
      'B',
    ]);
    expect(model('kanban\n').items).toEqual([]);
  });

  it('reads ids, shapes, strings and id-less items as v12', () => {
    const m = model(
      'kanban\n  b \n    c: d; e\n    theId(child1)\n    [Todo]\n    (-cl-)\n    x["String containing []"]\n    y["`md **z**`"]'
    );
    expect(m.items.map((i) => [i.id, i.label])).toEqual([
      ['b ', 'b '],
      ['c: d; e', 'c: d; e'],
      ['theId', 'child1'],
      ['Todo', 'Todo'],
      ['cl-', 'cl-'],
      ['x', 'String containing []'],
      ['y', 'md **z**'],
    ]);
  });

  it('marks a label written as a markdown string, which it holds without its wrapper (D712)', () => {
    const m = model(
      'kanban\n  a["`**md**`"]\n    b["**plain**"]\n    c[`ticks`]\n    d@{ label: "`**data**`" }\n    e["`x`"]@{ label: y }'
    );
    expect(m.items.map((i) => [i.label, i.markdown])).toEqual([
      ['**md**', true],
      ['**plain**', undefined],
      ['`ticks`', undefined],
      ['`**data**`', undefined],
      ['y', undefined],
    ]);
  });

  it('decodes entities to their `&…;` form and keeps raw line breaks in labels', () => {
    const m = model('kanban\n  a[#59; #quot;x#quot;]\n    #amp; b\n    c["d\n e"]');
    expect(m.items.map((i) => [i.id, i.label])).toEqual([
      ['a', '&#59; &quot;x&quot;'],
      ['&amp; b', '&amp; b'],
      ['c', 'd\n e'],
    ]);
  });

  it('reads a double-quoted attribute in a tag of a quoted label as v12 (#837, D114)', () => {
    const label = '<span style="color:red">red</span> text';
    const lexed = "<span style='color:red'>red</span> text";
    const r = parseKanban(`kanban\n  a["${label}"]\n    b("${label}")\n    c["\`${label}\`"]`);
    expect(r.diagnostics).toEqual([]);
    expect(r.model.items.map((i) => [i.id, i.label])).toEqual([
      ['a', lexed],
      ['b', lexed],
      ['c', lexed],
    ]);
  });

  it('puts classes and icons on the last item; a later one replaces them', () => {
    const m = model(
      'kanban\n  a[The root]\n  :::m-4 p-8\n  ::icon(bomb)\n    b\n    :::x\n    :::y z'
    );
    expect(m.items.map((i) => [i.id, i.classes, i.icon])).toEqual([
      ['a', ['m-4', 'p-8'], 'bomb'],
      ['b', ['y', 'z'], undefined],
    ]);
  });
});

describe('kanban parser: shape data', () => {
  it('reads ticket, assigned, priority, icon and label as v12 did', () => {
    const m = model(
      "kanban\n  a\n    b@{ ticket: MC-1, assigned: knsv, priority: 'High', icon: star, label: 'fix things' }"
    );
    const b = m.items[1];
    expect([b?.label, b?.ticket, b?.assigned, b?.priority, b?.priorityKind, b?.icon]).toEqual([
      'fix things',
      'MC-1',
      'knsv',
      'High',
      'text',
      'star',
    ]);
  });

  it('turns values into JavaScript strings, keeps other priorities as JSON, drops falsy ones', () => {
    const m = model(
      'kanban\n  a\n    b@{ priority: [1,2], ticket: 12, assigned: [x, y] }\n    c@{ label: 5, icon: 3, priority: "" }\n    d@{ shape: 0, label: [x, y], priority: 0 }'
    );
    expect(
      m.items
        .slice(1)
        .map((i) => [i.label, i.ticket, i.assigned, i.priority, i.priorityKind, i.icon])
    ).toEqual([
      ['b', '12', 'x,y', '[1,2]', 'other', undefined],
      ['5', undefined, undefined, undefined, undefined, '3'],
      ['x,y', undefined, undefined, undefined, undefined, undefined],
    ]);
  });

  it('keeps a priority that is not a string as the author wrote it', () => {
    const m = model(
      'kanban\n  a\n    b@{ priority: [1,  2] }\n    c@{\n      priority:\n        - 1\n        - x\n    }\n    d@{ priority: true, ticket: #35; }'
    );
    expect(m.items.slice(1).map((i) => [i.priority, i.priorityKind])).toEqual([
      ['[1,  2]', 'other'],
      ['- 1\n- x', 'other'],
      ['true', 'other'],
    ]);
  });

  it('reads multi-line data and quoted line breaks', () => {
    const m = model(
      'kanban\n  a\n    b@{\n      icon: star\n      assigned: knsv\n    }\n    c@{ label: "x\n   y" }'
    );
    expect(m.items.slice(1).map((i) => [i.icon, i.assigned, i.label])).toEqual([
      ['star', 'knsv', 'b'],
      [undefined, undefined, 'x<br/>y'],
    ]);
  });

  it('reads a double-quoted attribute in a tag of the data as v12 (#837, D114)', () => {
    // v12 turned the attribute's quotes into `'` before lexing, so they open no quoted run.
    const m = model(
      'kanban\n  a\n    b@{ ticket: "<span class="k">T-1</span>", label: <b id="x">y</b> }'
    );
    expect([m.items[1]?.ticket, m.items[1]?.label]).toEqual([
      "<span class='k'>T-1</span>",
      "<b id='x'>y</b>",
    ]);
  });

  it('keeps entities in data as text', () => {
    const m = model('kanban\n  a\n    b@{ label: "#quot;x#quot; #59;", ticket: #35; }');
    expect([m.items[1]?.label, m.items[1]?.ticket]).toEqual(['&quot;x&quot; &#59;', '&#35;']);
  });

  it('ignores data that is a scalar or a list, and unknown keys and lower-case shapes', () => {
    const m = model(
      'kanban\n  a\n    b@{\n  hello\n}\n    c@{\n - x\n}\n    d@{ foo: bar, shape: circle }'
    );
    expect(m.items.map((i) => i.label)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('reports bad YAML, empty data and a bad shape, and keeps the item without data', () => {
    expect(errors('kanban\n  a\n    b@{ x: [ }')).toEqual(['SHAPE_DATA']);
    expect(errors('kanban\n  a\n    b@{ a: 1, a: 2 }')).toEqual(['SHAPE_DATA']);
    expect(errors('kanban\n  a\n    b@{x: 1}@{y: 2}')).toEqual(['SHAPE_DATA']);
    expect(errors('kanban\n  a\n    b@{\n}')).toEqual(['KANBAN_DATA_EMPTY']);
    const [empty] = parseKanban('kanban\n  a\n    b@{\n      ~\n    }').diagnostics;
    expect(empty?.message).toMatch(/^The `@\{ … \}` data is empty or `null`\./);
    for (const shape of ['Rect', 'my_shape', '5', 'true'])
      expect(errors(`kanban\n  a\n    b@{ shape: ${shape} }`), shape).toEqual(['KANBAN_SHAPE']);
    const r = parseKanban('kanban\n  a\n    b@{ shape: Rect, ticket: X }\n    c');
    expect(r.model.items.map((i) => [i.id, i.ticket])).toEqual([
      ['a', undefined],
      ['b', undefined],
      ['c', undefined],
    ]);
  });

  it('gives YAML errors the exact range when the data is read in place', () => {
    const src = 'kanban\n  a\n    b@{ a: 1, a: 2 }';
    const [d] = parseKanban(src).diagnostics;
    expect(src.slice(d?.range.start, d?.range.end)).toBe('a');
  });
});

describe('kanban parser: v12 DB errors', () => {
  it('accepts an item shallower than the first as a card, until another item follows', () => {
    const ok = model('kanban\n    a\n  b');
    expect(ok.items.map((i) => [i.id, i.isColumn, i.parentId])).toEqual([
      ['a', true, undefined],
      ['b', false, 'a'],
    ]);
    const r = parseKanban('kanban\n    a\n  b\n  c');
    expect(r.diagnostics.map((d) => [d.code, d.message])).toEqual([
      [
        'KANBAN_ITEM_WITHOUT_COLUMN',
        'Items without section detected, found section ("b"): it is indented less than the first column. Indent it as deep as the columns, or deeper for a card.',
      ],
    ]);
    const [d] = r.diagnostics;
    const src = 'kanban\n    a\n  b\n  c';
    expect(src.slice(d?.range.start, d?.range.end)).toBe('b');
    expect(d?.related?.map((x) => src.slice(x.range.start, x.range.end))).toEqual(['c']);
  });

  it('reports a decoration before any item', () => {
    expect(errors('kanban\n  ::icon(x)\n  a')).toEqual(['KANBAN_DECORATION_BEFORE_ITEM']);
    expect(errors('kanban\n  :::c\n  a')).toEqual(['KANBAN_DECORATION_BEFORE_ITEM']);
  });
});

describe('kanban parser: syntax v12 rejects', () => {
  it.each([
    ['the header alone', 'kanban'],
    ['an item starting with the word kanban', 'kanban\n  Kanban board'],
    ['a word after the header', 'kanbanx\n  a'],
    ['data with no id', 'kanban\n  a\n    @{ ticket: x }'],
    ['text after data', 'kanban\n  a\n    b@{ x: 1 } extra'],
    ['text after a closer', 'kanban\n  a(x)y'],
    ['a caret in data', 'kanban\n  a\n    b@{ label: x^y }'],
    ['unclosed data', 'kanban\n  a\n    b@{ x: 1'],
    ['a brace outside a shape', 'kanban\n  a{b}'],
    ['a lone at', 'kanban\n  a@b'],
  ])('%s', (_name, src) => {
    expect(errors(src)).toHaveLength(1);
  });

  it('says a `}` took the rest of the board into a label, over what it took', () => {
    const src = 'kanban\n  a\n  d[x}y]\n  e[p}q]\n  f';
    const r = parseKanban(src);
    expect(r.diagnostics).toHaveLength(1);
    const [d] = r.diagnostics;
    expect(src.slice(d?.range.start, d?.range.end)).toBe('}y]\n  e[p}q]\n  f');
    expect(d?.message).toMatch(/runs on to the end of the board, taking in every item after it/);
    // v12's tokens are kept: the items it swallowed are not in the model.
    expect(r.model.items.map((i) => i.id)).toEqual(['a', 'd']);
    const [line] = parseKanban('kanban\n  a[x}y]').diagnostics;
    expect(line?.message).toMatch(/runs on to the end of its line\./);
    const closed = parseKanban('kanban\n  a(b}c\n  e)\n  f');
    expect(closed.diagnostics[0]?.message).toMatch(/the closer on line 3, taking in the items/);
    expect(closed.model.items.map((i) => i.id)).toEqual(['a', 'f']);
  });

  it('names no token in messages', () => {
    const [d] = parseKanban('kanban\n  a\n    @{ ticket: x }').diagnostics;
    expect(d?.message).toBe(
      'Expected an item such as `todo` or `id[text]` or a `::icon(…)` or `:::class` line, got `@{ ticket: x }`; shape data goes right after an item, as in `id@{ ticket: T-1 }`.'
    );
  });
});

describe('kanban parser: AST', () => {
  it('gives columns and cards `n:<id>`, repeats `@k`, id-less items their trimmed text', () => {
    const r = parseKanban('kanban\n  docs\n    a\n  docs\n    [ Todo ]\n    a@{ ticket: X }');
    expect(r.ast.children.map((c) => c.id)).toEqual([
      'n:docs',
      'n:a',
      'n:docs@2',
      'n:Todo',
      'n:a@2',
    ]);
    expect(r.model.items.map((i) => i.ast)).toEqual(r.ast.children.map((c) => c.id));
    const src = 'kanban\n  docs\n    a\n  docs\n    [ Todo ]\n    a@{ ticket: X }';
    const last = r.ast.children[4];
    expect(src.slice(last?.range.start, last?.range.end)).toBe('a@{ ticket: X }');
    expect(last?.type === 'Item' && last.data?.text).toBe(' ticket: X ');
  });

  it('spans each column over its cards and decorations, to the line before the next column', () => {
    const src = 'kanban\n  a\n  :::x\n    b\n\n  %% c\n  c\n    d';
    const r = parseKanban(src);
    const show = (s: {
      kind: string;
      range: { start: number; end: number };
      children?: unknown[];
    }) => [s.kind, src.slice(s.range.start, s.range.end)];
    expect(r.statements.map(show)).toEqual([
      ['header', 'kanban'],
      ['column', 'a\n  :::x\n    b\n\n  %% c\n'],
      ['column', 'c\n    d'],
    ]);
    expect(r.statements[1]?.children?.map(show)).toEqual([
      ['class', ':::x'],
      ['card', 'b'],
    ]);
  });
});

describe('kanban parser: the node limit (R-SEC-5, #459)', () => {
  const limitErrors = (src: string, maxNodes?: number) =>
    parseKanban(src, { maxNodes }).diagnostics.map((d) => `${d.code} ${d.range.start}`);
  const board = 'kanban\n  c1\n    card1\n    card2\n  c2\n    card3\n    card4\n';

  it('counts columns and cards, and reports the cap once, at the first item over it', () => {
    expect(limitErrors(board, 3)).toEqual([`NODE_LIMIT ${board.indexOf('c2')}`]);
    expect(limitErrors(board, 2.5)).toEqual([`NODE_LIMIT ${board.indexOf('card2')}`]);
    expect(limitErrors(board, 6)).toEqual([]);
    expect(parseKanban(board, { maxNodes: 3 }).diagnostics[0]?.message).toMatch(
      /more than 3 items \(columns and cards\), the limit\. The limit is set by the page or app/
    );
  });

  it("keeps its own subject in core's message (#721)", () => {
    expect(parseKanban(board, { maxNodes: 3 }).diagnostics[0]?.message).toBe(
      'The board has more than 3 items (columns and cards), the limit. The limit is set by the page or app that renders the diagram.'
    );
  });

  it("defaults to core's maxNodes", () => {
    const many = 'kanban\n' + Array.from({ length: 10_001 }, (_, i) => `  c${i}`).join('\n');
    expect(limitErrors(many)).toEqual([`NODE_LIMIT ${many.indexOf('c10000')}`]);
  });
});

describe('kanban parser: accTitle and accDescr (D742)', () => {
  it('sets the title and description and makes no item of them', () => {
    const r = parseKanban(
      'kanban\n  accTitle: My  board\n  accDescr: Board description\n  a[Col]\n    b[Card]'
    );
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(r.model.accTitle).toBe('My board');
    expect(r.model.accDescr).toBe('Board description');
    expect(r.model.items.map((i) => [i.id, i.isColumn])).toEqual([
      ['a', true],
      ['b', false],
    ]);
    expect(r.ast.children.map((n) => [n.type, n.id])).toEqual([
      ['AccTitle', 'accTitle:1'],
      ['AccDescr', 'accDescr:1'],
      ['Item', 'n:a'],
      ['Item', 'n:b'],
    ]);
  });

  it('reads the block form over lines, and acc text holding shape and data characters', () => {
    const m = model(
      'kanban\naccTitle: a [b] (c) @{ d } }e{\n  a\n    accDescr {\n      One [x]\n      (two) @{ y\n    }\n    b'
    );
    expect(m.accTitle).toBe('a [b] (c) @{ d } }e{');
    // As in the other types, the first `}` ends the block.
    expect(m.accDescr).toBe('One [x]\n(two) @{ y');
    expect(m.items.map((i) => [i.id, i.isColumn])).toEqual([
      ['a', true],
      ['b', false],
    ]);
  });

  it('takes them between columns and at any indent, without changing the column level', () => {
    const m = model('kanban\n  a\n    b\naccTitle: t\n      accDescr: d\n  c\n    e');
    expect(m.columns.map((c) => m.items[c.item]?.id)).toEqual(['a', 'c']);
    expect(m.items.map((i) => i.level)).toEqual([2, 4, 2, 4]);
    expect([m.accTitle, m.accDescr]).toEqual(['t', 'd']);
    // Before any item, an acc line sets no column level either.
    expect(model('kanban\naccTitle: t\n  a\n    b').items.map((i) => i.isColumn)).toEqual([
      true,
      false,
    ]);
  });

  it('records them as top-level statements, not inside the column they follow', () => {
    const src = 'kanban\n  accDescr: d\n  a\n    b\n  accTitle: t\n    c\n  e';
    const r = parseKanban(src);
    const show = (s: { kind: string; range: { start: number; end: number } }) => [
      s.kind,
      src.slice(s.range.start, s.range.end),
    ];
    expect(r.statements.map(show)).toEqual([
      ['header', 'kanban'],
      ['accDescr', 'accDescr: d'],
      ['column', 'a\n    b\n  accTitle: t\n    c\n'],
      ['accTitle', 'accTitle: t'],
      ['column', 'e'],
    ]);
    expect(r.statements[2]?.children?.map(show)).toEqual([
      ['card', 'b'],
      ['card', 'c'],
    ]);
  });

  it('keeps the last of repeated statements, as other types do; empty values set empty', () => {
    const m = model('kanban\n  accTitle: one\n  accTitle: two\n  accDescr: x\n  accDescr:\n  a');
    expect([m.accTitle, m.accDescr]).toEqual(['two', '']);
    expect(model('kanban\n  a').accTitle).toBe('');
  });

  it('keeps `accTitle[x]` and a bare `accDescr` items, as v12', () => {
    const m = model('kanban\n  accTitle[x]\n    accDescr');
    expect(m.items.map((i) => [i.id, i.label, i.isColumn])).toEqual([
      ['accTitle', 'x', true],
      ['accDescr', 'accDescr', false],
    ]);
    expect(m.accTitle).toBe('');
  });

  it('reads the keywords without regard to case, as the lexer reads `kanban`', () => {
    const m = model('kanban\n  ACCTITLE: t\n  AccDescr {\n    d\n  }\n  a');
    expect([m.accTitle, m.accDescr, m.items.length]).toEqual(['t', 'd', 1]);
  });

  it('reports an `accDescr {` with no `}`', () => {
    expect(errors('kanban\n  a\n  accDescr {\n  b')).toEqual(['UNCLOSED_DESCRIPTION']);
  });

  it('reports text after a block description on its line', () => {
    expect(errors('kanban\n  accDescr { x } b\n  a')).toEqual(['UNEXPECTED']);
  });
});
