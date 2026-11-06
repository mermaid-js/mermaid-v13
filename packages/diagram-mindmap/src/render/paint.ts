/**
 * The theme variables the mindmap renderer reads (D152, D288): v12 `styles.ts` translated into
 * variables, with no theme name and no `look` (D153).
 *
 * - The classic rules: section `n` fills `cScale<n+1>` with `cScaleLabel<n+1>` text and a
 *   `cScaleInv<n+1>` rule under a plain node; the root fills `git0` with `gitBranchLabel0` text.
 * - `mindmapOutlinedNodes` (v12 look neo): an outline at `strokeWidth` in the fill's
 *   `cScale` slot and the theme's `dropShadow`; the root's label `cScaleLabel0`. Under the
 *   gradient every node fills `mainBkg` with a gradient outline, and no rule is drawn.
 * - `mindmapRoundedNodes` with it (v12's redux rules): the root fills `mainBkg` with `nodeBorder`
 *   text, and where the theme carries no `borderColorArray` (v12 redux and redux-dark, never
 *   by name, theming.md) every node takes `mainBkg` with a `nodeBorder` outline and text.
 * - `mindmapBorderEdges` with it: edges in `nodeBorder`, else their section's `cScale` slot.
 *
 * Palettes are literal colours; `mainBkg`, `nodeBorder`, `strokeWidth` and `dropShadow` are the
 * theme's variables, all read before the root is written so it declares their aliases.
 */
import type { RenderContext } from '@mermaid-js/core';
import type { OutlinePaint, Paint } from '@mermaid-js/core/svg';

type Theme = RenderContext['theme'];
type Length = ReturnType<Theme['length']>;
type Shadow = ReturnType<Theme['filter']>;
type PaletteName = Parameters<Theme['palette']>[0];

/** v12 `MAX_SECTIONS`: slot 0 is the root's, sections take 1–11. */
const SLOTS = 12;
/** v12 `.section-<n> line { stroke-width: 3 }`. */
const RULE_WIDTH = 3;
/** v12 `.edge { stroke-width: 3 }`, where no `.edge-depth-<d>` rule gives a width. */
const EDGE_WIDTH = 3;
/** v12 writes `.edge-depth-<d>` for `d` up to 10 (`i < THEME_COLOR_LIMIT`, `d = i − 1`). */
const LAST_DEPTH = SLOTS - 2;

/** How a node is painted. */
export interface NodePaint {
  readonly fill: OutlinePaint;
  /** Undefined: no outline (v12 classic). */
  readonly stroke?: OutlinePaint;
  readonly strokeWidth?: Length;
  /** The theme's shadow on outlined nodes; undefined when none is drawn. */
  readonly filter?: Shadow;
  /** The label's fill, and the icon's: its glyph's colour or its reference as written (D297). */
  readonly text: Paint;
  /** The rule under a plain node (v12 `.section-<n> line`); undefined where none is drawn. */
  readonly rule?: Paint;
  readonly ruleWidth: number;
}

export interface EdgePaint {
  readonly stroke: Paint;
  readonly width: number;
}

export interface Paints {
  /** The root (`undefined`) or section `section`. */
  node(section: number | undefined): NodePaint;
  /** An edge into a node of `section`, of v12's class `edge-depth-<depth>`. */
  edge(section: number, depth: number): EdgePaint;
  /** `radius`: the rounded shape's corner (v12 `roundedRect.ts`), geometry (D152). */
  readonly radius: number;
  /** Plain nodes are flat-bottomed (v12 neo `defaultMindmapNode.ts`). */
  readonly flat: boolean;
}

/**
 * v12's edge widths for `.edge-depth-<d>`: classic `17 − 3i` at `i = d + 1` (a width of 0 or
 * less is dropped by the browser), neo `max(10 − 2d, 2)`; `.edge`'s 3 past depth 10.
 */
export function edgeWidth(outlined: boolean, depth: number): number {
  if (depth > LAST_DEPTH) return EDGE_WIDTH;
  const w = outlined ? Math.max(10 - 2 * depth, 2) : 14 - 3 * depth;
  return w > 0 ? w : EDGE_WIDTH;
}

/** The palette slot of the root (`undefined`) or a section. */
const slotOf = (section: number | undefined): number =>
  section === undefined ? 0 : ((section % (SLOTS - 1)) + 1) % SLOTS;

export function paints(theme: Theme): Paints {
  const flag = (name: string): boolean => theme.value(name) === 'true';
  const rounded = flag('mindmapRoundedNodes');
  const outlined = flag('mindmapOutlinedNodes');
  const borderEdges = outlined && flag('mindmapBorderEdges');
  const gradient = theme.gradient() !== undefined;
  // v12 redux and redux-dark exactly: the redux rules where the theme colours nothing per item.
  const mono = outlined && rounded && theme.palette('borderColorArray').length === 0;
  const refs = new Map<string, Paint>();
  const named = (name: string): Paint => {
    let ref = refs.get(name);
    if (ref === undefined) refs.set(name, (ref = theme.color(name)));
    return ref;
  };
  const lists = new Map<PaletteName, readonly Paint[]>();
  const slot = (name: PaletteName, k: number, fallback: string): Paint => {
    let list = lists.get(name);
    if (list === undefined) lists.set(name, (list = theme.palette(name)));
    return list.length > 0 ? list[k % list.length]! : named(fallback);
  };
  const outline = outlined && gradient ? theme.outline('nodeBorder') : undefined;
  const strokeWidth = outlined ? theme.length('strokeWidth') : undefined;
  const filter =
    outlined && theme.value('dropShadow') !== 'none' ? theme.filter('dropShadow') : undefined;

  const nodeOf = (k: number): NodePaint => {
    const root = k === 0;
    const rule = gradient ? undefined : slot('cScaleInv', k, 'nodeBorder');
    const scale = (): Paint => slot('cScale', k, 'mainBkg');
    const label = (): Paint => slot('cScaleLabel', k, 'nodeBorder');
    if (!outlined)
      return {
        fill: root ? slot('git', 0, 'mainBkg') : scale(),
        text: root ? slot('gitBranchLabel', 0, 'nodeBorder') : label(),
        rule,
        ruleWidth: RULE_WIDTH,
      };
    const plain = root ? rounded : mono;
    let fill: OutlinePaint;
    if (gradient || plain) fill = named('mainBkg');
    else fill = root ? slot('git', 0, 'mainBkg') : scale();
    return {
      fill,
      stroke: outline ?? (mono ? named('nodeBorder') : scale()),
      strokeWidth,
      filter,
      text: plain ? named('nodeBorder') : label(),
      rule,
      ruleWidth: RULE_WIDTH,
    };
  };
  // Every paint now, so the root's style declares each alias they use.
  const nodes = Array.from({ length: SLOTS }, (_, k) => nodeOf(k));
  const edges = Array.from({ length: SLOTS }, (_, k) =>
    borderEdges ? named('nodeBorder') : slot('cScale', k, 'mainBkg')
  );
  return {
    node: (section) => nodes[slotOf(section)]!,
    edge: (section, depth) => ({
      stroke: edges[slotOf(section)]!,
      width: edgeWidth(outlined, depth),
    }),
    radius: theme.number('radius'),
    flat: outlined,
  };
}
