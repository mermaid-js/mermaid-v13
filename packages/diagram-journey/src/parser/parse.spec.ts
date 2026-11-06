import { describe, expect, it } from 'vitest';
import { preprocess } from '@mermaid-js/core/preprocess';
import { parseJourney } from './parser.ts';
import type { JourneyTaskNode } from './ast.ts';

/** The model of an accepted source. */
function model(src: string) {
  const r = parseJourney(src);
  expect(r.diagnostics).toEqual([]);
  return r.model;
}

const tasks = (src: string) => model(src).tasks.map((t) => [t.name, t.score, t.people, t.section]);

describe('journey model: scores (v12 `Number()` of the first piece)', () => {
  it('reads 0, blanks, hex, units and other numbers as `Number()` does', () => {
    const m = model(
      'journey\nA: 0\nB:  \nC: 0x10\nD: 2rem\nE: -2\nF: 2.5\nG: 1e1\nH: 5 %% note\nI: 0b11'
    );
    expect(m.tasks.map((t) => t.score)).toEqual([0, 0, 16, NaN, -2, 2.5, 10, NaN, 3]);
  });

  it('raises no warning for a score out of range (the layout does, D226)', () => {
    expect(parseJourney('journey\nA: 7\nB: x').diagnostics).toEqual([]);
  });
});

describe('journey model: people and actors', () => {
  it('splits the second piece on `,`, trims, keeps `""` and drops later pieces', () => {
    expect(tasks('journey\nA: 5\nB: 5:\nC: 5:  b , a ,b\nD: 5: a: b: c\nE: 5: x,,y')).toEqual([
      ['A', 5, [], ''],
      ['B', 5, [''], ''],
      ['C', 5, ['b', 'a', 'b'], ''],
      ['D', 5, ['a'], ''],
      ['E', 5, ['x', '', 'y'], ''],
    ]);
  });

  it('lists every actor once, `""` included, sorted by code unit', () => {
    expect(model('journey\nA: 1: zed, Zed, Äb, 10, 9, _x\nB: 2:\nC: 3: zed').actors).toEqual([
      '',
      '10',
      '9',
      'Zed',
      '_x',
      'zed',
      'Äb',
    ]);
  });

  it('keeps entities as `&name;` in names and actors (cooked as v12 drew them)', () => {
    const m = model('journey\nMake #amp; go: 1: #lt;b#gt;\nsection #quot;S#quot;');
    expect(m.tasks[0]?.name).toBe('Make &amp; go');
    expect(m.actors).toEqual(['&lt;b&gt;']);
    expect(m.sections[0]?.name).toBe('&quot;S&quot;');
  });
});

describe('journey model: sections', () => {
  it('keeps every section line, empty and repeated ones, and tasks before the first', () => {
    const m = model(
      'journey\nT0: 1\nsection A\nsection A\nT1: 2\nsection B\nsection A\nT2: 3\nsection C'
    );
    expect(m.sections).toEqual([
      { ast: 's:A', name: 'A' },
      { ast: 's:A@2', name: 'A' },
      { ast: 's:B', name: 'B' },
      { ast: 's:A@3', name: 'A' },
      { ast: 's:C', name: 'C' },
    ]);
    expect(m.tasks.map((t) => [t.ast, t.section, t.sectionIndex])).toEqual([
      ['t:1', '', undefined],
      ['t:2', 'A', 1],
      ['t:3', 'A', 3],
    ]);
    expect('sectionIndex' in (m.tasks[0] ?? {})).toBe(false);
  });

  it('keeps names untrimmed (v12 `substr(8)`), a line break as the separator', () => {
    const m = model('journey\nsection  A \nT: 1\nsection\nB\nU: 2');
    expect(m.sections.map((s) => s.name)).toEqual([' A ', 'B']);
    expect(m.tasks.map((t) => t.section)).toEqual([' A ', 'B']);
  });

  it('percent-encodes `%`, `>`, `@` and `#` in ids', () => {
    const m = model('journey\nsection A@2\nsection A\nsection a%>b');
    expect(m.sections.map((s) => s.ast)).toEqual(['s:A%402', 's:A', 's:a%25%3Eb']);
  });
});

