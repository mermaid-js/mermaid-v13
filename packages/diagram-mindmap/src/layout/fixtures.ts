/**
 * Hand-built mindmap models for the layout specs, shaped as the parser produces them (nodes in
 * source order, depth-first, parent and children as indexes), and the contexts they are laid out
 * in. The parser-produced corpus spec is `packages/conformance/src/mindmap/layout.spec.ts`.
 */
import { CORE_DEFAULTS, resolveConfig, type ConfigInput } from '@mermaid-js/core/config';
import type { LayoutEngine } from '@mermaid-js/core/layout';
import { pxProfile } from '@mermaid-js/core/layout';
import type { Measurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type Theme, type ThemeName } from '@mermaid-js/core/theme';
import type { MindmapModel, MindmapNode, MindmapShape } from '../model.ts';
import { mindmapSections } from '../model.ts';
import type { MindmapLayoutContext } from './context.ts';

/** One node of a fixture: its label, shape and depth, and optionally an icon. */
export interface FixtureNode {
  readonly label: string;
  readonly shape?: MindmapShape;
  readonly depth: number;
  readonly icon?: string;
}

/**
 * A model from nodes in source order, each a child of the nearest earlier node one level up
 * (the first node is the root, at depth 0).
 */
export function fixtureModel(nodes: readonly FixtureNode[]): MindmapModel {
  const out: MindmapNode[] = [];
  const open: number[] = [];
  const children: number[][] = nodes.map(() => []);
  nodes.forEach((n, i) => {
    open.length = n.depth;
    const parent = n.depth === 0 ? undefined : open[n.depth - 1];
    if (parent !== undefined) children[parent]!.push(i);
    open.push(i);
    out.push({
      ast: `n:${n.label.trim() || i}${nodes.slice(0, i).some((m) => m.label === n.label) ? `@${i}` : ''}`,
      id: n.label,
      label: n.label,
      shape: n.shape ?? 'default',
      level: n.depth * 2,
      depth: n.depth,
      ...(parent === undefined ? {} : { parent }),
      children: children[i]!,
      classes: [],
      ...(n.icon ? { icon: { text: n.icon, range: { start: 0, end: 0 } } } : {}),
    });
  });
  const sections = mindmapSections(out, 'branch');
  return {
    nodes: out.map((n, i) => (sections[i] === undefined ? n : { ...n, section: sections[i] })),
    colorBy: 'branch',
    warnings: [],
  };
}

/** Every character is 10 px wide; a line is 20 px high. */
export const gridMeasurer: Measurer = {
  id: 'grid-10x20',
  width: (text) => [...text].length * 10,
  metrics: () => ({ ascent: 15, descent: 5, lineHeight: 20 }),
};

/** A fresh theme (one per layout: a theme records the variables read). */
export async function themeNamed(name: ThemeName = 'default'): Promise<Theme> {
  return createTheme(await loadTheme(name), {});
}

/** A layout context for `engine`, with `config` over the defaults. */
export function contextFor(
  engine: LayoutEngine,
  t: Theme,
  config: ConfigInput = {},
  measurer: Measurer = gridMeasurer
): MindmapLayoutContext & { warnings: { code: string; path?: string }[] } {
  const warnings: { code: string; path?: string }[] = [];
  const resolved = resolveConfig(CORE_DEFAULTS, {}, config);
  return {
    config: resolved,
    measurer,
    units: pxProfile,
    theme: t,
    layout: (graph) => engine(graph, { config: resolved }),
    warn: (w) => warnings.push(w),
    warnings,
  };
}
