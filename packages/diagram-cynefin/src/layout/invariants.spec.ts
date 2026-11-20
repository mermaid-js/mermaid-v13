import { beforeAll, describe, expect, it } from 'vitest';
import type { Warning } from '@mermaid-js/core';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type ThemeSpec } from '@mermaid-js/core/theme';
import type { CynefinModel } from '../model.ts';
import { cynefin as plugin } from '../plugin.ts';
import { fixture, FIXTURES } from './mmd.fixtures.ts';
import { layoutCynefin, type CynefinLayout } from './index.ts';
import { cynefinCrowdingViolations, cynefinLayoutViolations } from './invariants.ts';

let spec: ThemeSpec;
beforeAll(async () => {
  spec = await loadTheme('default');
});

function lay(m: CynefinModel, cynefin: unknown, warnings: Warning[] = []): CynefinLayout {
  return layoutCynefin(m, {
    config: { cynefin } as unknown as ResolvedConfig,
    measurer: tableMeasurer,
    theme: createTheme(spec, { diagram: plugin.theme }),
    idPrefix: 'mermaid-0',
    warn: (w) => warnings.push(w),
  });
}

/** The corpus's option sets, the schema's edges, and values v12 drew broken SVG for (D366). */
const OPTION_SETS: readonly unknown[] = [
  undefined,
  {},
  { boundaryAmplitude: 0 },
  { showDomainDescriptions: false },
  { seed: 42 },
  { width: 1000, height: 700, boundaryAmplitude: 15 },
  { width: 1, height: 1, padding: 0, boundaryAmplitude: 50 },
  { width: 120, height: 90, padding: 2, seed: -3 },
  { width: 4000, height: 3000, padding: 400, seed: 2 ** 31 - 1 },
  { width: -100, height: 0, padding: -5, boundaryAmplitude: 80, seed: Number.NaN },
  { width: Number.NaN, height: Infinity, padding: Number.NaN, boundaryAmplitude: -Infinity },
  { width: '1000', height: null, padding: {}, boundaryAmplitude: 'wavy', seed: Infinity },
  { showDomainDescriptions: 'no', seed: 0.5, boundaryAmplitude: Infinity },
  // Finite but huge: squares and sums of these overflow unless the layout guards them.
  { width: 1e200, height: 1e200, padding: 1e200 },
  { width: 1e308, height: 1e308, padding: 1e308 },
  { width: Number.MAX_VALUE, height: Number.MAX_VALUE, padding: Number.MAX_VALUE },
  { width: 1e200, height: 3 },
  { width: 1e307, height: 1e307, padding: 1e307 },
];

describe('cynefin layout invariants', () => {
  it('reads every e2e fixture', () => {
    expect(Object.keys(FIXTURES).length).toBe(34);
  });

  it.each(Object.keys(FIXTURES))('hold for %s at every option set', (name) => {
    const m = FIXTURES[name]!;
    const failures = OPTION_SETS.flatMap((o) =>
      cynefinLayoutViolations(m, lay(m, o)).map((v) => `${JSON.stringify(o)}: ${v}`)
    );
    expect(failures).toEqual([]);
  });

  // The canvas sizes the corpus draws at: a smaller one has no room for the texts side by side.
  it.each(Object.keys(FIXTURES))(
    'keep %s badges in their quadrant and off other domains',
    (name) => {
      const m = FIXTURES[name]!;
      const failures = OPTION_SETS.slice(0, 6).flatMap((o) =>
        cynefinCrowdingViolations(lay(m, o)).map((v) => `${JSON.stringify(o)}: ${v}`)
      );
      expect(failures).toEqual([]);
    }
  );

  it('warns once per invalid key per render, and never for a valid one', () => {
    const warnings: Warning[] = [];
    lay(
      fixture('pr-check/should-render-a-simple-cynefin-diagram-with-all-five-domains'),
      OPTION_SETS[9],
      warnings
    );
    expect(warnings.map((w) => w.path)).toEqual([
      'cynefin.width',
      'cynefin.height',
      'cynefin.padding',
      'cynefin.boundaryAmplitude',
      'cynefin.seed',
    ]);
    const none: Warning[] = [];
    for (const o of OPTION_SETS.slice(0, 9))
      lay(
        fixture('pr-check/should-render-a-simple-cynefin-diagram-with-all-five-domains'),
        o,
        none
      );
    expect(none).toEqual([]);
  });

  it('finds what a broken layout breaks', () => {
    const m = fixture('pr-check/should-render-a-cynefin-diagram-with-transitions');
    const good = lay(m, {});
    const nan = {
      ...good,
      quadrants: [{ ...good.quadrants[0]!, x: Number.NaN }, ...good.quadrants.slice(1)],
    };
    expect(cynefinLayoutViolations(m, nan)).toContain('layout.quadrants[0].x is NaN');
    const small = { ...good, bounds: { ...good.bounds, width: good.bounds.width - 100 } };
    expect(cynefinLayoutViolations(m, small)).toEqual(
      expect.arrayContaining(["the bounds are smaller than v12's viewBox"])
    );
    const lost = { ...good, items: good.items.slice(1) };
    expect(cynefinLayoutViolations(m, lost).join()).toMatch(/^badges /);
    const far = {
      ...good,
      title: { ...good.title!, y: good.bounds.y - 50 },
    };
    expect(cynefinLayoutViolations(m, far)).toContain('the title is outside the bounds');
  });
});