describe('journey model: title and accessibility', () => {
  it('keeps the last title untrimmed, a `:` included', () => {
    expect(model('journey\ntitle  a  \ntitle b: c').title).toBe('b: c');
    expect(model('journey\ntitle  a  ').title).toBe(' a  ');
  });

  it('trims accessibility values; a description loses the indent after each line break', () => {
    const m = model(
      'journey\naccTitle:  x  \naccTitle: y\naccDescr {\n   one\n     two\n\n  three  }'
    );
    expect(m.accTitle).toBe('y');
    expect(m.accDescr).toBe('one\ntwo\nthree');
    expect(model('journey\naccDescr: p\naccDescr:\n  q  ').accDescr).toBe('q');
  });

  it('takes the front-matter title when the text has none (D218)', () => {
    expect(model('---\ntitle: Front\n---\njourney\nT: 1').title).toBe('Front');
    expect(model('---\ntitle: Front\n---\njourney\ntitle In text').title).toBe('In text');
    expect('title' in model('journey\nT: 1')).toBe(false);
  });

  it('defaults to empty accessibility values and no warnings', () => {
    const m = model('journey');
    expect(m).toEqual({
      sections: [],
      tasks: [],
      actors: [],
      accTitle: '',
      accDescr: '',
      warnings: [],
    });
  });
});

describe('journey statements without separators', () => {
  it('reads statements that follow each other on one line', () => {
    const m = model(
      'journey title t\naccDescr { d }title u\naccDescr {x}section S\naccDescr {y}T: 1: A'
    );
    expect([m.title, m.accDescr, m.sections.map((s) => s.name), tasks('journey\nT: 1: A')]).toEqual(
      ['u', 'y', ['S'], [['T', 1, ['A'], '']]]
    );
  });
});

describe('journey AST', () => {
  const src =
    'journey\n  title Day\nsection Work\n  Make tea: 5: Me, Cat\n  Go: 3: Me,\naccDescr {\n x\n}';

  it('has a node per statement with semantic ids and trimmed ranges', () => {
    const { ast } = parseJourney(src);
    const shape = ast.children.map((n) => [n.id, n.type, src.slice(n.range.start, n.range.end)]);
    expect(shape).toEqual([
      ['st:1', 'Header', 'journey'],
      ['st:2', 'Title', 'title Day'],
      ['s:Work', 'Section', 'section Work'],
      ['t:1', 'Task', 'Make tea: 5: Me, Cat'],
      ['t:2', 'Task', 'Go: 3: Me,'],
      ['st:3', 'AccDescr', 'accDescr {\n x\n}'],
    ]);
  });

  it('gives actor mentions `a:<name>` ids and ranges inside their task, none for `""`', () => {
    const { ast, symbols } = parseJourney(src);
    const mentions = ast.children
      .filter((n): n is JourneyTaskNode => n.type === 'Task')
      .map((t) => t.children.map((a) => [a.id, a.name, src.slice(a.range.start, a.range.end)]));
    expect(mentions).toEqual([
      [
        ['a:Me', 'Me', 'Me'],
        ['a:Cat', 'Cat', 'Cat'],
      ],
      [['a:Me@2', 'Me', 'Me']],
    ]);
    expect(symbols.map((s) => [s.name, s.kind, s.role])).toEqual([
      ['Me', 'actor', 'def'],
      ['Cat', 'actor', 'def'],
      ['Me', 'actor', 'ref'],
    ]);
  });

  it('keeps the task score, data and people on the node', () => {
    const task = parseJourney('journey\nT: 2rem: a, : b').ast.children[1] as JourneyTaskNode;
    expect([task.name, task.score, task.data, task.people]).toEqual([
      'T',
      NaN,
      ': 2rem: a, : b',
      ['a', ''],
    ]);
  });

  it('maps ranges across comment lines and entities to the source', () => {
    const s = 'journey\n%% c\nMake #amp; tea: 5: #lt;b#gt;, x';
    const task = parseJourney(s).ast.children[1] as JourneyTaskNode;
    expect(s.slice(task.range.start, task.range.end)).toBe('Make #amp; tea: 5: #lt;b#gt;, x');
    expect(task.children.map((a) => s.slice(a.range.start, a.range.end))).toEqual([
      '#lt;b#gt;',
      'x',
    ]);
  });

  it('records a statement span per statement', () => {
    expect(parseJourney(src).statements.map((s) => s.kind)).toEqual([
      'header',
      'title',
      'section',
      'task',
      'task',
      'accDescr',
    ]);
  });

  it('keeps the token stream only on request', () => {
    expect(parseJourney(src).tokens).toBeUndefined();
    expect(parseJourney(src, { keepTokens: true }).tokens?.length).toBeGreaterThan(10);
  });

  it('starts the document after the front matter and is plain data', () => {
    const s = '---\ntitle: x\n---\njourney\nT: 1';
    const r = parseJourney(s, { preprocessed: preprocess(s) });
    expect(r.ast.range.start).toBe(s.indexOf('journey'));
    expect(JSON.parse(JSON.stringify(r.model))).toEqual(r.model);
  });
});

