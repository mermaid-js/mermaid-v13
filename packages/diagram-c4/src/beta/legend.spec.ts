import type { Warning } from '@mermaid-js/core';
import { describe, expect, it } from 'vitest';
import { C4_COLOR_INVALID } from '../codes.ts';
import { renderC4BetaForTest } from '../render/harness.ts';
import { c4TestConfig, c4TestContext, c4TestTheme } from '../test-context.ts';
import { legendViolations } from '../layout/invariants.ts';
import type { C4Layout } from '../layout/types.ts';
import { layoutC4Beta } from './layout.ts';
import { legendEntries } from './legend.ts';
import { C4_BETA_METRICS as B } from './metrics.ts';
import { kindName, legacyKind } from './prepare.ts';
import { betaPaints } from './paint.ts';
import { parseC4Beta } from './parser.ts';

/**
 * The c4-beta legend (spec #730 T3, `legend on` / `legend off`): which rows a model earns, where
 * the legend sits, and what it adds to the canvas. The public-API cases are in
 * `packages/mermaid/src/c4beta.spec.ts`, the invariants over every fixture in `packages/conformance`.
 */
const STYLED = [
  'c4-beta container',
  'legend on',
  'style critical fill:#b91c1c, stroke:#7f1d1d',
  'style async stroke:#0a7a3d, line:dashed',
  'style store shape:cylinder',
  'person clerk "Clerk"',
  'softwareSystem ledger "Ledger" {',
  '  container api "API" :::critical',
  '  container books "Books" :::store',
  '}',
  'clerk --> api : "Posts"',
  'api --> books : "Writes" :::async',
].join('\n');

const KINDS = `c4-beta\nlegend on\nperson clerk "Clerk"\nsoftwareSystem erp "ERP" :::external\nsoftwareSystem ledger "Ledger" {\n  container api "API"\n}\nclerk --> api : "Posts"`;

const entries = (source: string) =>
  legendEntries(parseC4Beta(source).model, legacyKind, kindName).map((e) => e.label);

const LEDGER = [
  'person clerk "Clerk"',
  'softwareSystem ledger "Ledger" {',
  '  container api "API"',
  '}',
  'clerk --> api : "Posts"',
].join('\n');

async function sceneOf(source: string): Promise<C4Layout> {
  const theme = await c4TestTheme('default');
  return layoutC4Beta(parseC4Beta(source).model, c4TestContext(c4TestConfig(), theme));
}

