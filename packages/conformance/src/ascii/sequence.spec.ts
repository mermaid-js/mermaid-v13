import { describe, expect, it } from 'vitest';
import { renderSequenceAscii } from './sequence-render.ts';

// The sequence diagram's `ascii` hook (#150, D100, D108, D82) through the public
// `renderSync(…, { format: 'ascii' })`, with the plugin registered as #145's manifest will
// register it (`sequence-render.ts`).

const lines = (...rows: string[]): string => rows.join('\n');
const text = async (src: string, charset: 'unicode' | 'ascii' = 'unicode') =>
  (await renderSequenceAscii(src, { charset })).text;
// The rows that carry a message line: they start at A's lifeline with a tee or a circle.
const messageRows = (out: string): string[] =>
  out.split('\n').filter((r) => /^ {2}[├+●o]/u.test(r));

describe('sequence ascii', () => {
  it('returns the text with its columns and rows', async () => {
    const r = await renderSequenceAscii('sequenceDiagram\nA->>B: hi');
    expect(r.format).toBe('ascii');
    expect(r.text).toBe(
      lines(
        '┌───┐        ┌───┐',
        '│ A │        │ B │',
        '└─┬─┘        └─┬─┘',
        '  ┆            ┆',
        '  ┆    hi      ┆',
        '  ├───────────►┆',
        '  ┆            ┆',
        '┌─┴─┐        ┌─┴─┐',
        '│ A │        │ B │',
        '└───┘        └───┘'
      )
    );
    expect([r.columns, r.rows, r.warnings]).toEqual([18, 10, []]);
  });

  it('draws every head in both charsets', async () => {
    const src = [
      'sequenceDiagram',
      'A->>B: a',
      'A-->>B: b',
      'A->B: c',
      'A-xB: e',
      'A--)B: h',
      'A<<->>B: i',
      'A-|\\B: j',
      'A-|/B: k',
      'A/|-B: l',
    ].join('\n');
    expect(messageRows(await text(src))).toEqual([
      '  ├──────────►┆',
      '  ├┄┄┄┄┄┄┄┄┄┄►┆',
      '  ├───────────┆',
      '  ├──────────✕┆',
      '  ├┄┄┄┄┄┄┄┄┄┄)┆',
      '  ├◄─────────►┆',
      '  ├──────────⇀┆',
      '  ├──────────⇁┆',
      '  ├↽──────────┆',
    ]);
    expect(messageRows(await text(src, 'ascii'))).toEqual([
      '  +---------->:',
      '  +..........>:',
      '  +-----------:',
      '  +----------x:',
      '  +..........):',
      '  +<--------->:',
      '  +---------->:',
      '  +---------->:',
      '  +<----------:',
    ]);
  });

  it('draws central connections as circles on the lifelines', async () => {
    const out = await text('sequenceDiagram\nA ->>() B: t1\nA ()->> B: t2');
    expect(messageRows(out)).toEqual(['  ├───────────►●', '  ●───────────►┆']);
  });

  it('draws activations as heavy lifelines, stacked bars one column right, self loops beside', async () => {
    expect(
      await text('sequenceDiagram\nA->>+B: go\nB->>+B: self\nB-->>-B: back\nB-->>-A: done')
    ).toBe(
      lines(
        '┌───┐          ┌───┐',
        '│ A │          │ B │',
        '└─┬─┘          └─┬─┘',
        '  ┆              ┆',
        '  ┆     go       ┆',
        '  ├─────────────►┃',
        '  ┆              ┃ self',
        '  ┆              ┠───┐',
        '  ┆              ┃◄──┘',
        '  ┆              ┃┃',
        '  ┆              ┃┃ back',
        '  ┆              ┃┠┄┄┄┐',
        '  ┆              ┃┃◄┄┄┘',
        '  ┆              ┃┃',
        '  ┆    done      ┃',
        '  ┆◄┄┄┄┄┄┄┄┄┄┄┄┄┄┨',
        '  ┆              ┆',
        '┌─┴─┐          ┌─┴─┐',
        '│ A │          │ B │',
        '└───┘          └───┘'
      )
    );
  });

  it('draws a fragment frame with its keyword on the border, clear of the lifelines, and dashed section dividers', async () => {
    const out = await text(
      'sequenceDiagram\nA->>B: request\nalt is valid\nB-->>A: success\nelse is invalid\nB-->>A: error\nend'
    );
    expect(out.split('\n').slice(6, 17)).toEqual([
      '┌───┼ alt ────────────┼───┐',
      '│   ┆      [is valid] ┆   │',
      '│   ┆                 ┆   │',
      '│   ┆    success      ┆   │',
      '│   ┆◄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┤   │',
      '├┄┄┄┼┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┼┄┄┄┤',
      '│   ┆  [is invalid]   ┆   │',
      '│   ┆                 ┆   │',
      '│   ┆     error       ┆   │',
      '│   ┆◄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┤   │',
      '└───┼─────────────────┼───┘',
    ]);
  });

  it('numbers messages in front of their labels', async () => {
    const out = await text('sequenceDiagram\nautonumber\nA->>B: one\nB->>B: two');
    expect(out).toContain('  ┆    1. one      ┆');
    expect(out).toContain('┆ 2. two');
  });

  it('prints the front-matter title on top, and lays out a title statement', async () => {
    const front = await text('---\ntitle: Front\n---\nsequenceDiagram\nA->>B: hi');
    expect(front.split('\n').slice(0, 3)).toEqual(['      Front', '', '┌───┐        ┌───┐']);
    const own = await text('sequenceDiagram\ntitle: Own\nA->>B: hi');
    expect(own.split('\n')[0]).toBe('       Own');
  });

  it('draws actors rounded and databases capped; other symbols are boxes, with one warning', async () => {
    const r = await renderSequenceAscii(
      [
        'sequenceDiagram',
        'actor A',
        'participant D@{ "type": "database" }',
        'participant C@{ "type": "control" }',
        'participant Q@{ "type": "queue" }',
        'participant E@{ "type": "control" }',
      ].join('\n')
    );
    expect(r.text.split('\n').slice(0, 3)).toEqual([
      '╭───╮      ╒═══╕      ┌───┐      ┌───┐      ┌───┐',
      '│ A │      │ D │      │ C │      │ Q │      │ E │',
      '╰─┬─╯      ╘═╤═╛      └─┬─┘      └─┬─┘      └─┬─┘',
    ]);
    expect(r.warnings).toEqual([
      expect.objectContaining({
        code: 'ASCII_SHAPE',
        shapes: ['control', 'queue'],
        astIds: ['p:C', 'p:Q', 'p:E'],
      }),
    ]);
  });

  it('drops colours, menus and accessibility text with one warning per kind', async () => {
    const r = await renderSequenceAscii(
      [
        'sequenceDiagram',
        'box Aqua Team',
        'participant A',
        'end',
        'rect rgb(1,2,3)',
        'A->>B: x',
        'end',
        'rect rgb(4,5,6)',
        'A->>B: y',
        'end',
        'link A: Docs @ https://example.com',
        'accTitle: T',
        'accDescr: D',
      ].join('\n')
    );
    expect(r.warnings.map((w) => [w.code, w.feature, w.astIds])).toEqual([
      ['ASCII_DROPPED', 'style', ['box:1', 'st:1', 'st:2']],
      ['ASCII_DROPPED', 'link', ['p:A', 'st:3']],
      ['ASCII_DROPPED', 'accessibility', ['st:4', 'st:5']],
    ]);
    // The box frame and its title stay; the rects leave no trace.
    expect(r.text.split('\n')[0]).toBe('┌─ Team ──┐');
  });
});

