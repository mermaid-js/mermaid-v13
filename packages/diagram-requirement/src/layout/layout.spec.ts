import { describe, expect, it } from 'vitest';
import { CORE_DEFAULTS, resolveConfig, type MermaidConfig } from '@mermaid-js/core/config';
import { layered, type LayoutGraph } from '@mermaid-js/core/layout';
import { LimitError } from '@mermaid-js/core/limits';
import { Style, tableMeasurer, type FontKey, type Measurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type Theme } from '@mermaid-js/core/theme';
import { parseRequirement } from '../index.ts';
import type { RequirementModel } from '../model.ts';
import { layoutRequirement, type RequirementLayout } from './layout.ts';
import type { RequirementRenderContext } from './context.ts';
import { theme as table } from '../theme/table.ts';

const themed = async (name: string, themeVariables?: Record<string, unknown>): Promise<Theme> =>
  createTheme(await loadTheme(name as 'default'), { diagram: table, themeVariables });
const theme = await themed('default');
const font: FontKey = {
  family: theme.value('fontFamily'),
  size: theme.number('fontSize'),
  weight: 400,
};
const line = tableMeasurer.metrics(font).lineHeight;
const width = (text: string, style = 0) => tableMeasurer.width(text, font, style);

function modelOf(src: string): RequirementModel {
  const { model, diagnostics } = parseRequirement(src);
  expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return model;
}

/** Lays `src` out, keeping the graph the builder hands the engine. */
function lay(
  src: string | RequirementModel,
  init?: MermaidConfig,
  measurer: Measurer = tableMeasurer,
  t: Theme = theme
): { graph: LayoutGraph; layout: RequirementLayout } {
  let graph: LayoutGraph | undefined;
  const ctx: RequirementRenderContext = {
    config: resolveConfig(CORE_DEFAULTS, init),
    measurer,
    theme: t,
    warn: () => {},
    layout: (g) => layered((graph = g)),
  };
  const layout = layoutRequirement(typeof src === 'string' ? modelOf(src) : src, ctx);
  return { graph: graph!, layout };
}

const text = (l: { label: { lines: { text: string }[][] } }) =>
  l.label.lines.map((runs) => runs.map((r) => r.text).join('')).join('\n');

const FULL = `requirementDiagram
requirement test_req {
  id: 1
  text: the test text.
  risk: high
  verifymethod: test
}
element test_entity {
  type: simulation
  docref: reqs/test_entity
}
test_entity - satisfies -> test_req
`;

