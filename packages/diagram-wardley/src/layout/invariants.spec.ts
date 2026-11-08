import { beforeAll, describe, expect, it } from 'vitest';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type Theme } from '@mermaid-js/core/theme';
import type { WardleyModel } from '../model.ts';
import { parseWardley } from '../parser/index.ts';
import { layoutWardley, wardleyLabelOverlaps, wardleyLayoutViolations } from './index.ts';
import type { WardleyLayout } from './types.ts';

/**
 * The checker on two small maps, and on broken layouts, which it must catch. The conformance
 * corpus spec (`packages/conformance/src/wardley/layout-corpus.spec.ts`) runs it over every e2e
 * map and the rest of the gate corpus.
 */
const TEA = `wardley-beta
title Tea Shop
anchor Business [0.95, 0.63]
component Cup of Tea [0.79, 0.61] label [19, -4]
component Tea [0.63, 0.81] (buy) inertia
component Kettle [0.43, 0.35]
component Power [0.1, 0.7] (market)
Business -> Cup of Tea
Cup of Tea +> Tea ; leaf
Kettle -> Power
evolve Kettle 0.62
note "Standardising power" [0.30, 0.49]
annotations [0.97, 0.02]
annotation 1, [0.48, 0.85] "Fair trade"
accelerator Open [0.2, 0.2]
`;
const KETTLE = `wardley-beta
component Kettle [0.57, 0.45]
component User [0.95, 0.5]
User -> Electric Kettle
pipeline Kettle {
  component Campfire Kettle [0.35] label [-60, 35]
  component Electric Kettle [0.53] label [-60, 35]
  component Smart Kettle [0.72] label [-30, 35]
}
Campfire Kettle -> Kettle
evolve Kettle 0.8
`;

let theme: Theme;
beforeAll(async () => {
  theme = createTheme(await loadTheme('default'));
});

function lay(model: WardleyModel, section: Record<string, unknown> = {}): WardleyLayout {
  return layoutWardley(model, {
    config: { 'wardley-beta': section } as unknown as ResolvedConfig,
    measurer: tableMeasurer,
    theme,
  });
}

function parsed(source: string): WardleyModel {
  const { model, diagnostics } = parseWardley(source);
  const errors = diagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0) throw new Error(errors.map((d) => d.message).join('; '));
  return model;
}

describe('wardley layout invariants', () => {
  it('hold on the maps, which stack no labels', () => {
    for (const source of [TEA, KETTLE]) {
      const model = parsed(source);
      const layout = lay(model);
      expect(wardleyLayoutViolations(model, layout)).toEqual([]);
      expect(wardleyLabelOverlaps(layout)).toEqual([]);
    }
  });

  const tea = () => parsed(TEA);
  const kettle = () => parsed(KETTLE);

  it('catches a node off its position, and NaN', () => {
    const model = tea();
    const l = lay(model);
    const [first, ...rest] = l.nodes;
    const moved = {
      ...l,
      nodes: [{ ...first!, point: { x: first!.point.x + 5, y: Number.NaN } }, ...rest],
    };
    const v = wardleyLayoutViolations(model, moved);
    expect(v.some((m) => m.includes('is NaN'))).toBe(true);
    expect(v.some((m) => m.includes('off its position'))).toBe(true);
  });

  it('catches a link end inside its node, and a link that should not be drawn', () => {
    const model = kettle();
    const l = lay(model);
    const [k, ...rest] = l.links;
    const v = wardleyLayoutViolations(model, { ...l, links: [{ ...k!, from: k!.to }, ...rest] });
    expect(v.some((m) => m.includes("not on its nodes' edges"))).toBe(true);
    expect(wardleyLayoutViolations(model, { ...l, links: rest })[0]).toMatch(/^drawn links/);
  });

  it('catches a slanted trend, a child off its line and contents outside the bounds', () => {
    const model = tea();
    const l = lay(model);
    const [t, ...rest] = l.trends;
    const slanted = { ...l, trends: [{ ...t!, to: { x: t!.to.x, y: t!.to.y + 3 } }, ...rest] };
    expect(wardleyLayoutViolations(model, slanted).join()).toMatch(/not horizontal/);
    const shrunk = { ...l, bounds: { ...l.bounds, width: l.bounds.width - 50 } };
    expect(wardleyLayoutViolations(model, shrunk).join()).toMatch(/outside the bounds/);

    const km = kettle();
    const kl = lay(km);
    const nodes = kl.nodes.map((n) =>
      n.id === 'Kettle_Smart Kettle' ? { ...n, point: { ...n.point, y: n.point.y + 4 } } : n
    );
    expect(wardleyLayoutViolations(km, { ...kl, nodes }).join()).toMatch(/off its parent's line/);
  });

  it('catches labels on top of one another', () => {
    const model = parsed('wardley-beta\ncomponent A [0.5, 0.5]\ncomponent B [0.51, 0.5]\n');
    expect(wardleyLabelOverlaps(lay(model))).toEqual(['node A and node B overlap']);
  });

  it('hold at the schema limits and for broken config (D424)', () => {
    const configs = [
      { width: 1, height: 1 },
      { padding: 0, nodeRadius: 0, axisFontSize: 0, labelFontSize: 0, showGrid: true },
      { padding: 800, nodeLabelOffset: 100 },
      { width: -1, height: Number.NaN, padding: 'x', nodeRadius: -3 },
    ];
    for (const source of [TEA, KETTLE])
      for (const section of configs) {
        const model = parsed(source);
        const v = wardleyLayoutViolations(model, lay(model, section));
        expect(v, JSON.stringify(section)).toEqual([]);
      }
  });
});
