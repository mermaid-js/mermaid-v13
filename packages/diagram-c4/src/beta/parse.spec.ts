import { describe, expect, it } from 'vitest';
import { parseC4Beta } from './parser.ts';

const parse = (body: string, header = 'c4-beta context') => parseC4Beta(`${header}\n${body}`);
const errors = (body: string, header?: string) =>
  parse(body, header).diagnostics.filter((d) => d.severity === 'error');

describe('c4-beta model', () => {
  it('reads elements, nesting, relations and statements', () => {
    const { model, ast } = parseC4Beta(
      [
        'c4-beta container',
        'title Payments %% not part of it',
        'accTitle: Payments view',
        'accDescr {',
        '  Two systems',
        '  that talk',
        '}',
        'direction LR',
        'legend off',
        'person p "Payer" "Pays bills." :::external',
        'softwareSystem s "Shop" {',
        '  container api "API" "Serves." "Kotlin" :::team :::async',
        '}',
        'p --> api : "Buys \\"stuff\\"" "HTTPS" :::sync',
        'style team shape:cylinder, fill:#1f2937',
      ].join('\n')
    );
    expect(model).toMatchObject({
      kind: 'container',
      direction: 'LR',
      legend: false,
      title: 'Payments',
      accTitle: 'Payments view',
      accDescr: 'Two systems\nthat talk',
      warnings: [],
    });
    expect(model.elements.map((e) => [e.id, e.kind, e.parent, e.boundary])).toEqual([
      ['p', 'person', undefined, false],
      ['s', 'softwareSystem', undefined, true],
      ['api', 'container', 's', false],
    ]);
    expect(model.elements[0]).toMatchObject({
      name: 'Payer',
      description: 'Pays bills.',
      tags: ['external'],
    });
    expect(model.elements[2]).toMatchObject({ technology: 'Kotlin', tags: ['team', 'async'] });
    expect(model.relations).toEqual([
      {
        from: 'p',
        to: 'api',
        start: 'none',
        end: 'arrow',
        description: 'Buys "stuff"',
        technology: 'HTTPS',
        tags: ['sync'],
        ast: 'rel:p->api',
      },
    ]);
    expect(model.styles).toEqual([
      {
        target: 'team',
        entries: [
          { key: 'shape', value: 'cylinder' },
          { key: 'fill', value: '#1f2937' },
        ],
        ast: 'style:1',
      },
    ]);
    expect(ast.children.map((n) => n.id)).toEqual([
      'header',
      'title',
      'accTitle',
      'accDescr',
      'direction',
      'legend',
      'element:p',
      'element:s',
      'rel:p->api',
      'style:1',
    ]);
  });

  it('defaults the kind to context, the direction to TB and the legend to off', () => {
    const { model } = parseC4Beta('c4-beta\n');
    expect(model).toMatchObject({ kind: 'context', direction: 'TB', legend: false, elements: [] });
  });

  it('stores `<--` as the relation from its source, and `<-->` with two heads', () => {
    const { model } = parse(
      'person a "A"\nperson b "B"\nperson c "C"\na <-- c : "Is called by"\nb <--> a'
    );
    expect(model.relations.map((r) => [r.from, r.to, r.start, r.end])).toEqual([
      ['c', 'a', 'none', 'arrow'],
      ['b', 'a', 'arrow', 'arrow'],
    ]);
  });

  it('stores `---` as a relation with no head, split from the ids round it', () => {
    const { model } = parse(
      'person a-b "A"\nperson c "C"\nperson d "D"\na-b---c : "Linked"\nc --- d\nd---a-b'
    );
    expect(model.relations.map((r) => [r.from, r.to, r.start, r.end])).toEqual([
      ['a-b', 'c', 'none', 'none'],
      ['c', 'd', 'none', 'none'],
      ['d', 'a-b', 'none', 'none'],
    ]);
    expect(model.relations[0]?.description).toBe('Linked');
  });

  it('does not read `----` or `--->` as an undirected arrow', () => {
    for (const arrow of ['----', '--->'])
      expect(errors(`person a "A"\nperson b "B"\na ${arrow} b`).length, arrow).toBeGreaterThan(0);
  });

  it('numbers the repeats of an id and of a relation', () => {
    const { ast } = parse('person a "A"\nperson b "B"\na --> b\na --> b\nperson a "again"');
    expect(ast.children.map((n) => n.id).slice(1)).toEqual([
      'element:a',
      'element:b',
      'rel:a->b',
      'rel:a->b@2',
      'element:a@2',
    ]);
  });

  it('resolves relation ends after the whole text', () => {
    expect(errors('a --> b\nperson a "A"\nperson b "B"')).toEqual([]);
  });

  it('keeps a step in a dynamic diagram and drops it, with a warning, elsewhere', () => {
    const body = 'person a "A"\nperson b "B"\n2: a --> b';
    expect(parse(body, 'c4-beta dynamic').model.relations[0]?.step).toBe(2);
    const { model, diagnostics } = parse(body);
    expect(model.relations[0]?.step).toBeUndefined();
    expect(diagnostics.map((d) => d.code)).toEqual(['C4BETA_STEP_IGNORED']);
  });

  it('reads a digit as an id after an arrow and a step at the start of a line', () => {
    const { model } = parse(
      'container 3 "Three"\nperson a "A"\n  4: a --> 3\na --> 3 : "x"',
      'c4-beta dynamic'
    );
    expect(model.relations.map((r) => r.step)).toEqual([4, undefined]);
  });

  it('names every place of a dropped field in one warning', () => {
    const { diagnostics } = parse(
      'person p "P" "d" "tech"\nsoftwareSystem s "S" "d" "tech"\ncontainer c "C" "" "JS" instances "3"'
    );
    expect(diagnostics.map((d) => d.code)).toEqual([
      'C4BETA_TECHNOLOGY_DROPPED',
      'C4BETA_INSTANCES_DROPPED',
    ]);
    expect(diagnostics[0]?.message).toMatch(/`p` at line 2, `s` at line 3/);
  });

  it('keeps instances on a deployment node, and makes it a boundary', () => {
    const { model } = parse(
      'deploymentNode n "Node" "" "Linux" instances "2..4"',
      'c4-beta deployment'
    );
    expect(model.elements[0]).toMatchObject({
      instances: '2..4',
      technology: 'Linux',
      boundary: true,
    });
  });

  it('lets any word but the six be an id', () => {
    const { model, diagnostics } = parse(
      'softwareSystem softwareSystem "System"\nperson on "On"\ncontainer 3ds "3-D"\nperson c4-beta "H"\nperson legend-svc "L"\nperson container --> softwareSystem'
        .split('\n')
        .slice(0, 5)
        .join('\n')
    );
    expect(diagnostics).toEqual([]);
    expect(model.elements.map((e) => e.id)).toEqual([
      'softwareSystem',
      'on',
      '3ds',
      'c4-beta',
      'legend-svc',
    ]);
  });

  it('splits an arrow from the ids around it', () => {
    const { model } = parse('person a-b "A"\nperson c "C"\na-b-->c');
    expect(model.relations[0]).toMatchObject({ from: 'a-b', to: 'c' });
  });

  it('ignores a comment, a trailing comment, a directive and front matter', () => {
    const src =
      '---\ntitle: x\n---\n%%{init: {}}%%\n%% c\nc4-beta %% h\nperson p "P %% not a comment" %% c\n';
    const { model, diagnostics } = parseC4Beta(src);
    expect(diagnostics).toEqual([]);
    expect(model.elements[0]?.name).toBe('P %% not a comment');
  });

  it('accepts an empty body and CRLF line breaks', () => {
    const { model, diagnostics } = parseC4Beta(
      'c4-beta\r\ngroup g "G" {}\r\nsoftwareSystem s "S" {\r\n}\r\n'
    );
    expect(diagnostics).toEqual([]);
    // A group is a boundary with or without children; a software system needs them.
    expect(model.elements.map((e) => e.boundary)).toEqual([true, false]);
  });

  it('keeps the first of a duplicate id and moves its children to it', () => {
    const { model, diagnostics } = parse(
      'softwareSystem s "First"\nsoftwareSystem s "Second" {\n  container c "C"\n}'
    );
    expect(diagnostics.map((d) => d.code)).toEqual(['C4BETA_DUPLICATE_ID']);
    expect(diagnostics[0]?.message).toMatch(/line 2 and at line 3/);
    expect(model.elements.map((e) => [e.id, e.name, e.parent])).toEqual([
      ['s', 'First', undefined],
      ['c', 'C', 's'],
    ]);
  });

  it('drops the style entries the renderer has no use for, with one warning', () => {
    const { model, diagnostics } = parse('style a foo:bar, line:wavy, fill:red, shape:cylinder');
    expect(model.styles[0]?.entries.map((e) => e.key)).toEqual(['fill', 'shape']);
    expect(diagnostics.map((d) => d.code)).toEqual(['C4BETA_STYLE_IGNORED']);
    expect(diagnostics[0]?.message).toMatch(/foo:bar.*line:wavy/);
  });

  it('lets the last title, direction and legend win', () => {
    const { model } = parse('title A\ntitle B\ndirection RL\ndirection BT\nlegend off\nlegend on');
    expect(model).toMatchObject({ title: 'B', direction: 'BT', legend: true });
  });
});

describe('c4-beta statement spans and symbols', () => {
  it('records each statement, a body holding its elements, and each id use', () => {
    const r = parse('softwareSystem s "S" {\n  container c "C"\n}\nc --> s');
    expect(r.statements.map((s) => [s.kind, s.children?.map((c) => c.kind)])).toEqual([
      ['header', undefined],
      ['element', ['element']],
      ['relation', undefined],
    ]);
    expect(r.symbols.map((s) => [s.name, s.role])).toEqual([
      ['s', 'def'],
      ['c', 'def'],
      ['c', 'ref'],
      ['s', 'ref'],
    ]);
  });
});
