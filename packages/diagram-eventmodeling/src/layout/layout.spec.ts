import { beforeAll, describe, expect, it } from 'vitest';
import type { Warning } from '@mermaid-js/core';
import type { Theme } from '@mermaid-js/core/theme';
import { EVENTMODELING_CONFIG_INVALID } from '../codes.ts';
import { eventModelTestContext, eventModelTestTheme } from '../test-context.ts';
import { frame, halfEm, model } from './fixtures.ts';
import { eventModelLayoutViolations } from './invariants.ts';
import { layoutEventModel } from './layout.ts';
import type { EventModel } from '../model.ts';
import type { EventModelLayout } from './types.ts';

// Worked by hand with the half-em measurer at the default theme's 16 px: a character is 8 wide,
// a line 16 high. A box with short text is `80 + 20` square.
let theme: Theme;
beforeAll(async () => {
  theme = await eventModelTestTheme();
});

function lay(m: EventModel, section: Record<string, unknown> = {}, warn?: (w: Warning) => void) {
  const layout = layoutEventModel(m, eventModelTestContext(theme, section, halfEm, warn));
  expect(eventModelLayoutViolations(m, layout)).toEqual([]);
  return layout;
}

const boxAt = (l: EventModelLayout) => l.boxes.map((b) => [b.x, b.y, b.width, b.height]);

