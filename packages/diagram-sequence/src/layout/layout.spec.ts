import type { DiagramPlugin } from '@mermaid-js/core';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { cellMeasurer } from '@mermaid-js/core/ascii';
import { cellProfile, pxProfile, type UnitProfile } from '@mermaid-js/core/layout';
import { tableMeasurer, type Measurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type ThemeSpec } from '@mermaid-js/core/theme';
import type { SequenceModel } from '../model.ts';
import { FIXTURES, frag, hello, model as modelOf, msg, note, p as part } from './fixtures.ts';
import { fontsOf } from './env.ts';
import { layoutSequence, type SequenceLayout } from './index.ts';
import { sequenceLayoutViolations } from './invariants.ts';
import { sequence as diagramPlugin } from '../plugin.ts';

/** The diagram's own theme table (D331), passed to `createTheme` as the pipeline does. */
const { theme: diagramTheme }: Pick<DiagramPlugin, 'id' | 'theme'> = diagramPlugin;

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
    theme: createTheme(specs.get(theme)!, { diagram: diagramTheme, themeVariables }),
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
            expect(sequenceLayoutViolations(model, layout, { sequence })).toEqual([]);
            expect(layout.units).toBe(unit);
          });
        }
      }
    }

  it('cell layouts ignore the geometry theme variables: text draws symbols as boxes', () => {
    const vars = {
      actorGlyphBand: 100,
      messageEndGap: 9,
      labelBoxExtraHeight: 20,
      actorFooterPadding: 50,
    };
    for (const [name, model] of Object.entries(FIXTURES)) {
      const set = lay(model, cellProfile(), cellMeasurer, {}, 'default', vars);
      expect(set, name).toEqual(lay(model, cellProfile(), cellMeasurer, {}, 'default'));
    }
  });

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
    const found = sequenceLayoutViolations(model, broken, {});
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
    // Its baseline sits 1 em less half the wrap padding above the line (#1237, D723).
    expect(m!.y - m!.label!.y - m!.label!.text.baseline).toBeCloseTo(16 - 5);
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

describe('message label height above its line (#1237, D723)', () => {
  // mermaid 12.2.0 (the conformance oracle's dist) in Chromium at 16 px: the last line's
  // alphabetic baseline sits 10.81 px above the message line in `default` (6.81 px from its
  // glyph box) and 10.86 px in `redux`, for every arrow and a curved self message; 0.81 px for a
  // self message with `rightAngles`, whose line v12 draws a boxMargin higher. v13's `redux`
  // draws messages at 14 px, so it is measured here at v12's 16.
  const V12_GAP: Readonly<Record<ThemeName, number>> = { default: 10.81, redux: 10.86 };
  const AT_16 = { fontSize: '16px' };
  const lastBaseline = (l: SequenceLayout['messages'][number]): number => {
    const t = l.label!.text;
    const n = t.lines.length;
    return l.label!.y + (t.baselines?.[n - 1] ?? (n - 1) * t.lineHeight + t.baseline);
  };
  const ARROWS = [
    ['solid', msg('A', 'B', 'Hello John, how are you?', 'solid')],
    ['dotted', msg('B', 'A', 'Great, thanks!', 'dotted')],
    ['async', msg('A', 'B', 'See you later!', 'solid_point')],
    ['self', msg('B', 'B', 'self message', 'solid')],
  ] as const;

  for (const theme of THEMES)
    for (const lines of ['one line', 'two lines'] as const)
      for (const [kind, m] of ARROWS)
        it(`${kind}, ${lines}, ${theme}: v12's gap, within 1 px`, () => {
          const text = lines === 'one line' ? m.text : m.text.replace(' ', '<br>');
          const model = modelOf([part('A'), part('B')], [{ ...m, text }]);
          const l = lay(model, pxProfile, tableMeasurer, {}, theme, AT_16);
          const [placed] = l.messages;
          expect(placed!.label!.text.lines).toHaveLength(lines === 'one line' ? 1 : 2);
          const gap = placed!.y - lastBaseline(placed!);
          expect(Math.abs(gap - V12_GAP[theme])).toBeLessThanOrEqual(1);
        });

  it('a self message with rightAngles ends its label on the line, not through it', () => {
    // v12's last baseline sat 0.81 px above the square loop's top, which struck the descenders
    // through. v13 lifts the label until its box ends on the line (#1337 review): the last
    // baseline then sits the font's descent above it.
    const descent: Readonly<Record<ThemeName, number>> = { default: 3.552, redux: 3.92 };
    for (const theme of THEMES) {
      const model = modelOf([part('A')], [msg('A', 'A', 'self')]);
      const l = lay(model, pxProfile, tableMeasurer, { rightAngles: true }, theme, AT_16);
      const [placed] = l.messages;
      const label = placed!.label!;
      expect(label.y + label.height, theme).toBeCloseTo(placed!.y, 6);
      expect(placed!.y - lastBaseline(placed!), theme).toBeCloseTo(descent[theme], 3);
    }
  });

  it('leaves cells as they were: the label on the row above its line', () => {
    const l = lay(hello, cellProfile(), cellMeasurer);
    const [m] = l.messages;
    expect([m!.label!.y, m!.y]).toEqual([4, 5]);
  });
});

