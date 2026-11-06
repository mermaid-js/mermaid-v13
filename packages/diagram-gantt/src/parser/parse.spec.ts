import { describe, expect, it } from 'vitest';
import { detectGantt, parseGantt } from './index.ts';

const S = 'gantt\ndateFormat YYYY-MM-DD\n';

function parse(src: string) {
  const result = parseGantt(src);
  expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return result;
}

describe('parseGantt', () => {
  it('keeps the settings as v12 stored them', () => {
    const { model } = parse(
      'gantt\ndateFormat  YYYY-MM-DD \naxisFormat %d\naxisFormat %m-%d\ntickInterval 1week\n' +
        'todayMarker stroke:#f00\ninclusiveEndDates\ntopAxis\nweekday monday\nweekend friday\n' +
        'excludes weekends, 2024-01-03\nexcludes Friday 2024-01-03\nincludes 2024-01-06\n'
    );
    expect(model).toMatchObject({
      dateFormat: ' YYYY-MM-DD ',
      axisFormat: '%m-%d',
      tickInterval: '1week',
      todayMarker: 'stroke:#f00',
      inclusiveEndDates: true,
      topAxis: true,
      weekday: 'monday',
      weekend: 'friday',
      excludes: ['weekends', '2024-01-03', 'friday'],
      includes: ['2024-01-06'],
    });
  });

  it('leaves unset settings at v12 defaults, the weekday to config (D279)', () => {
    const { model } = parse('gantt\n');
    expect(model).toMatchObject({
      dateFormat: '',
      axisFormat: '',
      todayMarker: '',
      excludes: [],
      inclusiveEndDates: false,
      topAxis: false,
      weekend: 'saturday',
    });
    expect(model.weekday).toBeUndefined();
    expect(model.tickInterval).toBeUndefined();
    expect(model.title).toBeUndefined();
    expect(model.source).toBe('gantt\n');
  });

  it('reads raw tasks: tags, ids, start and end as written', () => {
    const src =
      S +
      'section A\nDesign  :crit, active, a1, 2024-01-01, 3d\nBuild :after a1, 2d\nShip :2d\n' +
      'section B\nM :milestone, m1, 2024-01-10, 0d\nToo many :x, 2024-01-01, 1d, 2d\nNext :1d\n';
    const { model } = parse(src);
    expect(model.sections.map((s) => [s.ast, s.text])).toEqual([
      ['s:A', 'A'],
      ['s:B', 'B'],
    ]);
    expect(
      model.tasks.map((t) => [t.ast, t.id, t.text, t.section, t.tags, t.start, t.end, t.prevId])
    ).toEqual([
      ['t:a1', 'a1', 'Design  ', 0, ['crit', 'active'], '2024-01-01', '3d', undefined],
      ['t:task1', 'task1', 'Build ', 0, [], 'after a1', '2d', 'a1'],
      ['t:task2', 'task2', 'Ship ', 0, [], undefined, '2d', 'task1'],
      ['t:m1', 'm1', 'M ', 1, ['milestone'], '2024-01-10', '0d', 'task2'],
      // More than three fields: no id (v12 set none) and the statement's AST id; the next
      // task has no previous id.
      ['st:3', '', 'Too many ', 1, [], '2024-01-01', '1d', 'm1'],
      ['t:task3', 'task3', 'Next ', 1, [], undefined, '1d', undefined],
    ]);
    // More than three fields is a schedule error (D274): the fields are kept for it.
    expect(model.tasks[4]?.fields).toEqual(['x', '2024-01-01', '1d', '2d']);
    const design = model.tasks[0];
    expect(src.slice(design?.range.start, design?.range.end)).toBe(
      'Design  :crit, active, a1, 2024-01-01, 3d'
    );
    expect(src.slice(design?.dataRange.start, design?.dataRange.end)).toBe(
      ':crit, active, a1, 2024-01-01, 3d'
    );
  });

  it('gives repeated ids and section names their own AST ids (pitfall 9)', () => {
    const { model, ast } = parse(
      S + 'section A\na :x, 2024-01-01, 1d\nsection A\nb :x, 2024-01-02, 1d\nc :1d\n'
    );
    expect(model.tasks.map((t) => t.ast)).toEqual(['t:x', 't:x@2', 't:task1']);
    expect(model.sections.map((s) => s.ast)).toEqual(['s:A', 's:A@2']);
    expect(ast.children.map((n) => n.id)).toEqual([
      'st:1',
      'st:2',
      's:A',
      't:x',
      's:A@2',
      't:x@2',
      't:task1',
    ]);
  });

  it('reads clicks with href and call, either order', () => {
    const { model, ast } = parse(
      S +
        'a :a1, 2024-01-01, 1d\nclick a1 href "https://example.com"\nclick a1,b1 call cb("x", y)\n' +
        'click a1 href "u" call f()\nclick a1 call g(1) href "v"\n'
    );
    expect(model.clicks.map(({ ast: id, ids, href, call }) => ({ id, ids, href, call }))).toEqual([
      { id: 'click:1', ids: ['a1'], href: 'https://example.com', call: undefined },
      { id: 'click:2', ids: ['a1', 'b1'], href: undefined, call: { name: 'cb', args: '"x", y' } },
      { id: 'click:3', ids: ['a1'], href: 'u', call: { name: 'f' } },
      { id: 'click:4', ids: ['a1'], href: 'v', call: { name: 'g', args: '1' } },
    ]);
    const click = ast.children.find((n) => n.id === 'click:2');
    expect(click).toMatchObject({
      callback: { targets: ['a1', 'b1'], name: 'cb', args: '"x", y' },
    });
  });

  it('takes the in-text title over the front-matter one (D218)', () => {
    expect(parse('---\ntitle: FM\n---\ngantt\n').model.title).toBe('FM');
    const { model } = parse('---\ntitle: FM\n---\ngantt\ntitle  In text\n');
    expect(model.title).toBe(' In text');
    expect(model.titleAst).toBe('st:2');
  });

  it('trims the accessibility values as v12 did', () => {
    const { model } = parse('gantt\naccTitle:  T \naccDescr {\n  one\n    two\n}\n');
    expect(model.accTitle).toBe('T');
    expect(model.accDescr).toBe('one\ntwo');
  });

  it('accepts the topAxis statement (D273)', () => {
    expect(parse('gantt\ntopAxis\n').model.topAxis).toBe(true);
  });

  it('does not depend on what was parsed before (no module state)', () => {
    parse(S + 'a :x, 2024-01-01, 1d\n');
    const { model } = parse(S + 'b :2024-01-01, 1d\n');
    expect(model.tasks.map((t) => t.id)).toEqual(['task1']);
  });

  it('detects as v12 did: case-sensitive, no word boundary', () => {
    expect(detectGantt('gantt\n')).toBe(true);
    expect(detectGantt('---\ntitle: x\n---\n  gantt')).toBe(true);
    expect(detectGantt('ganttx')).toBe(true);
    expect(detectGantt('GANTT')).toBe(false);
  });
});