/** The column of a frame's top-right corner in `row`, and every row down to its bottom. */
function rightSide(out: string, from = '┌'): { col: number; rows: string[] } {
  const rows = out.split('\n');
  const top = rows.findIndex((r) => r.includes(from));
  const col = [...rows[top]!].lastIndexOf('┐');
  const bottom = rows.findIndex((r, i) => i > top && [...r][col] === '┘');
  return { col, rows: rows.slice(top + 1, bottom) };
}
const cellAt = (row: string, col: number): string => [...row][col] ?? ' ';
const config = (sequence: Record<string, unknown>, body: string): string =>
  `---\nconfig:\n  sequence: ${JSON.stringify(sequence)}\n---\nsequenceDiagram\n${body}`;

describe('sequence ascii: nothing drawn over a line or border', () => {
  it('keeps a self loop whole with rightAngles', async () => {
    const out = await text(config({ rightAngles: true }, 'A->>A: one line\nA->>B: x'));
    const rows = out.split('\n');
    const label = rows.findIndex((r) => r.includes('one line'));
    expect(rows[label]).toMatch(/^ {2}┆ one line +┆$/u);
    expect(rows[label + 1]).toMatch(/^ {2}├─+┐ +┆$/u);
    expect(rows[label + 2]).toMatch(/^ {2}┆◄─+┘ +┆$/u);
  });

  it.each([['n'.repeat(29)], ['note across the loop border']])(
    'sizes a note over two participants to its text: %s',
    async (note) => {
      const out = await text(
        `sequenceDiagram\nparticipant A\nparticipant B\nparticipant C\nloop L\nA->>B: x\nend\nNote over B,C: ${note}`
      );
      expect(out).toMatch(new RegExp(`│ +${note} +│`, 'u'));
    }
  );

  it('makes room for the sequence number on a message', async () => {
    const out = await text('sequenceDiagram\nautonumber 100\nA->>B: x\nB->>A: y');
    const row = out.split('\n').find((r) => r.includes('100. x'))!;
    expect(cellAt(row, 2)).toBe('┆');
  });

  it('makes room for the sequence number on a self message in a frame', async () => {
    const out = await text(
      'sequenceDiagram\nautonumber 1000\nloop L\nA->>B: x\nB->>B: selfie label\nend'
    );
    const { col, rows } = rightSide(out, ' loop ');
    for (const r of rows) expect(['│', '├', '┤', '┼'], r).toContain(cellAt(r, col));
    expect(out).toContain('1001. selfie label');
  });

  it("grows a box to hold its last member's self message and right note", async () => {
    const out = await text(
      'sequenceDiagram\nbox G\nparticipant A\nparticipant B\nend\nB->>B: a self message with a long label\nNote right of B: right note'
    );
    const { col, rows } = rightSide(out);
    for (const r of rows) expect(['│'], r).toContain(cellAt(r, col));
  });

  it('keeps message labels off a box border they cross', async () => {
    const out = await text(
      'sequenceDiagram\nbox Group\nparticipant A\nparticipant B\nend\nparticipant C\nA->>C: a long label that should cross the box border\nC->>B: another long label crossing the frame border here'
    );
    const { col, rows } = rightSide(out);
    for (const r of rows) expect(['│', '┼'], r).toContain(cellAt(r, col));
  });

  it('gives a box title a space and a border run either side', async () => {
    const out = await text(
      'sequenceDiagram\nbox Two words\nparticipant A\nend\nparticipant B\nA->>B: x'
    );
    expect(out.split('\n')[0]).toMatch(/^┌─+ Two words ─+┐$/u);
  });

  it('keeps the lifeline crossing under a fragment keyword', async () => {
    const out = await text('sequenceDiagram\nalt\nA->>B: inner\nend');
    const rows = out.split('\n');
    const top = rows.find((r) => r.startsWith('┌ ') || r.includes(' alt '))!;
    const lifeline = [...rows[3]!].indexOf('┆');
    expect(cellAt(top, lifeline)).toBe('┼');
    expect(top).toContain(' alt ');
  });

  it('draws central circles where a self message leaves and comes back', async () => {
    const rows = (await text('sequenceDiagram\nA()->>()A: both')).split('\n');
    expect(rows.filter((r) => r.startsWith('  ●'))).toHaveLength(2);
    const to = (await text('sequenceDiagram\nA->>()A: to')).split('\n');
    expect(to.filter((r) => r.startsWith('  ●'))).toHaveLength(1);
    expect(to.find((r) => r.startsWith('  ●'))).toMatch(/◄/u);
  });
});