describe('frame title and section label height (#1238, D723)', () => {
  // mermaid 12.2.0 (the conformance oracle's dist) in Chromium at 16 px: the first line's glyph
  // box is centred 12.5 px below the frame's top line (or the section's dashed line) in
  // `default` and 12.59 px in `redux`, for every fragment kind, nested or not. v13's `redux`
  // draws messages at 14 px, so it is measured here at v12's 16.
  const V12_CENTRE: Readonly<Record<ThemeName, number>> = { default: 12.5, redux: 12.59 };
  const AT_16 = { fontSize: '16px' };
  const two = [msg('A', 'B', 'one')];
  const KINDS = [
    ['loop', frag('loop', ['Every minute', two])],
    ['alt/else', frag('alt', ['is sick', two], ['is well', two], ['other', two])],
    ['opt', frag('opt', ['Extra response', two])],
    ['par/and', frag('par', ['Alice to Bob', two], ['Alice to John', two])],
    ['critical/option', frag('critical', ['Connect', two], ['Timeout', two], ['Rejected', two])],
    ['break', frag('break', ['when the booking fails', two])],
    [
      'nested',
      frag(
        'par',
        ['Alice to Bob', two],
        ['Alice to John', [frag('par', ['John to Charlie', two], ['John to Diana', two])]]
      ),
    ],
  ] as const;
  /** Each title's and section label's first-line centre, below the line it hangs from. */
  const centres = (l: SequenceLayout): number[] =>
    l.fragments.flatMap((f) => [
      ...(f.title ? [f.title.y + f.title.text.lineHeight / 2 - f.y] : []),
      ...f.sections.flatMap((s) =>
        s.label ? [s.label.y + s.label.text.lineHeight / 2 - s.y] : []
      ),
    ]);

  for (const theme of THEMES)
    for (const [kind, statement] of KINDS)
      it(`${kind}, ${theme}: v12's centre, within 1 px`, () => {
        const model = modelOf([part('A'), part('B')], [statement]);
        const l = lay(model, pxProfile, tableMeasurer, {}, theme, AT_16);
        const found = centres(l);
        expect(found.length).toBeGreaterThan(0);
        for (const c of found) expect(Math.abs(c - V12_CENTRE[theme])).toBeLessThanOrEqual(1);
      });

  it('never lifts a title above its frame or a section label above its line', () => {
    const model = modelOf([part('A'), part('B')], [KINDS[1][1]]);
    const l = lay(model, pxProfile, tableMeasurer, {}, 'default', { fontSize: '40px' });
    for (const f of l.fragments) {
      expect(f.title!.y).toBeGreaterThanOrEqual(f.y);
      for (const s of f.sections) expect(s.label!.y).toBeGreaterThanOrEqual(s.y);
    }
  });

  it('keeps every frame, tab, section line and the diagram height where they were', () => {
    // Pinned before #1238 moved the text: `y+height tab [section lines]` per frame.
    const r = (v: number): string => v.toFixed(2);
    const pins = THEMES.map((theme) => {
      const l = lay(FIXTURES.fragments!, pxProfile, tableMeasurer, {}, theme);
      const frames = l.fragments.map(
        (f) =>
          `${r(f.y)}+${r(f.height)} ${f.tab.height} [${f.sections.map((s) => r(s.y)).join(',')}]`
      );
      return `${theme} ${r(l.bounds.height)}: ${frames.join(', ')}`;
    });
    expect(pins).toMatchInlineSnapshot(`
      [
        "redux 1480.50: 82.10+388.80 35 [], 169.30+291.60 35 [261.50,429.80], 343.70+71.10 35 [], 480.90+276.60 35 [573.10,732.50], 767.50+234.40 35 [859.70], 1011.90+87.20 35 [], 1109.10+35.00 35 [], 1220.20+87.20 35 []",
        "default 1478.25: 75.00+408.61 20 [], 167.15+306.46 20 [264.30,440.03], 351.46+73.58 20 [], 493.61+291.46 20 [590.76,760.06], 795.06+244.30 20 [892.22], 1049.37+92.15 20 [], 1151.52+20.00 20 [], 1250.10+92.15 20 []",
      ]
    `);
  });

  it('leaves cells as they were', () => {
    const l = lay(FIXTURES.fragments!, cellProfile(), cellMeasurer);
    const labels = l.fragments.map((f) => [f.title?.y, f.sections.map((s) => s.label?.y)]);
    expect(labels).toMatchInlineSnapshot(`
      [
        [
          5,
          [],
        ],
        [
          10,
          [
            15,
            27,
          ],
        ],
        [
          undefined,
          [],
        ],
        [
          31,
          [
            36,
            undefined,
          ],
        ],
        [
          47,
          [
            52,
          ],
        ],
        [
          60,
          [],
        ],
        [
          undefined,
          [],
        ],
        [
          74,
          [],
        ],
      ]
    `);
  });
});

