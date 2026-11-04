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
