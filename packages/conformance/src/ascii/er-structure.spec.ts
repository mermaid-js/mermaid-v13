import { describe, expect, it } from 'vitest';
import { readErStructure, stripMarks, type ErExpected } from './er-structure.ts';

// The ER reader (#136) over hand-written drawings: mermaid-ascii's layout and ours, both
// charsets, and drawings with something wrong in them.

const lines = (...rows: string[]): string => rows.join('\n');

const single: ErExpected = {
  entities: [
    { name: 'CUSTOMER', rows: [] },
    { name: 'ORDER', rows: [] },
  ],
  edgeLabels: ['places'],
  texts: [],
};

describe('crow’s-foot marks', () => {
  it('reads mermaid-ascii’s marks on a horizontal line', () => {
    const upstream = lines(
      '┌──────────┐            ┌───────┐',
      '│ CUSTOMER │            │ ORDER │',
      '└─────┬────┘            └───┬───┘',
      '      └||─────places──────o{┘'
    );
    const s = readErStructure(upstream, 'unicode', single);
    expect(s).toMatchObject({
      ends: 2,
      kinds: ['onlyOne', 'zeroOrMore'],
      heads: 0,
      missingEntities: [],
      missingEdgeLabels: [],
      dangling: [],
    });
  });

  it('reads ours on a vertical line, in ascii too, and an outer mark on a corner', () => {
    const ours = lines(
      '+-----------+',
      '| CUSTOMER  |',
      '+-----+-----+',
      '      =',
      '      v',
      '      |',
      '    places',
      '      |',
      '  o---+',
      '  ^',
      '+-+-------+',
      '|  ORDER  |',
      '+---------+'
    );
    const s = readErStructure(ours, 'ascii', single);
    expect(s).toMatchObject({ ends: 2, kinds: ['oneOrMore', 'zeroOrMore'], dangling: [] });
  });

  it('leaves letters of a label glued to the line alone', () => {
    const { ends, text } = stripMarks('┌─┐   ┌─┐\n└┬┘   └┬┘\n └─owns┘', 'unicode');
    expect(ends).toBe(0);
    expect(text).toContain('owns');
  });

  it('does not take an ASCII vertical line beside a corner for a bar', () => {
    const { ends } = stripMarks('   |\n   |+}|---|{+\n   +', 'ascii');
    expect(ends).toBe(2);
  });
});

describe('what a drawing is missing', () => {
  const table: ErExpected = {
    entities: [{ name: 'ORDER', rows: [['int', 'id', 'PK']] }],
    edgeLabels: [],
    texts: [],
  };

  it('finds a table by its name and its cells', () => {
    const ok = lines(
      '┌───────────────┐',
      '│     ORDER     │',
      '├─────┬────┬────┤',
      '│ int │ id │ PK │',
      '└─────┴────┴────┘'
    );
    expect(readErStructure(ok, 'unicode', table).missingEntities).toEqual([]);
    const wrong = ok.replace('PK', 'FK');
    expect(readErStructure(wrong, 'unicode', table).missingEntities).toEqual(['ORDER']);
  });

  it('reports a line with a free end and a missing mark', () => {
    const broken = lines(
      '┌──────────┐            ┌───────┐',
      '│ CUSTOMER │            │ ORDER │',
      '└─────┬────┘            └───────┘',
      '      └||─────places──────o{'
    );
    const s = readErStructure(broken, 'unicode', single);
    expect(s.dangling).not.toEqual([]);
    expect(s.ends).toBe(1);
  });

  it('reports a missing label and arrowheads', () => {
    const s = readErStructure(
      lines('┌───┐   ┌───┐', '│ A │   │ B │', '└─┬─┘   └─┬─┘', '  └──────►┘'),
      'unicode',
      { entities: [], edgeLabels: ['x'], texts: [] }
    );
    expect(s.missingEdgeLabels).toEqual(['x']);
    expect(s.heads).toBe(1);
  });
});