describe('frame title clear of its tab (#1361, D734)', () => {
  // The docs' `critical` example, from #1361: the self message widens the title's reach, so
  // the frame is as wide as its title and tab need.
  const KEYWORDS = ['loop', 'alt', 'opt', 'par', 'critical', 'break'] as const;
  const repro = (keyword: (typeof KEYWORDS)[number]): SequenceModel =>
    modelOf(
      [part('Service'), part('DB')],
      [
        frag(
          keyword,
          ['Establish a connection to the DB', [msg('Service', 'DB', 'connect')]],
          ['Network timeout', [msg('Service', 'Service', 'Log error')]]
        ),
      ]
    );

  for (const theme of THEMES)
    for (const keyword of KEYWORDS)
      it(`${keyword}, ${theme}: the title starts right of the tab`, () => {
        const model = repro(keyword);
        const l = lay(model, pxProfile, tableMeasurer, {}, theme);
        expect(sequenceLayoutViolations(model, l, {})).toEqual([]);
        const [f] = l.fragments;
        expect(f!.title!.x).toBeGreaterThanOrEqual(f!.tab.x + f!.tab.width - 1e-9);
      });

  it('grows the frame by no more than the tab is wider than labelBoxWidth', () => {
    // At 16 px `critical` needs a tab wider than 50 px; `loop` does not, and its frame is v12's.
    const frame = (keyword: 'loop' | 'critical') =>
      lay(repro(keyword), pxProfile, tableMeasurer, {}, 'default').fragments[0]!;
    const loop = frame('loop');
    const critical = frame('critical');
    expect([loop.x, loop.width, loop.tab.width]).toEqual([-9, 295, 50]);
    expect(critical.tab.width).toBeGreaterThan(50);
    expect(critical.width).toBeGreaterThan(loop.width);
    expect(critical.width - loop.width).toBeLessThanOrEqual(critical.tab.width - 50);
  });

  it('keeps cells as they were: the keyword is on the border, the title below it', () => {
    const l = lay(repro('critical'), cellProfile(), cellMeasurer);
    const [f] = l.fragments;
    expect([f!.x, f!.width, f!.title!.x, f!.title!.y]).toMatchInlineSnapshot(`
      [
        -1,
        44,
        7,
        5,
      ]
    `);
  });
});

