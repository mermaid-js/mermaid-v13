import { beforeAll, describe, expect, it } from 'vitest';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { cellMeasurer } from '@mermaid-js/core/ascii';
import { cellProfile, pxProfile, type UnitProfile } from '@mermaid-js/core/layout';
import { tableMeasurer, type Measurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type ThemeSpec } from '@mermaid-js/core/theme';
import type { SequenceModel } from '../model.ts';
import { FIXTURES, hello } from './fixtures.ts';
import { layoutSequence, sequenceLayoutViolations, type SequenceLayout } from './index.ts';

let spec: ThemeSpec;
beforeAll(async () => {
  spec = await loadTheme('redux');
});

const PROFILES: [string, UnitProfile, Measurer][] = [
  ['px', pxProfile, tableMeasurer],
  ['cell', cellProfile(), cellMeasurer],
];

// Every option the layout reads, set away from its default.
const VARIANT = {
  mirrorActors: false,
  rightAngles: true,
  messageAlign: 'left',
  noteAlign: 'right',
  wrap: true,
  hideUnusedParticipants: true,
  showSequenceNumbers: true,
  actorMargin: 80,
  boxMargin: 15,
  activationWidth: 14,
  width: 120,
  height: 50,
  noteMargin: 12,
} as const;

function lay(
  model: SequenceModel,
  units: UnitProfile = pxProfile,
  measurer: Measurer = tableMeasurer,
  sequence: Record<string, unknown> = {}
): SequenceLayout {
  return layoutSequence(model, {
    config: { sequence } as ResolvedConfig,
    measurer,
    units,
    theme: createTheme(spec, {}),
    warn: () => {},
  });
}

describe('sequence layout invariants', () => {
  for (const [unit, units, measurer] of PROFILES) {
    for (const [config, sequence] of [
      ['default config', {}],
      ['every option changed', VARIANT],
    ] as const) {
      for (const [name, model] of Object.entries(FIXTURES)) {
        it(`${name}, ${unit}, ${config}`, () => {
          const layout = lay(model, units, measurer, sequence);
          expect(sequenceLayoutViolations(model, layout)).toEqual([]);
          expect(layout.units).toBe(unit);
        });
      }
    }
  }

  it('cell layouts land on whole cells', () => {
    for (const [name, model] of Object.entries(FIXTURES)) {
      const stray: string[] = [];
      const walk = (v: unknown, path: string): void => {
        if (typeof v === 'number' && !Number.isInteger(v)) stray.push(`${path}=${v}`);
        else if (v && typeof v === 'object')
          for (const [k, x] of Object.entries(v)) if (k !== 'text') walk(x, `${path}.${k}`);
      };
      walk(lay(model, cellProfile(), cellMeasurer), name);
      expect(stray).toEqual([]);
    }
  });

  it('catches a broken layout', () => {
    const model = FIXTURES.fragments!;
    const good = lay(model);
    const [frame] = good.fragments;
    const [first] = good.messages;
    const broken: SequenceLayout = {
      ...good,
      fragments: [{ ...frame!, width: 1 }, ...good.fragments.slice(1)],
      messages: [{ ...first!, y: NaN }, ...good.messages.slice(1)],
      notes: good.notes.map((n) => ({ ...n, y: 0 })),
    };
    const found = sequenceLayoutViolations(model, broken);
    expect(found).toContain('layout.messages[0].y is NaN');
    expect(found.some((v) => v.startsWith(`frame ${frame!.ast} does not contain`))).toBe(true);
    expect(found.some((v) => v.includes(' overlaps the box of '))).toBe(true);
  });
});

describe('sequence layout in px follows v12', () => {
  it('places two participants and a message as v12 does', () => {
    const l = lay(hello);
    const [a, b] = l.participants;
    // v12: width 150 and height 65 boxes, actorMargin 50 between them.
    expect([a!.x, a!.width, a!.height, a!.top]).toEqual([0, 150, 65, 0]);
    expect([b!.x, b!.lifeline.x]).toEqual([200, 275]);
    const [m] = l.messages;
    // The line starts 1 off A's lifeline and stops 1 + 3 (arrowhead) short of B's.
    expect([m!.startX, m!.stopX]).toEqual([76, 271]);
    // v12 puts the line at the row top + 10 + one line + the text height - 10 + boxMargin.
    expect(m!.y - 2 * m!.label!.text.lineHeight).toBeCloseTo(65 + 10);
    expect(m!.label!.y).toBe(75);
    // Mirrored boxes start two boxMargins below the last row; the viewBox is v12's.
    expect(b!.bottom).toBe(m!.y + 20);
    expect([l.bounds.x, l.bounds.width]).toEqual([-50, 450]);
    expect(l.bounds.y).toBe(-10);
    expect(l.bounds.height).toBe(b!.bottom! + 65 + 10 + 2 * 10 - 10 + 1);
  });

  it('widens the gap to hold a long message between neighbours', () => {
    const l = lay(FIXTURES.messagesAndNotes!);
    const [alice, john] = l.participants;
    const [first] = l.messages;
    const need = first!.label!.width + 2 * 10;
    expect(john!.lifeline.x - alice!.lifeline.x).toBeGreaterThanOrEqual(need);
  });

  it('stacks activations half a bar to the right per level', () => {
    const l = lay(FIXTURES.activations!);
    const onC = l.activations.filter((a) => a.participant === 'C');
    const c = l.participants.find((p) => p.id === 'C')!.lifeline.x;
    expect(onC.map((a) => [a.depth, a.x - c])).toEqual(
      expect.arrayContaining([
        [0, -5],
        [1, 0],
        [2, 5],
      ])
    );
  });

  it('honours config in px and converts it to cells', () => {
    const px = lay(hello, pxProfile, tableMeasurer, { actorMargin: 80, width: 120 });
    expect(px.participants[1]!.x).toBe(200);
    const cells = lay(hello, cellProfile(), cellMeasurer, { actorMargin: 80, width: 120 });
    // 120 / 8 = 15 cells, 80 / 8 = 10 cells.
    expect(cells.participants.map((p) => [p.x, p.width])).toEqual([
      [0, 15],
      [25, 15],
    ]);
  });

  it('lays out text in cells with the cell metrics', () => {
    const l = lay(hello, cellProfile(), cellMeasurer);
    const [a, b] = l.participants;
    // A box fits its label and a space and border each side: 1 + 2 · 2 = 5. B starts the
    // message's room (`Hello` + 2 · 2 = 9) plus actorMargin 6 past A's lifeline, less half
    // of each box: 5 + 9 + 6 − 2 − 2 = 16.
    expect([a!.width, a!.height, b!.x]).toEqual([5, 3, 16]);
    const [m] = l.messages;
    // The label sits on the row below the boxes and the line right under it, from the cell
    // after A's lifeline (2) to the cell before B's (18), the label centred: 3 + ⌊(14 − 5) / 2⌋.
    expect([m!.label!.y, m!.y, m!.startX, m!.stopX, m!.label!.x]).toEqual([4, 5, 3, 17, 7]);
  });

  it('hides participants no statement names', () => {
    const l = lay(FIXTURES.numbersAndWrap!, pxProfile, tableMeasurer, {
      hideUnusedParticipants: true,
    });
    expect(l.participants.map((p) => p.id)).toEqual(['A', 'B']);
  });

  it('numbers messages from autonumber until it is turned off', () => {
    const l = lay(FIXTURES.numbersAndWrap!);
    expect(l.messages.map((m) => m.number?.value)).toEqual([10, 15, undefined, undefined]);
  });
});
