import { beforeAll, describe, expect, it } from 'vitest';
import type { DiagramPlugin, Warning } from '@mermaid-js/core';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { cellMeasurer } from '@mermaid-js/core/ascii';
import { cellProfile, pxProfile } from '@mermaid-js/core/layout';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type ThemeSpec } from '@mermaid-js/core/theme';
import type { SequenceModel, SequenceStatement } from '../model.ts';
import { FIXTURES, act, frag, model, msg, note, p } from './fixtures.ts';
import { layoutSequence, type SequenceLayout } from './index.ts';
import { sequenceLayoutViolations } from './invariants.ts';
import { sequence as diagramPlugin } from '../plugin.ts';

/** The diagram's own theme table (D331), passed to `createTheme` as the pipeline does. */
const { theme: diagramTheme }: Pick<DiagramPlugin, 'id' | 'theme'> = diagramPlugin;

// Inputs from the #141 review and its config fuzz, each of which broke an invariant.

// `redux` carries v12 neo geometry, `default` v12 classic (#194).
let spec: ThemeSpec;
let classicSpec: ThemeSpec;
beforeAll(async () => {
  spec = await loadTheme('redux');
  classicSpec = await loadTheme('default');
});

function lay(
  m: SequenceModel,
  cell = false,
  sequence: Record<string, unknown> = {},
  warnings: Warning[] = [],
  theme: { classic?: boolean; vars?: Record<string, unknown> } = {}
): SequenceLayout {
  return layoutSequence(m, {
    config: { sequence } as ResolvedConfig,
    measurer: cell ? cellMeasurer : tableMeasurer,
    units: cell ? cellProfile() : pxProfile,
    theme: createTheme(theme.classic ? classicSpec : spec, {
      diagram: diagramTheme,
      themeVariables: theme.vars ?? {},
    }),
    warn: (w) => warnings.push(w),
  });
}

const violations = (
  m: SequenceModel,
  cell = false,
  sequence: Record<string, unknown> = {},
  theme: Parameters<typeof lay>[4] = {}
) => sequenceLayoutViolations(m, lay(m, cell, sequence, [], theme), { sequence });

