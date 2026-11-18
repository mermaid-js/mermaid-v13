/**
 * The roughjs options of each outline role (H2, #296 "Roles and v12 options"), from v12 at
 * fa796a943: `userNodeOverrides` and `solidStateFill` (shapes/handDrawnShapeStyles.ts), the
 * cluster shapes (clusters.js) and the edge path (edges.js). Fixed in M4: no config keys, no theme
 * variables (Q2). `strokeWidth` and `strokeLineDash` come from the leaf (`sketch`).
 */
import type { Attrs, OutlineRole } from '@mermaid-js/core/svg';
import type { SketchOptions } from './sketch.ts';

/** v12 `userNodeOverrides`: every node shape, and the pieces and lines drawn with it. */
export const NODE: SketchOptions = {
  roughness: 0.7,
  fillStyle: 'hachure',
  fillWeight: 1.5,
  hachureGap: 1.5,
};

/** v12 cluster `rect` (subgraph, namespace, ER subgraph): `userNodeOverrides`, fillWeight 3. */
export const GROUP: SketchOptions = { ...NODE, fillWeight: 3 };

/**
 * v12 `roundedWithTitle` (a state composite's title band and body): a solid fill, roughjs's
 * defaults otherwise. v12 drew the body at roughjs's default roughness 1 and the title band at
 * 0.7; both are 0.7 here, as roughness 1 reaches `Math.random` (D304).
 */
export const COMPOSITE: SketchOptions = {
  roughness: 0.7,
  fillStyle: 'solid',
  fillWeight: -1,
  hachureGap: -1,
};

/**
 * An edge label's box (D630, no v12 counterpart: v12 never sketched it): the border sketched as
 * a node's outline, the fill plain (solid, never hachure), as a state composite's.
 */
export const LABEL: SketchOptions = { ...COMPOSITE };

/** v12 `solidStateFill`: state start and end, choice, fork and join. */
export const MARK: SketchOptions = {
  roughness: 0.7,
  fillStyle: 'hachure',
  fillWeight: 1.5,
  hachureGap: 1.5,
  hachureAngle: 120,
};

/** v12 `edges.js`: `rc.path(d, { roughness: 0.3 })`, roughjs's defaults otherwise, no fill. */
export const EDGE: SketchOptions = {
  roughness: 0.3,
  fillStyle: 'hachure',
  fillWeight: -1,
  hachureGap: -1,
};

/** A state composite's two parts (`outer` title band, `inner` body), by their v13 classes. */
const COMPOSITE_PART = /^(?:outer|inner)$/;

/** The options an outline is sketched with. */
export function optionsFor(role: OutlineRole, attrs: Attrs): SketchOptions {
  switch (role) {
    case 'group':
      return GROUP;
    case 'mark':
      return MARK;
    case 'edge':
      return EDGE;
    case 'label':
      return LABEL;
    case 'part':
      return COMPOSITE_PART.test(attrs.class ?? '') ? COMPOSITE : NODE;
    case 'node':
    case 'divider':
      return NODE;
  }
}
