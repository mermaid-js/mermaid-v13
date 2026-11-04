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

  it('draws a fragment frame with its keyword on the border and dashed section dividers', async () => {
    const out = await text(
      'sequenceDiagram\nA->>B: request\nalt is valid\nB-->>A: success\nelse is invalid\nB-->>A: error\nend'
    );
    expect(out.split('\n').slice(6, 17)).toEqual([
      '┌ alt ────────────────┼───┐',
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
    expect(out).toContain('  ┆ 1. one');
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