describe('which rows the legend has', () => {
  it('has one row per element kind drawn as a shape, in statement order, and none for a kind not used', () => {
    expect(entries(`c4-beta\nlegend on\n${LEDGER}`)).toEqual(['Person', 'Container']);
    expect(entries('c4-beta\nlegend on\nperson a "A"')).toEqual(['Person']);
  });

  it('names an element tagged external apart, once, and leaves the plain kind its own row', () => {
    const rows = entries(
      'c4-beta\nlegend on\nsoftwareSystem a "A"\nsoftwareSystem b "B" :::external\nsoftwareSystem c "C" :::external'
    );
    expect(rows).toEqual(['Software System', 'External Software System']);
  });

  it('names a row as the type line does, and lists kinds in the order they first appear', () => {
    expect(
      entries(
        'c4-beta\nlegend on\ncomponent c "C"\nsoftwareSystem s "S" :::external\nperson p "P"\ncomponent d "D"\nsoftwareSystem t "T"'
      )
    ).toEqual(['Component', 'External Software System', 'Person', 'Software System']);
  });

  it('draws a system as a row only when it is a shape, not when it holds a body', () => {
    expect(entries('c4-beta\nlegend on\nsoftwareSystem s "S"')).toEqual(['Software System']);
    expect(entries('c4-beta\nlegend on\nsoftwareSystem s "S" {\n  person p "P"\n}')).toEqual([
      'Person',
    ]);
  });

  it('draws no row for a frame: a group, a deployment node, or any element with a body', () => {
    expect(
      entries(
        'c4-beta deployment\nlegend on\ngroup g "G"\ndeploymentNode n "N" {\n  infrastructureNode i "I"\n}'
      )
    ).toEqual(['Infrastructure Node']);
  });

  it('has a row for each style whose tag an element or a relation carries, and no other', () => {
    const rows = entries(
      [
        'c4-beta',
        'legend on',
        'style hot fill:#b91c1c',
        'style slow stroke:#0a7a3d',
        'style unused fill:#999999',
        'style container fill:#0b5cab',
        'person a "A" :::hot',
        'container b "B"',
        'a --> b : "Calls" :::slow',
      ].join('\n')
    );
    expect(rows).toEqual(['Person', 'Container', 'hot', 'slow']);
  });

  it('has no row for a style with neither a fill nor a stroke, until a swatch can show its other keys', () => {
    const rows = entries(
      [
        'c4-beta',
        'legend on',
        'style odd foo:bar',
        'style async line:dashed, color:#333333',
        'style store shape:cylinder',
        'style hot fill:#b91c1c',
        'style edge stroke:#0a7a3d',
        'person a "A" :::odd :::async :::store :::hot',
        'container b "B"',
        'a --> b : "Calls" :::edge',
      ].join('\n')
    );
    expect(rows).toEqual(['Person', 'Container', 'hot', 'edge']);
  });

  it('merges the statements of one tag, the later entry winning', () => {
    const { model } = parseC4Beta(
      'c4-beta\nlegend on\nstyle hot fill:#111111, stroke:#222222\nstyle hot fill:#333333\nperson a "A" :::hot'
    );
    const [, hot] = legendEntries(model, legacyKind, kindName);
    expect(hot?.tag).toMatchObject({ name: 'hot', fill: '#333333', stroke: '#222222' });
  });

  it('has no row at all for `legend off`, or for an empty diagram', () => {
    expect(entries(`c4-beta\nlegend off\n${LEDGER}`)).toEqual([]);
    expect(entries('c4-beta\nlegend on')).toEqual([]);
    expect(entries('c4-beta\nlegend on\ngroup g "G"')).toEqual([]);
  });

  it('is on when the source says nothing, and the last statement wins', () => {
    expect(entries(`c4-beta\n${LEDGER}`)).toEqual(['Person', 'Container']);
    expect(entries(`c4-beta\nlegend off\nlegend on\n${LEDGER}`)).toHaveLength(2);
    expect(entries(`c4-beta\nlegend on\nlegend off\n${LEDGER}`)).toEqual([]);
  });
});

describe('where the legend sits', () => {
  it('lies below the drawing, inside the bounds, and overlaps nothing', async () => {
    const scene = await sceneOf(`c4-beta\nlegend on\ntitle T\n${LEDGER}`);
    const legend = scene.legend!;
    expect(legendViolations(scene)).toEqual([]);
    const lowest = Math.max(
      ...scene.elements.map((e) => e.box.y + e.box.height),
      ...scene.boundaries.map((b) => b.box.y + b.box.height)
    );
    expect(legend.box.y).toBeGreaterThanOrEqual(lowest + B.legendGap);
    expect(legend.box.x).toBe(scene.bounds.x);
    expect(legend.rows).toHaveLength(2);
  });

  it('grows the canvas by the gap and its own height, and no wider than it needs', async () => {
    const off = await sceneOf(`c4-beta\nlegend off\n${LEDGER}`);
    const on = await sceneOf(`c4-beta\nlegend on\n${LEDGER}`);
    expect(on.height).toBeCloseTo(off.height + B.legendGap + on.legend!.box.height, 6);
    expect(on.bounds.height).toBeCloseTo(
      off.bounds.height + B.legendGap + on.legend!.box.height,
      6
    );
    expect(on.width).toBeGreaterThanOrEqual(off.width);
  });

  it('widens a narrow drawing to hold a wide legend, and keeps the legend inside the bounds', async () => {
    const source = (name: string) =>
      `c4-beta\nlegend on\nstyle ${name} fill:#b91c1c\nperson a "A" :::${name}`;
    const narrow = await sceneOf(source('t'));
    const wide = await sceneOf(source('a-tag-whose-name-is-far-wider-than-a-person-is'));
    expect(wide.width).toBeGreaterThan(narrow.width);
    expect(legendViolations(wide)).toEqual([]);
  });

  it('is not in the scene without a row to show', async () => {
    expect((await sceneOf(`c4-beta\nlegend off\n${LEDGER}`)).legend).toBeUndefined();
    expect((await sceneOf('c4-beta\nlegend on')).legend).toBeUndefined();
  });
});