describe('sequence layout, review regressions', () => {
  it('a box centred on a destroying message clears the row above', () => {
    for (const [cell, lines] of [
      [false, 6],
      [true, 4],
    ] as const) {
      const label = Array.from({ length: lines }, (_, i) => `l${i}`).join('<br>');
      const m = model(
        [p('A'), p('B', 'participant', { label, destroyedBy: 'm:B>A#d' })],
        [note('over', ['B'], 'n'), { ...msg('B', 'A', 'bye'), ast: 'm:B>A#d' }]
      );
      expect(violations(m, cell)).toEqual([]);
    }
    expect(violations(FIXTURES.lifecycle!, false, { height: 98 })).toEqual([]);
  });

  it('a frame holds a message label wider than its line', () => {
    const long = 'a very very long message label that is much wider than the span of the columns';
    const m = model([p('A'), p('B'), p('C')], [frag('loop', ['L', [msg('A', 'C', long)]])]);
    expect(violations(m)).toEqual([]);
    const l = lay(m);
    const [f] = l.fragments;
    expect(l.messages[0]!.label!.x).toBeGreaterThanOrEqual(f!.x);
  });

  it('a frame holds its title when the title cannot wrap', () => {
    const word = 'averyveryveryveryveryverylongunbreakabletitleword';
    const m = model([p('A'), p('B'), p('C')], [frag('loop', [word, [msg('A', 'B', 'x')]])]);
    expect(violations(m)).toEqual([]);
    expect(violations(m, true)).toEqual([]);
  });

  it('a frame holds a self loop that reaches past a narrow width', () => {
    const m = model([p('A'), p('B')], [frag('loop', ['', [msg('B', 'B', 'x')]])]);
    expect(violations(m, false, { width: 80 })).toEqual([]);
    expect(violations(m, false, { width: 58, wrap: true })).toEqual([]);
  });

  it('leaves out a statement naming an undeclared participant, with a warning', () => {
    const m = model(
      [p('A')],
      [
        { kind: 'autonumber', ast: 'st:n', visible: true },
        msg('A', 'Z', 'x'),
        note('over', ['A', 'Z'], 'n'),
        msg('A', 'A', 'numbered after the gap'),
      ]
    );
    const warnings: Warning[] = [];
    const l = lay(m, false, {}, warnings);
    expect(warnings.map((w) => [w.code, w.astIds])).toEqual([
      ['SEQUENCE_UNKNOWN_PARTICIPANT', [m.statements[1]!.ast]],
      ['SEQUENCE_UNKNOWN_PARTICIPANT', [m.statements[2]!.ast]],
    ]);
    // The left-out message still takes its number, as the participant v12 adds would.
    expect(l.messages.map((x) => x.number?.value)).toEqual([2]);
    expect(sequenceLayoutViolations(m, l, {})).toEqual([
      `${m.statements[1]!.ast} is not laid out`,
      `${m.statements[2]!.ast} is not laid out`,
    ]);
  });

  it('allows float error in the comparisons', () => {
    const cfg = {
      width: 52,
      activationWidth: 31,
      wrapPadding: 64,
      labelBoxWidth: 119,
      diagramMarginX: 19,
      diagramMarginY: 92,
      mirrorActors: false,
      wrap: true,
    };
    expect(violations(FIXTURES.lifecycle!, false, cfg)).toEqual([]);
  });

  it('a lifeline reaches past the tail of a short activation', () => {
    const m = model(
      [p('A'), p('B')],
      [msg('A', 'B', 'x', 'solid', { activation: 'activate' }), act('B', false)]
    );
    expect(violations(m, false, { boxMargin: 5, mirrorActors: false })).toEqual([]);
    expect(violations(m, false, { boxMargin: 5 })).toEqual([]);
  });

  it('`autonumber N` restarts the step at 1, as v12 does', () => {
    const m = model(
      [p('A'), p('B')],
      [
        { kind: 'autonumber', ast: 'st:1', start: 10, step: 5, visible: true },
        msg('A', 'B', '1'),
        { kind: 'autonumber', ast: 'st:2', start: 20, visible: true },
        msg('A', 'B', '2'),
        msg('A', 'B', '3'),
      ]
    );
    expect(lay(m).messages.map((x) => x.number?.value)).toEqual([10, 20, 21]);
  });

  it('a box with no visible member takes no room', () => {
    const plain = model([p('A')], [msg('A', 'A', 'x')]);
    const empty = { ...plain, boxes: [{ ast: 'box:0', label: 'Empty', participants: [] }] };
    expect(lay(empty).participants[0]!.top).toBe(lay(plain).participants[0]!.top);
    const hidden = model([p('A'), p('B', 'participant', { box: 0 })], [msg('A', 'A', 'x')], {
      boxes: [{ ast: 'box:0', label: 'Hidden', participants: ['B'] }],
    });
    const l = lay(hidden, false, { hideUnusedParticipants: true });
    expect([l.boxes.length, l.participants[0]!.top]).toEqual([0, lay(plain).participants[0]!.top]);
  });

  it('keeps every message label clear of the sequence number circles (#1337)', () => {
    // Self messages, both directions, reverse and two-headed arrows (the number moves to the
    // other end), one and two lines, a label as wide as its span.
    const texts = ['x', 'Self', 'a label as wide as the gap between them', 'two<br>lines'];
    const arrows = ['solid', 'dotted', 'solid_arrow_top_reverse', 'bidirectional_solid'] as const;
    const statements: SequenceStatement[] = [{ kind: 'autonumber', ast: 'st:n', visible: true }];
    for (const [from, to] of ['AB', 'BA', 'AA', 'BB'])
      for (const arrow of arrows)
        for (const text of texts) statements.push(msg(from!, to!, text, arrow));
    const m = model([p('A'), p('B')], statements);
    const configs = [
      {},
      { rightAngles: true },
      { messageAlign: 'left' },
      { messageAlign: 'right' },
      { wrap: true, width: 60 },
    ];
    const problems: string[] = [];
    for (const classic of [false, true])
      for (const sequence of configs) {
        const l = lay(m, false, sequence, [], { classic });
        expect(l.messages.filter((x) => x.number && x.label)).toHaveLength(64);
        const where = `${classic ? 'default' : 'redux'} ${JSON.stringify(sequence)}`;
        for (const v of sequenceLayoutViolations(m, l, { sequence }))
          problems.push(`${where}: ${v}`);
      }
    expect(problems).toEqual([]);
    // A self label centred on its number sits 2 px above the circle (radius 12) on its line.
    const self = lay(m).messages.find((x) => x.from === 'A' && x.to === 'A')!;
    expect(self.y - self.label!.y - self.label!.height).toBeCloseTo(14, 6);
  });

  it('wraps a message between neighbouring participants inside their lifelines (#1239)', () => {
    // The two examples in #1239: a `:wrap` message, and `wrap: true` with each `messageAlign`.
    const debate = "John! Are you still debating about how you're doing? How long does it take??";
    const align = 'a message that is long enough to see the alignment and wrapping happen';
    const m = model(
      [p('Bob'), p('John'), p('A'), p('B')],
      [msg('Bob', 'John', debate, 'solid_cross', { wrap: true }), msg('A', 'B', align)]
    );
    for (const classic of [false, true])
      for (const messageAlign of ['center', 'left', 'right'])
        for (const sequence of [{ messageAlign }, { messageAlign, wrap: true }]) {
          expect(violations(m, false, sequence, { classic })).toEqual([]);
          const l = lay(m, false, sequence, [], { classic });
          const lines = (i: number) =>
            l.messages.find((x) => x.ast === m.statements[i]!.ast)!.label!.text.lines.length;
          // Both examples wrap: the check does not pass on a one-line label.
          expect(lines(0)).toBeGreaterThan(1);
          if (sequence.wrap) expect(lines(1)).toBeGreaterThan(1);
        }
  });

  it('a wrapped label between neighbours keeps its words whole when bars eat the span', () => {
    // A bar 340 px wide on B leaves the B->A line about 25 px: wrapped at that span less the
    // padding, the label broke into one glyph per line (#1337 review).
    const words = ['reply', 'with', 'several', 'words'];
    const m = model(
      [p('A'), p('B')],
      [act('B', true), msg('B', 'A', words.join(' '), 'solid', { wrap: true })]
    );
    for (const classic of [false, true]) {
      const sequence = { activationWidth: 340 };
      expect(violations(m, false, sequence, { classic })).toEqual([]);
      const l = lay(m, false, sequence, [], { classic });
      const label = l.messages[0]!.label!;
      const lines = label.text.lines.map((line) => line.map((r) => r.text).join(''));
      expect(lines).toEqual(words);
    }
  });

  it('keeps every message label above its line (#1337 review)', () => {
    // A large wrapPadding, a small message font and a square self message each put the last
    // baseline at or below the line, so the arrow struck through the text.
    const m = model(
      [p('A'), p('B')],
      [
        { kind: 'autonumber', ast: 'st:n', visible: false },
        msg('A', 'B', 'to B'),
        msg('B', 'A', 'two<br>lines', 'dotted'),
        msg('A', 'A', 'self'),
        msg('B', 'B', 'self<br>twice', 'solid_open'),
      ]
    );
    const configs = [
      { wrapPadding: 40 },
      { messageFontSize: 6 },
      { rightAngles: true },
      { rightAngles: true, messageFontSize: 8, wrapPadding: 30 },
      { wrap: true, wrapPadding: 60 },
    ];
    const problems: string[] = [];
    for (const classic of [false, true])
      for (const sequence of configs)
        for (const v of violations(m, false, sequence, { classic }))
          problems.push(`${classic ? 'default' : 'redux'} ${JSON.stringify(sequence)}: ${v}`);
    expect(problems).toEqual([]);
  });

  it('checks wrapped labels when the top-level `wrap` or `sequence.wrap` is set', () => {
    // The layout wraps every message when either is set (#1337 review): so does the check.
    const m = model([p('A'), p('B')], [msg('A', 'B', 'a label that is long enough to wrap')]);
    const l = lay(m);
    const [first] = l.messages;
    const right = l.participants[1]!.lifeline.x;
    const label = { ...first!.label!, x: right - first!.label!.width / 2 };
    const broken: SequenceLayout = { ...l, messages: [{ ...first!, label }] };
    const crosses = `the wrapped label of message ${first!.ast} crosses a lifeline`;
    expect(sequenceLayoutViolations(m, broken, { wrap: true })).toContain(crosses);
    expect(sequenceLayoutViolations(m, broken, { sequence: { wrap: true } })).toContain(crosses);
    expect(sequenceLayoutViolations(m, broken, {})).not.toContain(crosses);
  });

  it('message ends stay on their columns when bars or wrapped boxes are wide', () => {
    expect(violations(FIXTURES.activations!, false, { activationWidth: 119, width: 40 })).toEqual(
      []
    );
    expect(violations(FIXTURES.messagesAndNotes!, false, { width: 0, wrap: true })).toEqual([]);
  });
});