describe('the requirement box (requirementBox.ts)', () => {
  it('stacks <<Kind>>, the bold name and the body lines, as wide as the widest plus 20', () => {
    const { layout, graph } = lay(FULL);
    const box = layout.requirement!.boxes[0]!;
    expect(box.lines.map((l) => [l.part, text(l), l.align])).toEqual([
      ['kind', '<<Requirement>>', 'center'],
      ['name', 'test_req', 'center'],
      ['id', 'ID: 1', 'start'],
      ['text', 'Text: the test text.', 'start'],
      ['risk', 'Risk: High', 'start'],
      ['verification', 'Verification: Test', 'start'],
    ]);
    expect(box.lines[1]!.label.lines[0]![0]!.style).toBe(Style.Bold);
    const widest = width('Text: the test text.');
    expect(box.width).toBeCloseTo(widest + 20, 6);
    // Six lines, the gap before the body and the padding.
    expect(box.height).toBeCloseTo(6 * line + 20 + 20, 6);
    expect(graph.nodes[0]).toMatchObject({
      id: 'requirement:test_req',
      width: box.width,
      height: box.height,
      shape: 'requirementBox',
    });
  });

  it('centres the kind and the name, starts the body 10 in, the text 20 less half a line down', () => {
    const box = lay(FULL).layout.requirement!.boxes[0]!;
    const [kind, name, ...body] = box.lines;
    expect(kind!.x).toBeCloseTo((box.width - width('<<Requirement>>')) / 2, 6);
    expect(name!.x).toBeCloseTo((box.width - width('test_req', Style.Bold)) / 2, 6);
    for (const l of body) expect(l.x).toBe(10);
    expect(kind!.y).toBeCloseTo(20 - line / 2, 6);
    expect(name!.y).toBeCloseTo(20 - line / 2 + line, 6);
    expect(body[0]!.y).toBeCloseTo(20 - line / 2 + 2 * line + 20, 6);
    // v12's divider: the two head lines and the gap down from the top.
    expect(box.divider).toBeCloseTo(2 * line + 20, 6);
  });

  it('draws an element with Type and Doc Ref', () => {
    const box = lay(FULL).layout.requirement!.boxes[1]!;
    expect(box.is).toBe('element');
    expect(box.lines.map(text)).toEqual([
      '<<Element>>',
      'test_entity',
      'Type: simulation',
      'Doc Ref: reqs/test_entity',
    ]);
  });

  it('draws nothing for an empty field, and no divider without a body line', () => {
    const { layout } = lay(
      'requirementDiagram\nfunctionalRequirement a {\n  risk: low\n}\nelement b {\n}\n'
    );
    const [a, b] = layout.requirement!.boxes;
    expect(a!.lines.map(text)).toEqual(['<<Functional Requirement>>', 'a', 'Risk: Low']);
    expect(a!.divider).toBeCloseTo(2 * line + 20, 6);
    expect(b!.lines.map(text)).toEqual(['<<Element>>', 'b']);
    expect(b!.divider).toBeUndefined();
    expect(b!.height).toBeCloseTo(2 * line + 20, 6);
  });

  it('never wraps (D436) and reads markdown on every line', () => {
    const long = 'word '.repeat(80).trim();
    const { layout } = lay(
      `requirementDiagram\nrequirement "__bold name__" {\n  text: "${long} **b**"\n}\n`
    );
    const box = layout.requirement!.boxes[0]!;
    const body = box.lines[2]!;
    expect(body.label.lines).toHaveLength(1);
    expect(box.width).toBeCloseTo(body.label.width + 20, 6);
    expect(box.lines[1]!.label.lines[0]!.map((r) => [r.text, r.style])).toEqual([
      ['bold name', Style.Bold],
    ]);
    expect(body.label.lines[0]!.at(-1)).toMatchObject({ text: 'b', style: Style.Bold });
  });

  it("measures a box's text in the font size its style gives it", () => {
    const plain = lay('requirementDiagram\nrequirement a {\n}\n').layout.requirement!.boxes[0]!;
    const big = lay('requirementDiagram\nrequirement a {\n}\nstyle a font-size:40px\n').layout
      .requirement!.boxes[0]!;
    expect(big.height).toBeGreaterThan(plain.height);
    expect(big.width).toBeGreaterThan(plain.width);
    expect(big.style.text['font-size']).toBe('40px');
  });

  it('keeps the text inside the box when half a line is taller than the padding', () => {
    const big = lay('requirementDiagram\nrequirement a {\n  id: 1\n}\nstyle a font-size:60px\n')
      .layout.requirement!.boxes[0]!;
    expect(big.lines[0]!.y).toBe(0);
    const last = big.lines.at(-1)!;
    expect(last.y + last.label.height).toBeLessThanOrEqual(big.height);
  });
});

describe('relations', () => {
  it('labels each relation <<kind>>, contains marked at the source, the rest dashed to the target', () => {
    const { layout, graph } = lay(
      'requirementDiagram\nrequirement a {\n}\nrequirement b {\n}\nelement c {\n}\na - contains -> b\nc - satisfies -> a\n'
    );
    const [contains, satisfies] = layout.requirement!.relations;
    expect([contains, satisfies].map((r) => [text(r!), r!.marker, r!.markerAt, r!.dashed])).toEqual(
      [
        ['<<contains>>', 'contains', 'source', false],
        ['<<satisfies>>', 'arrow', 'target', true],
      ]
    );
    expect(graph.edges.map((e) => [e.id, e.source, e.target])).toEqual([
      ['relation:a->b', 'requirement:a', 'requirement:b'],
      ['relation:c->a', 'element:c', 'requirement:a'],
    ]);
    // Marker room: the chevron as drawn (20.22 out, 20.89 across with its butt caps), rounded
    // up, at the end that has the marker.
    expect(graph.edges[0]!.startMarker).toEqual({ length: 21, width: 21 });
    expect(graph.edges[0]!.endMarker).toBeUndefined();
    expect(graph.edges[1]!.endMarker).toEqual({ length: 21, width: 21 });
    expect(graph.headRoom).toBe(21);
    expect(graph.edges[0]!.label!.width).toBeGreaterThan(width('<<contains>>'));
  });

  it("sizes the marker room from the theme's marker tokens, wider strokes included", async () => {
    const src =
      'requirementDiagram\nrequirement a {\n}\nrequirement b {\n}\na - contains -> b\na - traces -> b\n';
    const room = async (name: string, vars?: Record<string, unknown>) => {
      const { graph } = lay(src, undefined, tableMeasurer, await themed(name, vars));
      return [graph.edges[0]!.startMarker, graph.edges[1]!.endMarker, graph.headRoom];
    };
    // Classic: the 1px chevron, 20.22 out and 20.89 across, rounded up.
    expect(await room('forest')).toEqual([
      { length: 21, width: 21 },
      { length: 21, width: 21 },
      21,
    ]);
    // Neo: the r 9 circle with a 2px stroke is 20 × 20; the 0.8 chevron is smaller.
    expect(await room('neo')).toEqual([{ length: 20, width: 20 }, { length: 20, width: 20 }, 20]);
    // A 6px strokeWidth: the circle reaches 10 + 9 + 3 out and 18 + 6 across.
    expect(await room('redux', { strokeWidth: 6 })).toEqual([
      { length: 22, width: 24 },
      { length: 22, width: 24 },
      22,
    ]);
    // Past 8px the marker strokes stop growing, and so does the room.
    expect(await room('redux', { strokeWidth: 500 })).toEqual(
      await room('redux', { strokeWidth: 8 })
    );
    const prepared = lay(src, undefined, tableMeasurer, await themed('redux', { strokeWidth: 500 }))
      .layout.requirement!;
    expect(prepared.markers).toEqual({ stroke: 8, arrowScale: 0.8 });
  });

  it('leaves relations to unknown names out of the layout (D434)', () => {
    const { graph, layout } = lay(
      'requirementDiagram\nrequirement a {\n}\na - traces -> ghost\nghost - derives -> a\nx - copies -> y\na - refines -> a\n'
    );
    expect(graph.edges.map((e) => e.id)).toEqual(['relation:a->a']);
    expect(layout.edges.size).toBe(1);
  });

  it('lays a shared name out as two boxes, relations resolving to the requirement', () => {
    const { graph } = lay(
      'requirementDiagram\nrequirement s {\n}\nelement s {\n}\nelement t {\n}\nt - satisfies -> s\n'
    );
    expect(graph.nodes.map((n) => n.id)).toEqual(['requirement:s', 'element:s', 'element:t']);
    expect(graph.edges[0]).toMatchObject({ source: 'element:t', target: 'requirement:s' });
  });
});