describe('sequence ascii: frames around self messages', () => {
  it('closes a frame one row below a self loop', async () => {
    const rows = (
      await text('sequenceDiagram\nA->>B: x\nloop L\nB->>A: back\nA->>A: self\nend')
    ).split('\n');
    const loop = rows.findIndex((r) => r.includes('◄──┘'));
    expect(rows[loop + 1]).toMatch(/^│ +┆ +┆ +│$/u);
    expect(rows[loop + 2]).toMatch(/^└/u);
  });
});

describe('sequence ascii: alignment', () => {
  it('aligns each line of a multi-line label per messageAlign and noteAlign', async () => {
    const left = await text(
      config(
        { messageAlign: 'left', noteAlign: 'left' },
        'A->>B: short<br/>a much longer second line\nNote over A,B: a<br/>longer line here'
      )
    );
    const col = (s: string) =>
      left
        .split('\n')
        .find((r) => r.includes(s))!
        .indexOf(s);
    expect(col('short')).toBe(col('a much longer'));
    const noteA = left.split('\n').find((r) => /│ +a +│/u.test(r))!;
    expect(noteA.indexOf('a')).toBe(col('longer line here'));
    const right = await text(
      config({ messageAlign: 'right' }, 'A->>B: short<br/>a much longer second line')
    );
    const end = (s: string) => {
      const r = right.split('\n').find((x) => x.includes(s))!;
      return r.indexOf(s) + s.length;
    };
    expect(end('short')).toBe(end('a much longer second line'));
  });

  it('aligns the lines of a self message label per messageAlign', async () => {
    const out = await text(config({ messageAlign: 'right' }, 'A->>A: self<br/>two lines'));
    const end = (s: string) => {
      const r = out.split('\n').find((x) => x.includes(s))!;
      return r.indexOf(s) + s.length;
    };
    expect(end('self')).toBe(end('two lines'));
  });
});

describe('sequence ascii: warnings for what text cannot show', () => {
  it('warns once for bold and italic text', async () => {
    const r = await renderSequenceAscii(
      'sequenceDiagram\nA->>B: <b>bold</b> and <br/> break\nNote over A: <i>it</i>'
    );
    expect(r.warnings.map((w) => [w.code, w.feature, w.astIds])).toEqual([
      ['ASCII_DROPPED', 'emphasis', ['m:A>B', 'note:1']],
    ]);
  });

  it('warns once that ASCII draws half arrowheads as full ones', async () => {
    const src = 'sequenceDiagram\nA-|\\B: top\nA-|/B: bottom\nA->>B: full';
    expect((await renderSequenceAscii(src, { charset: 'ascii' })).warnings).toEqual([
      expect.objectContaining({
        code: 'ASCII_SHAPE',
        shapes: ['half-arrowhead'],
        astIds: ['m:A>B', 'm:A>B#2'],
      }),
    ]);
    expect((await renderSequenceAscii(src)).warnings).toEqual([]);
  });
});