describe('sequence layout, config fuzz', () => {
  const keys = [
    'actorMargin',
    'width',
    'height',
    'boxMargin',
    'boxTextMargin',
    'noteMargin',
    'activationWidth',
    'wrapPadding',
    'labelBoxWidth',
    'labelBoxHeight',
    'diagramMarginX',
    'diagramMarginY',
  ];
  it('holds the invariants for 200 seeded random configs', () => {
    let seed = 1;
    const rnd = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const found = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const cfg: Record<string, unknown> = {};
      for (const k of keys) if (rnd() < 0.5) cfg[k] = Math.floor(rnd() * 120);
      if (rnd() < 0.3) cfg.mirrorActors = false;
      for (const k of ['rightAngles', 'wrap', 'hideUnusedParticipants'])
        if (rnd() < 0.3) cfg[k] = true;
      // Both geometry sets, and now and then a glyph band of any height (#194).
      const vars: Record<string, unknown> = {};
      if (rnd() < 0.3) vars.actorGlyphBand = Math.floor(rnd() * 100);
      const theme = { classic: i % 2 === 1, vars };
      for (const cell of [false, true])
        for (const [name, m] of Object.entries(FIXTURES))
          for (const v of violations(m, cell, cfg, theme))
            found.add(
              `${cell ? 'cell' : 'px'} ${name}: ${v} ${JSON.stringify({ ...cfg, ...theme })}`
            );
    }
    expect([...found].slice(0, 10)).toEqual([]);
  });
});
