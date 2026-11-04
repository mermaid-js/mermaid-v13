import { beforeAll, describe, expect, it } from 'vitest';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { cellMeasurer } from '@mermaid-js/core/ascii';
import { cellProfile, pxProfile } from '@mermaid-js/core/layout';
import type { UnitProfile } from '@mermaid-js/core/layout';
import { tableMeasurer } from '@mermaid-js/core/text';
import type { Measurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme } from '@mermaid-js/core/theme';
import type { ThemeSpec } from '@mermaid-js/core/theme';
import {
  detectSequence,
  layoutSequence,
  parseSequence,
  sequenceLayoutViolations,
} from '@mermaid-js/diagram-sequence';
import { sequenceGateCorpus } from './corpus.ts';

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
};

/**
 * The sequence layout's invariants (#141, `sequenceLayoutViolations`) on models the v13 parser
 * produced, over every corpus source it accepts, in px and cells, with the default config and
 * with every option changed (spec #125 T3; run notes GAPS #141).
 *
 * A message after its participant's destroying message is drawn below the participant's end,
 * as v12 drew it; the parser warns about it (`SEQUENCE_AFTER_DESTROY`), and the span invariant
 * reports it. Those reports are the only ones expected.
 */
describe('sequence layout invariants on parsed models', () => {
  it('hold over the corpus', async () => {
    const problems: string[] = [];
    let laid = 0;
    for (const item of await sequenceGateCorpus()) {
      if (!detectSequence(item.source)) continue;
      const result = parseSequence(item.source);
      if (result.diagnostics.some((d) => d.severity === 'error')) continue;
      const late = result.diagnostics.some((d) => d.code === 'SEQUENCE_AFTER_DESTROY');
      for (const [unit, units, measurer] of PROFILES) {
        for (const sequence of [{}, VARIANT]) {
          const layout = layoutSequence(result.model, {
            config: { sequence } as unknown as ResolvedConfig,
            measurer,
            units,
            theme: createTheme(spec, {}),
            warn: () => {},
          });
          laid++;
          const found = sequenceLayoutViolations(result.model, layout).filter(
            (v) => !(late && /^message \S+ at y \S+ is outside /.test(v))
          );
          if (found.length > 0)
            problems.push(`${item.id} (${unit}): ${found.slice(0, 3).join('; ')}`);
        }
      }
    }
    expect(laid).toBeGreaterThan(2000);
    expect(problems.slice(0, 20)).toEqual([]);
  }, 300_000);

  it('report a message after the destroying one, which v12 accepts, and nothing else', () => {
    const result = parseSequence('sequenceDiagram\nA->>B: hi\ndestroy B\nA->>B: bye\nA->>B: after');
    expect(result.diagnostics.map((d) => [d.severity, d.code])).toEqual([
      ['warning', 'SEQUENCE_AFTER_DESTROY'],
    ]);
    const layout = layoutSequence(result.model, {
      config: { sequence: {} } as unknown as ResolvedConfig,
      measurer: tableMeasurer,
      units: pxProfile,
      theme: createTheme(spec, {}),
      warn: () => {},
    });
    const found = sequenceLayoutViolations(result.model, layout);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/^message m:A>B#3 at y \S+ is outside B$/);
  });
});

/**
 * In cells a lifeline is a column of characters, so a message label written over it would
 * erase it: with `wrap` on, a wrapped label stays inside the span between its lifelines, a
 * label moved off a box border keeps off them, and a self message's label starts right of its
 * lifeline (spec #125 final review, finding 3).
 */
describe('sequence message labels in cells', () => {
  const cellLayout = (source: string) =>
    layoutSequence(parseSequence(source).model, {
      config: { sequence: { wrap: true } } as unknown as ResolvedConfig,
      measurer: cellMeasurer,
      units: cellProfile(),
      theme: createTheme(spec, {}),
      warn: () => {},
    });

  /**
   * Labels written over a lifeline: one of the message's own, or one outside its span (a
   * label between two far participants crosses the lifelines between them, as its arrow does).
   */
  function covered(source: string): string[] {
    const layout = cellLayout(source);
    const lifeline = new Map(layout.participants.map((p) => [p.id, p.lifeline.x]));
    const out: string[] = [];
    for (const msg of layout.messages) {
      if (!msg.label) continue;
      const a = lifeline.get(msg.from);
      const b = lifeline.get(msg.to);
      if (a === undefined || b === undefined) continue;
      const first = msg.label.x;
      const last = msg.label.x + msg.label.width - 1;
      const [lo, hi] = [Math.min(a, b), Math.max(a, b)];
      const hit = [...lifeline.values()].filter(
        (x) => x >= first && x <= last && (x === a || x === b || x < lo || x > hi)
      );
      if (hit.length > 0)
        out.push(`${msg.ast} label ${first}..${last} over lifelines ${hit.join(', ')}`);
    }
    return out;
  }

  it('keeps a wrapped label off the lifelines of a long message', () => {
    expect(
      covered(
        'sequenceDiagram\nA->>B:wrap: one two three four five six seven eight nine ten eleven twelve\nB->>C: short'
      )
    ).toEqual([]);
  });

  it('keeps every label off its lifelines over the corpus, with wrap on', async () => {
    const problems: string[] = [];
    for (const item of await sequenceGateCorpus()) {
      if (!detectSequence(item.source)) continue;
      const result = parseSequence(item.source);
      if (result.diagnostics.some((d) => d.severity === 'error')) continue;
      for (const p of covered(item.source)) problems.push(`${item.id}: ${p}`);
    }
    expect(problems.slice(0, 20)).toEqual([]);
  }, 300_000);
});