/**
 * v12's `journeyDb.spec.js`, at parse level: it called the DB directly; here the same calls are
 * written as source. `Child#1` cannot be written in a source (`#` starts a comment), so the
 * children are `Child1` and `Child2`.
 */
describe('v12 journeyDb.spec.js cases, as sources', () => {
  it('starts every parse empty (v12 `clear`)', () => {
    parseJourney('journey\nsection weekends skip test\ntest1: 4: id1, id3\ntest2: 2: id2');
    expect(model('journey')).toMatchObject({
      tasks: [],
      sections: [],
      actors: [],
      accTitle: '',
      accDescr: '',
    });
  });

  it('adds tasks and actors', () => {
    const m = model(
      [
        'journey',
        'accTitle: Shopping',
        'accDescr: A user journey for family shopping',
        'section Journey to the shops',
        'Get car keys:5:Dad',
        'Go to car:3:Dad, Mum, Child1, Child2',
        'Drive to supermarket:4:Dad',
        'section Do shopping',
        'Go shopping:5:Mum',
      ].join('\n')
    );
    expect([m.accTitle, m.accDescr]).toEqual(['Shopping', 'A user journey for family shopping']);
    expect(m.tasks.map((t) => [t.score, t.people, t.section, t.name])).toEqual([
      [5, ['Dad'], 'Journey to the shops', 'Get car keys'],
      [3, ['Dad', 'Mum', 'Child1', 'Child2'], 'Journey to the shops', 'Go to car'],
      [4, ['Dad'], 'Journey to the shops', 'Drive to supermarket'],
      [5, ['Mum'], 'Do shopping', 'Go shopping'],
    ]);
    expect(m.actors).toEqual(['Child1', 'Child2', 'Dad', 'Mum']);
    expect(m.sections.map((s) => s.name)).toEqual(['Journey to the shops', 'Do shopping']);
  });
});

describe('journey AST ids are unique (R-PARSE-8)', () => {
  it('over repeated sections, names and actors', () => {
    const src =
      'journey\ntitle a\ntitle b\nsection A\nsection A\nT: 1: x, x\nT: 2: x\naccTitle: t\naccDescr: d';
    const ids: string[] = [];
    const walk = (n: { id: string; children?: unknown[] }) => {
      ids.push(n.id);
      for (const c of (n.children ?? []) as { id: string }[]) walk(c);
    };
    walk(parseJourney(src).ast);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      'doc',
      'st:1',
      'st:2',
      'st:3',
      's:A',
      's:A@2',
      't:1',
      'a:x',
      'a:x@2',
      't:2',
      'a:x@3',
      'st:4',
      'st:5',
    ]);
  });
});