describe('the graph', () => {
  it('spaces boxes 50 and ranks 50, in the direction the diagram sets, 8 around it', () => {
    const { graph } = lay('requirementDiagram\ndirection LR\nrequirement a {\n}\n');
    expect(graph.direction).toBe('LR');
    expect(graph.spacing).toMatchObject({ node: 50, rank: 50 });
    expect(graph.diagramPadding).toBe(8);
    expect(lay('requirementDiagram\nrequirement a {\n}\n').graph.direction).toBe('TB');
  });

  it('routes as flowchart.curve draws: right angles unless linear or a curve', () => {
    const src = 'requirementDiagram\nrequirement a {\n}\n';
    expect(lay(src).graph.routing).toBe('stepped');
    expect(lay(src, { flowchart: { curve: 'linear' } }).graph.routing).toBe('straight');
    expect(lay(src, { flowchart: { curve: 'basis' } }).graph.routing).toBe('curved');
    expect(lay(src, { flowchart: { curve: 'step' } }).layout.requirement!.curve).toBe('step');
  });

  it('sizes self-loops and port pitch for the markers', () => {
    const { graph } = lay('requirementDiagram\nrequirement a {\n}\na - contains -> a\n');
    expect(graph.metrics!.loop).toBeGreaterThanOrEqual(21);
    expect(graph.metrics!.portPitch).toBeGreaterThanOrEqual(21);
  });

  it('lays out with core layered when the context names no engine', () => {
    const model = modelOf(FULL);
    const layout = layoutRequirement(model, {
      config: resolveConfig(CORE_DEFAULTS),
      measurer: tableMeasurer,
      theme,
      warn: () => {},
    });
    expect(layout.nodes.size).toBe(2);
    expect(layout.edges.size).toBe(1);
  });
});

describe('the style-copy cap (D433)', () => {
  it('ends the layout in the LimitError before measuring anything', () => {
    const model = modelOf(FULL);
    const over = {
      ...model,
      styleCopies: { max: 1_000_000, found: 1_000_001, range: model.requirements[0]!.range },
    };
    let measured = 0;
    let laid = 0;
    const counting: Measurer = {
      ...tableMeasurer,
      width: (...args) => (measured++, tableMeasurer.width(...args)),
    };
    const run = () =>
      layoutRequirement(over, {
        config: resolveConfig(CORE_DEFAULTS),
        measurer: counting,
        theme,
        warn: () => {},
        layout: (g) => (laid++, layered(g)),
      });
    expect(run).toThrow(LimitError);
    expect(run).toThrow(expect.objectContaining({ limit: 'maxLayoutWork', max: 1_000_000 }));
    expect([measured, laid]).toEqual([0, 0]);
    expect(lay(model, undefined, counting).layout.nodes.size).toBe(2);
    expect(measured).toBeGreaterThan(0);
  });
});
