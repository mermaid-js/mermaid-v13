import { beforeAll, describe, expect, it } from 'vitest';
import type { Warning } from '@mermaid-js/core';
import type { Theme } from '@mermaid-js/core/theme';
import { EVENTMODELING_CONFIG_INVALID } from '../codes.ts';
import { eventModelTestContext, eventModelTestTheme } from '../test-context.ts';
import { frame, halfEm, model } from './layout.fixtures.ts';
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

const round = (v: number) => Math.round(v * 100) / 100;

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

  it('loops a self relation under the bottom right corner, clear of the other anchors (D659)', () => {
    const l = lay(model(frame('evt', 'E'), frame('ui', 'A', { sources: ['01', '02'] })));
    const self = l.relations.find((r) => r.route === 'self');
    // A is at (280, 15), 100 × 100: the loop drops 25 at 350, crosses to 370, comes up there.
    expect(self?.points).toEqual([
      { x: 350, y: 115 },
      { x: 350, y: 140 },
      { x: 370, y: 140 },
      { x: 370, y: 115 },
    ]);
    expect(self?.head).toEqual([
      { x: 373.5, y: 125 },
      { x: 370, y: 115 },
      { x: 366.5, y: 125 },
    ]);
    // The relation up from E ends at ⅓ of A's width on its bottom; nothing else ends at the loop.
    const up = l.relations.find((r) => r.route === 'up');
    expect(up?.points[1]).toEqual({ x: 280 + 100 / 3, y: 115 });
    // A's lane grows to hold the loop, 15 under it; A keeps v12's top, and the lane below moves.
    expect(l.lanes.map((x) => [x.y, x.height])).toEqual([
      [0, 155],
      [165, 130],
    ]);
    expect(l.boxes.map((b) => b.y)).toEqual([180, 15]);
  });

  it('leaves a box with a self loop left of the loop, in target order (D743, D659)', () => {
    // A loops on itself and three relations leave its bottom; the loop's left leg is 30 in
    // from A's right edge.
    const l = lay(
      model(
        frame('ui', 'A', { sources: ['01'] }),
        frame('evt', 'B', { sources: ['01'] }),
        frame('evt', 'C', { sources: ['01'] }),
        frame('cmd', 'D', { sources: ['01'] })
      )
    );
    const a = l.boxes[0]!;
    const leg = a.x + a.width - 30;
    const self = l.relations.find((r) => r.route === 'self');
    expect(self?.points[0]?.x).toBe(leg);
    const down = l.relations.filter((r) => r.source === 0 && r.route !== 'self');
    expect(down).toHaveLength(3);
    const from = down.map((r) => r.points[0]!.x);
    for (const x of from) expect(x).toBeLessThan(leg);
    expect(new Set(from).size).toBe(3);
    // In the order of their targets, so no two cross.
    const byTarget = [...down].sort((p, q) => p.points.at(-1)!.x - q.points.at(-1)!.x);
    const xs = byTarget.map((r) => r.points[0]!.x);
    expect(xs).toEqual([...xs].sort((p, q) => p - q));
  });

  it('keeps every detour run inside the gap between its lanes (D743)', () => {
    // Fan-out (#1234): several detours share the gaps above the events lane.
    const l = lay(
      model(
        frame('cmd', 'Place'),
        frame('evt', 'P'),
        frame('rmo', 'Orders', { reset: true, sources: ['02'] }),
        frame('rmo', 'Stats', { reset: true, sources: ['02'] }),
        frame('pcr', 'Mailer', { reset: true, sources: ['02'] }),
        frame('pcr', 'Billing', { reset: true, sources: ['02'] }),
        frame('pcr', 'Audit', { reset: true, sources: ['02'] }),
        frame('ui', 'Screen', { reset: true, sources: ['02'] })
      )
    );
    const runs = l.relations.flatMap((r) =>
      r.points.slice(1).flatMap((q, k) => {
        const p = r.points[k]!;
        return p.y === q.y && p.x !== q.x && r.route !== 'self' && r.route !== 'under' ? [q.y] : [];
      })
    );
    expect(runs.length).toBeGreaterThan(0);
    const gaps = l.lanes.slice(1).map((lane, k): [number, number] => {
      const above = l.lanes[k]!;
      return [above.y + above.height, lane.y];
    });
    for (const y of runs) expect([y, gaps.some(([lo, hi]) => y > lo && y < hi)]).toEqual([y, true]);
  });

  it('keeps the segment of a relation no detour fits, and marks it (D743)', () => {
    // Two 440-wide read models fill the middle lane on both sides of E ->> U, beyond the reach
    // of any column.
    const long = 'x'.repeat(50);
    const l = lay(
      model(
        frame('rmo', long),
        frame('evt', 'E'),
        frame('ui', 'U'),
        frame('rmo', long, { reset: true })
      )
    );
    const r = l.relations.find((x) => x.id === 'relation:02->03');
    expect(r?.points).toHaveLength(2);
    expect(r?.noDetour).toBe(true);
    expect(l.relations.filter((x) => x.noDetour)).toHaveLength(1);
  });

  it('routes a relation that skips a box of its lane under the row (D659)', () => {
    const l = lay(
      model(
        frame('evt', 'A'),
        frame('evt', 'B', { sources: ['01'] }),
        frame('evt', 'C', { sources: ['01', '02'] }),
        frame('evt', 'D', { sources: ['01'] })
      )
    );
    const at = (id: string) => {
      const r = l.relations.find((x) => x.id === id);
      return [r?.route, r?.points.map((p) => [round(p.x), p.y])];
    };
    // Boxes at 250, 360, 470 and 580, 100 × 100 from y 15. Neighbours stay `along` (D521).
    expect(at('relation:01->02')).toEqual([
      'along',
      [
        [350, 65],
        [360, 65],
      ],
    ]);
    // 01 → 03 skips B: from A's bottom down to 25 under the boxes, across, up into C at ½.
    // 01 → 04 overlaps it, so it runs 10 lower; on A its leg is the outer one, left of the
    // other, so neither crosses the other's run. Both of A's ends lie between ⅓ and ⅔.
    expect(at('relation:01->03')).toEqual([
      'under',
      [
        [305.56, 115],
        [305.56, 140],
        [520, 140],
        [520, 115],
      ],
    ]);
    expect(at('relation:01->04')).toEqual([
      'under',
      [
        [294.44, 115],
        [294.44, 150],
        [630, 150],
        [630, 115],
      ],
    ]);
    // The head points up into the target's bottom.
    const r = l.relations.find((x) => x.id === 'relation:01->04');
    expect(r?.head[1]).toEqual({ x: 630, y: 115 });
    // The lane grows from 130 to the lowest channel and 15 under it; the boxes keep v12's top.
    expect(l.lanes.map((x) => x.height)).toEqual([165]);
    expect(l.boxes.map((b) => b.y)).toEqual([15, 15, 15, 15]);
  });

  // docs-008 (#1234): E, U (inferred from E), and a reset C ->> E between them in x.
  const resetting = model(
    frame('evt', 'E'),
    frame('ui', 'U'),
    frame('rmo', 'C', { reset: true, sources: ['01'] })
  );

  it('leaves a box from distinct points when relations leave the same side (D743)', () => {
    const l = lay(resetting);
    // E at (250, 295), U at (280, 15), C at (310, 155), each 100 × 100. Both relations leave E's
    // top; the one to the target further left first, at ⅔, the next ⅑ of the width right of it.
    const from = l.relations.map((r) => r.points[0]);
    expect(new Set(from.map((p) => p?.x)).size).toBe(2);
    const toC = l.relations.find((r) => r.id === 'relation:01->03');
    expect(toC?.points.map((p) => [round(p.x), p.y])).toEqual([
      [327.78, 295],
      [343.33, 255],
    ]);
  });

  it('takes a relation between lanes past an unrelated box it would meet (D743)', () => {
    const l = lay(resetting);
    // The straight segment from E to U runs inside C's left edge. It goes up 10 left of C
    // instead, where both E's top and U's bottom are, in one vertical segment.
    const toU = l.relations.find((r) => r.id === 'relation:01->02');
    expect(toU).toMatchObject({
      route: 'up',
      points: [
        { x: 300, y: 295 },
        { x: 300, y: 115 },
      ],
    });
  });

  it('jogs a detour between the lanes when no column reaches both boxes (D743)', () => {
    // Fan-out: P ->> Orders, Stats (the lane above), Mailer, Billing (the top lane).
    const l = lay(
      model(
        frame('cmd', 'Place'),
        frame('evt', 'P'),
        frame('rmo', 'Orders', { reset: true, sources: ['02'] }),
        frame('rmo', 'Stats', { reset: true, sources: ['02'] }),
        frame('pcr', 'Mailer', { reset: true, sources: ['02'] }),
        frame('pcr', 'Billing', { reset: true, sources: ['02'] })
      )
    );
    const fromP = l.relations.filter((r) => r.source === 1).map((r) => r.points[0]?.x);
    expect(new Set(fromP).size).toBe(4);
    // Mailer (500, 15) and Billing (610, 15) sit above Orders (360) and Stats (470): their
    // relations leave P's top, run right in the gap above the events lane, and go up clear of
    // Stats, into the target's bottom.
    for (const id of ['relation:02->05', 'relation:02->06']) {
      const r = l.relations.find((x) => x.id === id);
      expect(r?.points.length, id).toBe(4);
      const [, a, b] = r?.points ?? [];
      expect(a?.y, id).toBe(b?.y);
      expect(b?.x, id).toBeGreaterThanOrEqual(580);
    }
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

  it('expands tabs to the next 4-column tab stop, so tab indentation nests (D523)', () => {
    const text = '{\n\t"a": 1,\n\t  \t"b":\t2\n}';
    const data = lay(model(frame('cmd', 'A', { data: { text } }))).boxes[0]?.data;
    expect(data?.text.indents).toEqual([0, 32, 64, 0]);
    expect(
      data?.text.lines.map((line) => line.map((r) => r.text.replace(/\u00a0/g, ' ')).join(''))
    ).toEqual(['{', '"a": 1,', '"b":    2', '}']);
  });

  it('draws empty data as no data: no gap, no blank line', () => {
    const plain = lay(model(frame('cmd', 'A'))).boxes[0];
    const empty = lay(model(frame('cmd', 'A', { data: { text: '' } }))).boxes[0];
    expect(empty?.data).toBeUndefined();
    expect([empty?.width, empty?.height]).toEqual([plain?.width, plain?.height]);
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
