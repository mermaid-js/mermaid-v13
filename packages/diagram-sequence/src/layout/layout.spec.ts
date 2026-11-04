import { beforeAll, describe, expect, it } from 'vitest';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { cellMeasurer } from '@mermaid-js/core/ascii';
import { cellProfile, pxProfile, type UnitProfile } from '@mermaid-js/core/layout';
import { tableMeasurer, type Measurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type ThemeSpec } from '@mermaid-js/core/theme';
import type { SequenceModel } from '../model.ts';
import { FIXTURES, hello } from './fixtures.ts';
import { layoutSequence, sequenceLayoutViolations, type SequenceLayout } from './index.ts';

// The two geometry sets (D152, #194): `redux` carries v12 `look: neo`, `default` v12 classic.
const THEMES = ['redux', 'default'] as const;
type ThemeName = (typeof THEMES)[number];
const specs = new Map<ThemeName, ThemeSpec>();
beforeAll(async () => {
  for (const name of THEMES) specs.set(name, await loadTheme(name));
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
  sequence: Record<string, unknown> = {},
  theme: ThemeName = 'default',
  themeVariables: Record<string, unknown> = {}
): SequenceLayout {
  return layoutSequence(model, {
    config: { sequence } as ResolvedConfig,
    measurer,
    units,
    theme: createTheme(specs.get(theme)!, { themeVariables }),
    warn: () => {},
  });
}

describe('sequence layout invariants', () => {
  for (const theme of THEMES)
    for (const [unit, units, measurer] of PROFILES) {
      for (const [config, sequence] of [
        ['default config', {}],
        ['every option changed', VARIANT],
      ] as const) {
        for (const [name, model] of Object.entries(FIXTURES)) {
          it(`${name}, ${theme}, ${unit}, ${config}`, () => {
            const layout = lay(model, units, measurer, sequence, theme);
            expect(sequenceLayoutViolations(model, layout)).toEqual([]);
            expect(layout.units).toBe(unit);
          });
        }
      }
    }

  it('cell layouts land on whole cells, and are the same in every theme', () => {
    for (const [name, model] of Object.entries(FIXTURES)) {
      const neo = lay(model, cellProfile(), cellMeasurer, {}, 'redux');
      expect(neo, name).toEqual(lay(model, cellProfile(), cellMeasurer, {}, 'default'));
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
    expect([a!.width, a!.height, b!.x]).toEqual([19, 3, 25]);
    const [m] = l.messages;
    // The label sits on the row below the boxes and the line right under it.
    expect([m!.label!.y, m!.y, m!.startX, m!.stopX]).toEqual([4, 5, 10, 33]);
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

describe('sequence layout in px with v12 neo geometry (redux themes, #194)', () => {
  const neo = (model: SequenceModel, vars: Record<string, unknown> = {}): SequenceLayout =>
    lay(model, pxProfile, tableMeasurer, {}, 'redux', vars);
  const OFF = {
    actorGlyphBand: 0,
    messageEndGap: 0,
    labelBoxExtraHeight: 0,
    actorFooterPadding: 0,
  };
  const NEO = {
    actorGlyphBand: 44,
    messageEndGap: 3,
    labelBoxExtraHeight: 15,
    actorFooterPadding: 30,
  };
  // The same theme with v12 classic geometry: the fonts stay those of `redux`.
  const classic = (model: SequenceModel): SequenceLayout => neo(model, OFF);
  // v12 `actorBands.ts`: glyph band 44, 6 above the label, 6 above the lifeline.
  const BAND = 44;
  const GAP = 6;
  const GLYPHS = new Set(['actor', 'boundary', 'control', 'entity', 'database']);

  it('makes every row as tall as the tallest band stack and starts lifelines at its bottom', () => {
    const l = neo(FIXTURES.lifecycle!);
    const text = Math.max(...l.participants.map((p) => p.label.height));
    for (const p of l.participants) {
      expect(p.height, p.id).toBe(Math.max(65, BAND + GAP + text + GAP));
      expect(p.lifeline.y1, p.id).toBe(p.top + p.height);
    }
  });

  it('stands each symbol on the band with its label under it, top and bottom', () => {
    const l = neo(FIXTURES.lifecycle!);
    for (const p of l.participants) {
      const h = p.label.height;
      expect(p.band, p.id).toBeDefined();
      if (GLYPHS.has(p.kind)) {
        // Header: anchored at the lifeline, growing up; footer: anchored at it, growing down.
        expect(p.band!.top, p.id).toBe(p.height - GAP - h - GAP);
        expect(p.labelY, p.id).toBe(p.height - GAP - h / 2);
        expect(p.band!.bottom, p.id).toBe(GAP + BAND);
        expect(p.bottomLabelY, p.id).toBe(GAP + BAND + GAP + h / 2);
      } else if (p.kind === 'collections') {
        // Both rects are 6 shorter, the label centred in the front one.
        expect(p.band!.inset, p.id).toBe(6);
        expect(p.labelY, p.id).toBe(6 + (p.height - 6) / 2);
      } else expect(p.labelY, p.id).toBe(p.height / 2);
    }
    expect(classic(FIXTURES.lifecycle!).participants.every((p) => p.band === undefined)).toBe(true);
  });

  it('stops every message but `->` 3 px further short, and starts a bidirectional one 3 in', () => {
    const n = neo(FIXTURES.arrows!).messages;
    const c = classic(FIXTURES.arrows!).messages;
    n.forEach((m, i) => {
      const toward = m.from === 'A' ? -1 : 1;
      const k = c[i]!;
      expect(m.stopX - k.stopX, m.arrow).toBe(m.arrow === 'solid_open' ? 0 : 3 * toward);
      const bidi = m.arrow.startsWith('bidirectional');
      expect(m.startX - k.startX, m.arrow).toBe(bidi ? -3 * toward : 0);
    });
    // v12 neo `hello`: 76 to 271 - 3.
    expect([n[0]!.startX, neo(hello).messages[0]!.stopX]).toEqual([c[0]!.startX, 268]);
  });

  it('draws fragment label tabs 15 px taller', () => {
    const n = neo(FIXTURES.fragments!).fragments;
    const c = classic(FIXTURES.fragments!).fragments;
    expect(n.map((f) => f.tab.height)).toEqual(c.map((f) => f.tab.height + 15));
  });

  it('adds 30 px below a drawing with participants, and none to an empty one', () => {
    const l = neo(hello);
    const b = l.participants[1]!;
    // The classic viewBox ends boxMargin + bottomMarginAdj below the boxes (v12).
    expect(l.bounds.y + l.bounds.height).toBeCloseTo(b.bottom! + b.height + 10 + 1 + 30);
    expect(neo(FIXTURES.empty!).bounds).toEqual(classic(FIXTURES.empty!).bounds);
  });

  it('follows the geometry theme variables, not the theme name', () => {
    const font = { fontFamily: 'Arial', fontSize: 16 };
    const asNeo = lay(FIXTURES.lifecycle!, pxProfile, tableMeasurer, {}, 'default', {
      ...NEO,
      ...font,
    });
    expect(asNeo).toEqual(neo(FIXTURES.lifecycle!, font));
    const asClassic = lay(FIXTURES.lifecycle!, pxProfile, tableMeasurer, {}, 'default', font);
    expect(neo(FIXTURES.lifecycle!, { ...OFF, ...font })).toEqual(asClassic);
    expect(lay(hello).participants[0]!.height).toBe(65);
  });
});
