import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pxProfile, TURN_BREAKPOINT, type LayoutMetrics } from '@mermaid-js/core/layout';
import { REPO_ROOT } from './index.ts';

// The px profile must not change one SVG byte (D77): its engine metrics equal the `layered`
// engine's constants. Those are module-private, so read them from source; a constant changed
// without the profile fails here.
const LAYERED = join(REPO_ROOT, 'packages/core/src/layout/layered');
const source = (file: string): string => readFileSync(join(LAYERED, file), 'utf8');

function constants(file: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of source(file).matchAll(/^(?:export )?const ([A-Z_]+) = ([\d.]+);$/gm))
    out.set(m[1]!, Number(m[2]));
  return out;
}

describe('pxProfile engine metrics (D77)', () => {
  const layered = constants('layered.ts');
  const compound = constants('compound.ts');
  const index = constants('index.ts');

  it('equal the layered engine constants', () => {
    const expected: Record<keyof LayoutMetrics, number | undefined> = {
      portPitch: layered.get('PORT_PITCH'),
      minPitch: layered.get('MIN_PITCH'),
      portSep: index.get('PORT_SEP'),
      trackMargin: layered.get('TRACK_MARGIN'),
      trackPitch: layered.get('TRACK_PITCH'),
      trackSpread: layered.get('TRACK_SPREAD'),
      levelMargin: layered.get('LEVEL_MARGIN'),
      levelPitch: layered.get('LEVEL_PITCH'),
      levelLead: layered.get('LEVEL_LEAD'),
      levelClear: layered.get('LEVEL_CLEAR'),
      levelTouch: layered.get('LEVEL_TOUCH'),
      snap: layered.get('SNAP'),
      bendSnap: layered.get('BEND_SNAP'),
      leanClear: layered.get('LEAN_CLEAR'),
      fan: compound.get('FAN'),
      loop: index.get('LOOP'),
      loopGap: index.get('LOOP_GAP'),
      loopLabel: pxProfile.engine.loopLabel,
      corner: index.get('CORNER'),
      turnBreakpoint: TURN_BREAKPOINT,
    };
    expect(pxProfile.engine).toEqual(expected);
  });

  it('match the self-loop label offset written inline in compound.ts', () => {
    expect(source('compound.ts')).toContain(
      `node.w / 2 + ${pxProfile.engine.loopLabel} + e.labelW / 2`
    );
  });
});
