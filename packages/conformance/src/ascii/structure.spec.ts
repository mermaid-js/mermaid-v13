import { describe, expect, it } from 'vitest';
import { readStructure, type Expected } from './structure.ts';

// The structural reader on hand-drawn texts in both charsets and in mermaid-ascii's style.
const want = (nodes: string[], edgeLabels: string[] = [], texts: string[] = []): Expected => ({
  nodes,
  edgeLabels,
  texts,
});
const read = (lines: string[], charset: 'unicode' | 'ascii', expected: Expected) =>
  readStructure(lines.join('\n'), charset, expected);

describe('readStructure', () => {
  it('reads boxes, their labels, a connecting line and its head (v13, unicode)', () => {
    const s = read(
      ['┌───┐      ┌───┐', '│ A ├─────►│ B │', '└───┘      └───┘'],
      'unicode',
      want(['A', 'B'])
    );
    expect(s.boxes.map((b) => b.lines)).toEqual([['A'], ['B']]);
    expect(s).toMatchObject({ heads: 1, missingNodes: [], missingEdgeLabels: [], dangling: [] });
  });

  it('reads mermaid-ascii boxes (padding rows, no tees) in ASCII', () => {
    const s = read(
      [
        '+---+     +---+',
        '|   |     |   |',
        '| A |---->| B |',
        '|   |     |   |',
        '+---+     +---+',
      ],
      'ascii',
      want(['A', 'B'])
    );
    expect(s).toMatchObject({ heads: 1, missingNodes: [], dangling: [] });
  });

  it('reports a node label in no box, and a line with a free end', () => {
    const s = read(['┌───┐', '│ A ├────►', '└───┘'], 'unicode', want(['A', 'B']));
    expect(s.missingNodes).toEqual(['B']);
    expect(s.dangling).toEqual(['5,1']);
  });

  it('matches a label wrapped differently, and a multi-line label', () => {
    const s = read(
      ['┌───────┐', '│ two   │', '│ lines │', '└───────┘'],
      'unicode',
      want(['two lines'])
    );
    expect(s.missingNodes).toEqual([]);
  });

  it('joins a line across its edge label, on the line or on its own row', () => {
    const across = read(
      ['┌───┐          ┌───┐', '│ A ├── text ─►│ B │', '└───┘          └───┘'],
      'unicode',
      want(['A', 'B'], ['text'])
    );
    expect(across).toMatchObject({ heads: 1, missingEdgeLabels: [], dangling: [] });
    const below = read(
      ['┌───┐', '│ A │', '└─┬─┘', ' text', '  ▼', '┌───┐', '│ B │', '└───┘'],
      'unicode',
      want(['A', 'B'], ['text'])
    );
    expect(below).toMatchObject({ heads: 1, missingEdgeLabels: [], dangling: [] });
  });

  it('reports a missing edge label', () => {
    const s = read(
      ['┌───┐     ┌───┐', '│ A ├────►│ B │', '└───┘     └───┘'],
      'unicode',
      want(['A', 'B'], ['yes'])
    );
    expect(s.missingEdgeLabels).toEqual(['yes']);
  });

  it('reads a frame with its title on the border, and one with the title inside', () => {
    const v13 = read(
      ['┌─ one ──┐', '│        │', '│ ┌────┐ │', '│ │ b1 │ │', '│ └────┘ │', '└────────┘'],
      'unicode',
      want(['b1'], [], ['one'])
    );
    expect(v13.boxes.map((b) => b.frame)).toEqual([true, false]);
    const upstream = read(
      ['+--------+', '|  one   |', '| +----+ |', '| | b1 | |', '| +----+ |', '+--------+'],
      'ascii',
      want(['b1'], [], ['one'])
    );
    expect(upstream.boxes.map((b) => b.frame)).toEqual([true, false]);
    expect(upstream.missingNodes).toEqual([]);
  });

  it('reads ASCII frame titles that hold line glyphs (`P1.5`, `a-b-c`, `I`)', () => {
    for (const title of ['P1.5', 'a-b-c', 'I']) {
      const top = `+-- ${title} --+`;
      const w = top.length;
      const row = (inner: string) => `|${inner.padEnd(w - 2)}|`;
      const s = read(
        [top, row(''), row(' +---+'), row(' | b |'), row(' +---+'), `+${'-'.repeat(w - 2)}+`],
        'ascii',
        want(['b'], [], [title])
      );
      expect(
        s.boxes.map((b) => b.frame),
        title
      ).toEqual([true, false]);
      expect(s.dangling, title).toEqual([]);
    }
  });

  it('reads two ASCII heads side by side (`vv`) as heads, not a word', () => {
    const s = read(
      [
        '+---+ +---+',
        '| A | | B |',
        '+-+-+ +-+-+',
        '  |     |',
        '  +----+|',
        '       ||',
        '       vv',
        '    +-----+',
        '    |  C  |',
        '    +-----+',
      ],
      'ascii',
      want(['A', 'B', 'C'])
    );
    expect(s).toMatchObject({ heads: 2, dangling: [] });
  });

  it('does not read a box out of edge corners or a crossing (ASCII `+`)', () => {
    const s = read(
      [
        '+---+      +---+',
        '| A +--+   | B |',
        '+---+  |   +-+-+',
        '       |     |',
        '       +-----+',
      ],
      'ascii',
      want(['A', 'B'])
    );
    expect(s.boxes).toHaveLength(2);
    expect(s.dangling).toEqual([]);
  });

  it('counts heads, not the letters of a label (`v` in `over`)', () => {
    const s = read(
      ['+---+', '| A |', '+-+-+', '  |', ' over', '  |', '  v', '+---+', '| B |', '+---+'],
      'ascii',
      want(['A', 'B'], ['over'])
    );
    expect(s).toMatchObject({ heads: 1, missingEdgeLabels: [], dangling: [] });
  });

  it("joins mermaid-ascii's dotted `- - >` into one line", () => {
    const s = read(
      ['+---+     +---+', '| A |- - >| B |', '+---+     +---+'],
      'ascii',
      want(['A', 'B'])
    );
    expect(s).toMatchObject({ heads: 1, dangling: [] });
  });

  it('keeps wide graphemes in two cells', () => {
    const s = read(
      ['┌──────┐      ┌───┐', '│ 顧客 ├─────►│ B │', '└──────┘      └───┘'],
      'unicode',
      want(['顧客', 'B'])
    );
    expect(s).toMatchObject({ heads: 1, missingNodes: [], dangling: [] });
  });

  it('reads the side marks of diamonds and hexagons as border', () => {
    const s = read(
      [
        '+----*-----+      +---------+',
        '* Decision +----->< Hexagon >',
        '+----*-----+      +---------+',
      ],
      'ascii',
      want(['Decision', 'Hexagon'])
    );
    expect(s).toMatchObject({ heads: 1, missingNodes: [], dangling: [] });
  });
});