describe('what the legend draws', () => {
  it('writes g.c4-legend with a heading and, per row, a swatch and its label', async () => {
    const r = await renderC4BetaForTest(STYLED);
    expect(r.rejected).toBe(false);
    expect(r.svg.match(/<g class="c4-legend">/g)).toHaveLength(1);
    expect(r.svg.match(/class="c4-legend-swatch"/g)).toHaveLength(4);
    expect(r.svg.match(/class="c4-legend-title"/g)).toHaveLength(1);
    expect(r.svg).toContain('fill="#b91c1c"');
    expect(r.svg).toContain('stroke="#7f1d1d"');
  });

  it('paints a kind swatch with the colours its elements use', async () => {
    const r = await renderC4BetaForTest(KINDS);
    const [, fill, stroke] =
      /class="node c4-shape c4-person"[^]*?fill="([^"]+)"[^]*?stroke="([^"]+)"/.exec(r.svg)!;
    const legend = r.svg.slice(r.svg.indexOf('<g class="c4-legend">'));
    expect(legend).toContain(`fill="${fill}"`);
    expect(legend).toContain(`stroke="${stroke}"`);
  });

  it('draws nothing for `legend off`', async () => {
    const r = await renderC4BetaForTest(KINDS.replace('legend on', 'legend off'));
    expect(r.svg).not.toContain('c4-legend');
  });
});

/** The `fill` and `stroke` of each tag row's swatch, in row order, after the kind rows. */
function tagSwatches(svg: string): { fill: string; stroke: string }[] {
  const legend = svg.slice(svg.indexOf('<g class="c4-legend">'));
  return [...legend.matchAll(/class="c4-legend-swatch"[^>]*? fill="([^"]*)" stroke="([^"]*)"/g)]
    .slice(1)
    .map(([, fill, stroke]) => ({ fill: fill!, stroke: stroke! }));
}

const tagged = (style: string) => `c4-beta\nlegend on\n${style}\nperson p "P" :::t`;

/**
 * The paints of a legend whose tag row says `colours`, as a layout the parser would not give: the
 * grammar lets through only words and `#hex` values, which the colour check accepts, and a style
 * with neither colour has no row, so the swatch's own fallbacks are reached with a forged row.
 */
async function paintedWith(colours: { fill?: string; stroke?: string }) {
  const theme = await c4TestTheme('default');
  const warnings: Warning[] = [];
  const ctx = c4TestContext(c4TestConfig(), theme, warnings);
  const { model } = parseC4Beta(tagged('style t fill:#112233'));
  const layout = layoutC4Beta(model, ctx);
  const forged: C4Layout = {
    ...layout,
    legend: layout.legend && {
      ...layout.legend,
      rows: layout.legend.rows.map((row) =>
        row.tag ? { ...row, tag: { name: row.tag.name, ast: row.tag.ast, ...colours } } : row
      ),
    },
  };
  return {
    legend: betaPaints(model, forged, {
      ...ctx,
      idPrefix: '',
      version: '13.0.0-test',
      warn: (w) => void warnings.push(w),
    }).legend,
    warnings,
  };
}

describe('what a tag swatch falls back to', () => {
  it('takes the stroke from the fill when the style has only a fill', async () => {
    const r = await renderC4BetaForTest(tagged('style t fill:#112233'));
    expect(tagSwatches(r.svg)).toEqual([{ fill: '#112233', stroke: '#112233' }]);
  });

  it('keeps no fill when the style has only a stroke', async () => {
    const r = await renderC4BetaForTest(tagged('style t stroke:#445566'));
    expect(tagSwatches(r.svg)).toEqual([{ fill: 'none', stroke: '#445566' }]);
  });

  it('draws an outline in the text colour when a tag has neither colour', async () => {
    const { legend, warnings } = await paintedWith({});
    expect(legend?.rows.at(-1)).toEqual({ fill: 'none', stroke: legend?.text });
    expect(warnings).toEqual([]);
  });

  it('warns C4_COLOR_INVALID and falls back for a colour the check refuses', async () => {
    const { legend, warnings } = await paintedWith({ fill: 'url(#x)', stroke: 'a;b' });
    expect(legend?.rows.at(-1)).toEqual({ fill: 'none', stroke: legend?.text });
    expect(warnings.map((w) => w.code)).toEqual([C4_COLOR_INVALID]);
    expect(warnings[0]?.message).toContain('style t fill');
    expect(warnings[0]?.message).toContain('style t stroke');
  });
});
