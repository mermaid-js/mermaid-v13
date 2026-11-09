import { parseFlowchart } from '@mermaid-js/diagram-flowchart';
import { describe, expect, it } from 'vitest';
import { baselineFixtures, galleryFixtures, M1_THEMES } from './fixtures.ts';

// v12.2's documented `@{ shape }` short names (`shapesDefs` in
// rendering-util/rendering-elements/shapes.ts at fa796a943).
const V12_SHAPES = [
  'rect', 'rounded', 'stadium', 'fr-rect', 'cyl', 'datastore', 'folder', 'bucket', 'console',
  'browser', 'person', 'circle', 'bang', 'cloud', 'diam', 'hex', 'lean-r', 'lean-l', 'trap-b',
  'trap-t', 'dbl-circ', 'text', 'notch-rect', 'lin-rect', 'sm-circ', 'fr-circ', 'fork',
  'hourglass', 'brace', 'brace-r', 'braces', 'bolt', 'doc', 'delay', 'h-cyl', 'lin-cyl',
  'curv-trap', 'div-rect', 'tri', 'win-pane', 'f-circ', 'notch-pent', 'flip-tri', 'sl-rect',
  'docs', 'st-rect', 'bow-rect', 'cross-circ', 'tag-doc', 'tag-rect', 'flag', 'odd', 'lin-doc',
]; // prettier-ignore

// v12's bracket syntaxes, as the vertex types flow.jison gives them.
const V12_BRACKET_TYPES = [
  'square', 'round', 'stadium', 'subroutine', 'cylinder', 'circle', 'doublecircle', 'ellipse',
  'diamond', 'hexagon', 'odd', 'lean_right', 'lean_left', 'trapezoid', 'inv_trapezoid',
]; // prettier-ignore

// v12's edge types (arrow end × stroke) from flow.jison's destructLink, plus `~~~`.
const ARROWS = ['arrow_point', 'arrow_open', 'arrow_cross', 'arrow_circle'];
const DOUBLE = ['double_arrow_point', 'double_arrow_cross', 'double_arrow_circle'];
const V12_EDGE_TYPES = [
  ...[...ARROWS, ...DOUBLE].flatMap((type) =>
    ['normal', 'thick', 'dotted'].map((stroke) => `${type}/${stroke}`)
  ),
  'arrow_open/invisible',
];

const fixtures = baselineFixtures();
const parsed = fixtures.map((f) => ({ ...f, result: parseFlowchart(f.source) }));

describe('visual baseline fixtures (R-TEST-5)', () => {
  it('all parse without errors', () => {
    const failing = parsed
      .filter((f) => f.result.diagnostics.some((d) => d.severity === 'error'))
      .map((f) => f.path);
    expect(failing).toEqual([]);
  });

  it('cover every v12 shape, one fixture each', () => {
    const shapeFixtures = parsed.filter((f) => f.path.startsWith('shapes/'));
    const types = new Set(shapeFixtures.flatMap((f) => f.result.model.vertices.map((v) => v.type)));
    expect(V12_SHAPES.filter((s) => !types.has(s))).toEqual([]);
    expect(V12_BRACKET_TYPES.filter((s) => !types.has(s))).toEqual([]);
    for (const shape of V12_SHAPES)
      expect(fixtures.map((f) => f.path)).toContain(`shapes/${shape}.mmd`);
  });

  it('cover every v12 edge type (arrow × stroke)', () => {
    const edgeFixtures = parsed.filter((f) => f.path.startsWith('edges/'));
    const seen = new Set(
      edgeFixtures.flatMap((f) => f.result.model.edges.map((e) => `${e.type}/${e.stroke}`))
    );
    expect(V12_EDGE_TYPES.filter((t) => !seen.has(t))).toEqual([]);
  });

  it('have one fixture per M1 theme that sets that theme', () => {
    expect(M1_THEMES).toEqual([
      'redux-color',
      'redux',
      'redux-dark',
      'redux-dark-color',
      'default',
      'dark',
      'forest',
      'neutral',
      'base',
      'neo',
      'neo-dark',
    ]);
    // The redux-color, redux-dark and redux-dark-color fixtures come with #89.
    const pending = new Set(['redux-color', 'redux-dark', 'redux-dark-color']);
    for (const theme of M1_THEMES.filter((t) => !pending.has(t))) {
      const f = fixtures.find((x) => x.path === `themes/${theme}.mmd`);
      expect(f?.source).toMatch(new RegExp(`theme: ${theme}\\n`));
    }
  });

  it('have nested, own-direction and crossing-edge subgraph cases', () => {
    const sub = parsed.filter((f) => f.path.startsWith('subgraphs/'));
    const nested = sub.some((f) =>
      f.result.model.subgraphs.some((s) =>
        s.nodes.some((n) => f.result.model.subgraphs.some((t) => t.id === n))
      )
    );
    expect(nested).toBe(true);
    expect(sub.some((f) => f.result.model.subgraphs.some((s) => s.dir))).toBe(true);
    expect(sub.map((f) => f.path)).toContain('subgraphs/crossing-edges.mmd');
  });

  it('have wrapping and CJK text cases', () => {
    const text = fixtures.filter((f) => f.path.startsWith('text/'));
    expect(text.some((f) => /[一-鿿]/.test(f.source))).toBe(true);
    expect(text.some((f) => /[぀-ヿ]/.test(f.source))).toBe(true);
    expect(text.some((f) => /[가-힯]/.test(f.source))).toBe(true);
    expect(text.map((f) => f.path)).toEqual(
      expect.arrayContaining(['text/wrapping.mmd', 'text/wrapping-markdown.mmd', 'text/cjk.mmd'])
    );
  });
});

describe('gallery fixtures (R-TEST-6, #207)', () => {
  it('take the baseline folder of every diagram type mermaid renders, under its folder name', () => {
    const folders = new Set(galleryFixtures().map((f) => f.path.split('/')[0]));
    expect([...folders].sort()).toEqual([
      'class-diagram',
      'cynefin',
      'er-diagram',
      'flowchart',
      'gantt',
      'git',
      'info',
      'journey',
      'kanban',
      'mindmap',
      'packet',
      'pie',
      'quadrant-chart',
      'radar',
      'sankey',
      'sequence',
      'state-diagram-v2',
      'timeline',
    ]);
  });

  it('leave out the folders of types mermaid does not render yet', () => {
    const supported = new Set(['flowchart-v2']);
    const folders = new Set(galleryFixtures(supported).map((f) => f.path.split('/')[0]));
    expect([...folders]).toEqual(['flowchart']);
  });

  it('keep each baseline whole, in path order', () => {
    const flowchart = galleryFixtures()
      .filter((f) => f.path.startsWith('flowchart/'))
      .map((f) => f.path.slice('flowchart/'.length));
    expect(flowchart).toEqual(baselineFixtures().map((f) => f.path));
  });
});