describe('layoutEventModel', () => {
  it('measures in the theme font', () => {
    const l = lay(model(frame('ui', 'A')));
    expect(l.font).toEqual({ family: theme.value('fontFamily'), size: 16, weight: 400 });
    expect(l.radius).toBe(3);
  });

  it('places one box at x 250 in a lane 130 high (v12)', () => {
    const l = lay(model(frame('ui', 'A')));
    expect(boxAt(l)).toEqual([[250, 15, 100, 100]]);
    const [lane] = l.lanes;
    expect(lane).toMatchObject({
      index: 0,
      id: 'lane:0',
      band: 'trigger',
      x: 0,
      y: 0,
      height: 130,
    });
    // maxR is 250 + 100 + 10; the lane reaches 15 past it.
    expect(lane?.width).toBe(375);
    expect(lane?.labelAt).toEqual({ x: 30, y: 30 });
    // 'UI/Automation', bold, its first baseline at the label point.
    expect(lane?.label).toMatchObject({ x: 30, y: 30 - 12.8, width: 104, height: 16 });
    expect(lane?.label.text.lines[0]?.[0]).toMatchObject({ text: 'UI/Automation', bold: true });
    expect(l.padding).toBe(30);
    expect(l.bounds).toEqual({ x: -30, y: -30, width: 435, height: 190 });
  });

  it('staggers a box in a new lane 80 before the previous r, lanes 10 apart', () => {
    const l = lay(model(frame('ui', 'A'), frame('cmd', 'B'), frame('evt', 'C')));
    expect(boxAt(l)).toEqual([
      [250, 15, 100, 100],
      [280, 155, 100, 100],
      [310, 295, 100, 100],
    ]);
    expect(l.lanes.map((x) => [x.index, x.y, x.height])).toEqual([
      [0, 0, 130],
      [100, 140, 130],
      [200, 280, 130],
    ]);
    // Inferred, down: from ⅔ of the source's width at its bottom to ⅓ of the target's at its top.
    expect(l.relations.map((r) => [r.route, r.inferred, r.id, r.points])).toEqual([
      [
        'down',
        true,
        'relation:01->02',
        [
          { x: 250 + 200 / 3, y: 115 },
          { x: 280 + 100 / 3, y: 155 },
        ],
      ],
      [
        'down',
        true,
        'relation:02->03',
        [
          { x: 280 + 200 / 3, y: 255 },
          { x: 310 + 100 / 3, y: 295 },
        ],
      ],
    ]);
    expect(l.relations[0]?.astId).toBeUndefined();
  });

  it('runs a relation up from the source top to the target bottom', () => {
    const l = lay(model(frame('evt', 'E'), frame('ui', 'U', { sources: ['01'] })));
    const [r] = l.relations;
    expect(r).toMatchObject({ route: 'up', inferred: false, astId: 'relation:01->02' });
    // The events lane is below the UI lane: E at (250, 155), U at (280, 15).
    expect(r?.points).toEqual([
      { x: 250 + 200 / 3, y: 155 },
      { x: 280 + 100 / 3, y: 115 },
    ]);
    // v12's head, 10 long and 7 wide, its tip at the end.
    expect(r?.head[1]).toEqual(r?.points[1]);
  });

  it('places a box after its lane right edge where v12 overlapped (D521)', () => {
    // A is 200 wide (20 characters: 160 + 20 + 20); v12 put C at 410, over A (250 to 450).
    const l = lay(model(frame('ui', 'A'.repeat(20)), frame('cmd', 'B'), frame('ui', 'C')));
    expect(boxAt(l).map(([x, , w]) => [x, w])).toEqual([
      [250, 200],
      [380, 100],
      [460, 100],
    ]);
  });

  it('follows on in the same lane 10 after the previous box', () => {
    const l = lay(model(frame('evt', 'A'), frame('evt', 'B', { sources: ['01'] })));
    expect(boxAt(l).map(([x]) => x)).toEqual([250, 360]);
    // Along the lane: right edge to left edge, at each box's middle (D521).
    expect(l.relations[0]).toMatchObject({
      route: 'along',
      points: [
        { x: 350, y: 65 },
        { x: 360, y: 65 },
      ],
      head: [
        { x: 350, y: 68.5 },
        { x: 360, y: 65 },
        { x: 350, y: 61.5 },
      ],
    });
  });

  it('loops a self relation over the top right corner, clear of the other anchors', () => {
    const l = lay(model(frame('evt', 'E'), frame('ui', 'A', { sources: ['01', '02'] })));
    const self = l.relations.find((r) => r.route === 'self');
    // A is at (280, 15), 100 wide: the loop rises 10 at 360, crosses to 370, comes down there.
    expect(self?.points).toEqual([
      { x: 360, y: 15 },
      { x: 360, y: 5 },
      { x: 370, y: 5 },
      { x: 370, y: 15 },
    ]);
    expect(self?.head).toEqual([
      { x: 366.5, y: 5 },
      { x: 370, y: 15 },
      { x: 373.5, y: 5 },
    ]);
    // The relation up from E ends at ⅓ of A's width on its bottom; nothing else ends at the loop.
    const up = l.relations.find((r) => r.route === 'up');
    expect(up?.points[1]).toEqual({ x: 280 + 100 / 3, y: 115 });
  });

  it('draws no relation to the first frame or a reset frame', () => {
    const l = lay(model(frame('ui', 'A'), frame('cmd', 'B', { reset: true }), frame('evt', 'C')));
    expect(l.relations.map((r) => r.id)).toEqual(['relation:02->03']);
  });

  it('puts a namespace in its own lane after the band default (D522)', () => {
    const l = lay(model(frame('cmd', 'Inv.Add'), frame('cmd', 'Do'), frame('cmd', 'Inv.Remove')));
    expect(l.lanes.map((x) => [x.index, x.namespace, x.label.text.lines[0]?.[0]?.text])).toEqual([
      [100, undefined, 'Command/Read Model'],
      [101, 'Inv', 'C/RM: Inv'],
    ]);
    expect(l.boxes.map((b) => b.lane)).toEqual([1, 0, 1]);
    expect(l.boxes[0]?.name.text.lines[0]?.[0]?.text).toBe('Add');
  });

  it('centres the bold name and puts the data under it, left-aligned in mono (D523)', () => {
    const l = lay(model(frame('cmd', 'Add', { data: { text: 'a: 1\n  b: 22\n\nc' } })));
    const [box] = l.boxes;
    // Text: name 16 + gap 16 + four data lines 64 = 96, 56 wide ('  b: 22'), so 100 + 20 by
    // 116 + 20.
    expect([box?.width, box?.height]).toEqual([100, 136]);
    expect(box?.name).toMatchObject({ x: 250 + 50 - 12, y: 15 + 20, width: 24, height: 16 });
    expect(box?.name.text.lines[0]?.[0]).toMatchObject({ text: 'Add', bold: true });
    const data = box?.data;
    expect(data).toMatchObject({ x: 270, y: 15 + 20 + 32, width: 56, height: 64 });
    expect(data?.text.left).toBe(true);
    expect(data?.text.indents).toEqual([0, 16, 0, 0]);
    expect(data?.text.widths).toEqual([32, 56, 0, 8]);
    // Blanks are no-break spaces, so a run of them is kept when drawn.
    expect(data?.text.lines.map((line) => line.map((r) => r.text).join(''))).toEqual([
      'a:\u00a01',
      'b:\u00a022',
      '',
      'c',
    ]);
    expect(data?.text.lines[0]?.[0]?.attrs).toEqual({ 'font-family': 'monospace' });
    expect(box?.clipped).toBeUndefined();
  });

  it('shows data as written: blanks kept, no tags, entities or written line breaks (D523)', () => {
    const text = '{\n  "id":    42,\n  "html": "<div>&amp;</div>",\n  "esc": "a\\nb <br/>"\n}';
    const l = lay(model(frame('cmd', 'A', { data: { text } })));
    const data = l.boxes[0]?.data;
    const shown = data?.text.lines.map((line) =>
      line.map((r) => r.text.replace(/\u00a0/g, ' ')).join('')
    );
    expect(shown).toEqual([
      '{',
      '"id":    42,',
      '"html": "<div>&amp;</div>",',
      '"esc": "a\\nb <br/>"',
      '}',
    ]);
    expect(data?.text.indents).toEqual([0, 16, 16, 16, 0]);
    // Each line is measured as drawn: its indent and 8 a character of the text shown.
    expect(data?.text.widths).toEqual(
      (shown ?? []).map((line, k) => (data?.text.indents[k] ?? 0) + [...line].length * 8)
    );
  });

  it('wraps names and data at 430, so a box is at most 470 wide', () => {
    // 53 characters (424) a line: 424 + 20 + 20.
    const word = 'x'.repeat(60);
    const l = lay(model(frame('ui', word, { data: { text: `${word} ${word}` } })));
    const [box] = l.boxes;
    expect(box?.width).toBe(464);
    expect(box?.name.text.lines.length).toBe(2);
    expect(box?.name.width).toBeLessThanOrEqual(430);
    expect(box?.data?.text.lines.length).toBe(4);
    expect(box?.data?.width).toBeLessThanOrEqual(430);
  });

  it('wraps an indented data line at 430 less its indent', () => {
    const l = lay(model(frame('ui', 'A', { data: { text: `a\n    ${'y '.repeat(30)}` } })));
    const data = l.boxes[0]?.data;
    // 32 of indent, then 398 left: 25 'y ' pairs fit (49 characters, 392).
    expect(data?.text.indents).toEqual([0, 32, 32]);
    expect(data?.text.widths).toEqual([8, 32 + 392, 32 + 72]);
  });

  it('stops at 750 + 20 high and leaves the lines out that do not fit', () => {
    const text = Array.from({ length: 100 }, (_, k) => `line ${k}`).join('\n');
    const l = lay(model(frame('evt', 'A', { data: { text } })));
    const [box] = l.boxes;
    expect(box?.height).toBe(770);
    expect(box?.clipped).toBe(true);
    // 730 of room: the name 16, the gap 16, 43 lines of 16.
    expect(box?.data?.text.lines.length).toBe(43);
    expect(l.lanes[0]?.height).toBe(800);
  });

  it('takes eventmodeling.padding, and warns on one that is not a finite length', () => {
    expect(lay(model(frame('ui', 'A')), { padding: 0 }).bounds).toEqual({
      x: 0,
      y: 0,
      width: 375,
      height: 130,
    });
    expect(lay(model(frame('ui', 'A')), { padding: '12' }).padding).toBe(12);
    const warnings: Warning[] = [];
    for (const padding of [-1, 'wide', 1e308, Infinity, Number.NaN, true]) {
      const l = lay(model(frame('ui', 'A')), { padding }, (w) => warnings.push(w));
      expect(l.padding).toBe(30);
    }
    expect(warnings.map((w) => [w.code, w.path])).toEqual(
      Array.from({ length: 6 }, () => [EVENTMODELING_CONFIG_INVALID, 'eventmodeling.padding'])
    );
    // The largest that keeps the bounds finite is taken.
    expect(lay(model(frame('ui', 'A')), { padding: 1e300 }).padding).toBe(1e300);
  });

  it('lays out an empty model as its padding alone', () => {
    const l = lay(model());
    expect([l.lanes, l.boxes, l.relations]).toEqual([[], [], []]);
    expect(l.bounds).toEqual({ x: -30, y: -30, width: 60, height: 60 });
  });
});