describe('the top-level fontSize (D620, #765)', () => {
  const withNote = modelOf(
    [part('A'), part('B')],
    [msg('A', 'B', 'Hello'), note('over', ['A', 'B'], 'a note')]
  );
  const ctxOf = (root: Partial<ResolvedConfig>, sequence: Record<string, unknown> = {}) => ({
    config: { ...root, sequence } as ResolvedConfig,
    theme: createTheme(specs.get('default')!, { diagram: diagramTheme }),
  });
  const layRoot = (root: Partial<ResolvedConfig>, sequence: Record<string, unknown> = {}) =>
    layoutSequence(withNote, {
      ...ctxOf(root, sequence),
      measurer: tableMeasurer,
      units: pxProfile,
      warn: () => {},
    });
  const sizes = (root: Partial<ResolvedConfig>, sequence: Record<string, unknown> = {}) => {
    const f = fontsOf(ctxOf(root, sequence));
    return [f.actor.size, f.message.size, f.note.size, f.title.size];
  };

  it('sizes actor, message and note text when no per-key size is set; the title keeps the theme size', () => {
    expect(sizes({})).toEqual([16, 16, 16, 16]);
    expect(sizes({ fontSize: 24 })).toEqual([24, 24, 24, 16]);
    expect(layRoot({ fontSize: 24 })).toEqual(
      layRoot({}, { actorFontSize: 24, messageFontSize: 24, noteFontSize: 24 })
    );
    expect(layRoot({ fontSize: 24 }).bounds.height).toBeGreaterThan(layRoot({}).bounds.height);
  });

  it('gives way to a set sequence.*FontSize key', () => {
    expect(sizes({ fontSize: 24 }, { messageFontSize: 12 })).toEqual([24, 12, 24, 16]);
  });

  it('reads a CSS length as the per-key keys do, and ignores a value that is no size', () => {
    expect(sizes({ fontSize: '24px' as unknown as number })).toEqual([24, 24, 24, 16]);
    expect(sizes({ fontSize: 'big' as unknown as number })).toEqual([16, 16, 16, 16]);
    expect(sizes({ fontSize: 0 })).toEqual([16, 16, 16, 16]);
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
      if (GLYPHS.has(p.kind)) {
        // Header: anchored at the lifeline, growing up; footer: anchored at it, growing down.
        expect(p.band!.top, p.id).toBe(p.height - GAP - h - GAP);
        expect(p.labelY, p.id).toBe(p.height - GAP - h / 2);
        expect(p.band!.bottom, p.id).toBe(GAP + BAND);
        expect(p.bottomLabelY, p.id).toBe(GAP + BAND + GAP + h / 2);
      } else if (p.kind === 'collections') {
        // Both rects are 6 shorter, the label centred in the front one.
        expect(p.band, p.id).toBeUndefined();
        expect(p.stackInset, p.id).toBe(6);
        expect(p.labelY, p.id).toBe(6 + (p.height - 6) / 2);
      } else {
        expect(p.band, p.id).toBeUndefined();
        expect(p.labelY, p.id).toBe(p.height / 2);
      }
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
  // Every kind, one-, two- and three-line labels, created and destroyed participants.
  const SYMBOLS = modelOf(
    [
      part('P'),
      part('U', 'actor', { label: 'one<br/>two<br/>three' }),
      part('W', 'boundary', { label: 'one<br/>two' }),
      part('S', 'control'),
      part('E', 'entity', { label: 'a<br/>b' }),
      part('D', 'database', { label: 'Data<br/>base' }),
      part('L', 'collections', { createdBy: 'm:mk' }),
      part('Q', 'queue', { destroyedBy: 'm:rm' }),
    ],
    [
      msg('P', 'U', 'hi'),
      { ...msg('S', 'L', 'make'), ast: 'm:mk' },
      { ...msg('Q', 'S', 'gone'), ast: 'm:rm' },
      msg('D', 'E', 'q'),
    ]
  );

  it('holds the invariants for any band, with multi-line labels', () => {
    const models = { ...FIXTURES, symbols: SYMBOLS };
    for (const band of [1, 10, 20, 44, 100])
      for (const sequence of [{}, VARIANT])
        for (const [name, m] of Object.entries(models)) {
          const l = lay(m, pxProfile, tableMeasurer, sequence, 'redux', { actorGlyphBand: band });
          expect(sequenceLayoutViolations(m, l, { sequence }), `${name}, band ${band}`).toEqual([]);
        }
  });

  it('puts a band only on the kinds that stand on it', () => {
    const l = neo(SYMBOLS);
    const on = l.participants.filter((p) => p.band !== undefined).map((p) => p.kind);
    expect(on.sort()).toEqual(['actor', 'boundary', 'control', 'database', 'entity']);
  });

  it('catches a symbol or label off its band and a lifeline inside its row', () => {
    const good = neo(SYMBOLS);
    expect(sequenceLayoutViolations(SYMBOLS, good, {})).toEqual([]);
    const u = good.participants.findIndex((p) => p.id === 'U');
    const p = good.participants[u]!;
    const broken = (q: Partial<typeof p>): string[] => {
      const participants = [...good.participants];
      participants[u] = { ...p, ...q };
      return sequenceLayoutViolations(SYMBOLS, { ...good, participants }, {});
    };
    expect(broken({ band: { ...p.band!, top: p.height + 1 } })).toContain(
      'the top glyph band of U leaves its row'
    );
    expect(broken({ labelY: p.band!.top })).toContain('the top label of U overlaps its symbol');
    expect(broken({ bottomLabelY: p.height })).toContain('the bottom label of U leaves its row');
    expect(broken({ band: { ...p.band!, bottom: 0 } })).toContain(
      'the bottom glyph band of U leaves its row'
    );
    expect(broken({ lifeline: { ...p.lifeline, y1: p.top + p.height - 1 } })).toContain(
      'the lifeline of U starts inside its row'
    );
  });
});
