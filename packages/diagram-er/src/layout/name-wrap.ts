// Where an entity's name wraps, per unit profile (#1226). v12 draws an entity with no
// attributes with `drawRect`, whose label wraps at `flowchart.wrappingWidth` (120 by default);
// an entity with attributes keeps its name on one line (`erBox`).
import type { UnitProfile } from '@mermaid-js/core/layout';

/** v12's wrap width, in px, for the name of an entity with no attributes. */
export const PX_NAME_WRAP = 120;

/**
 * The width the name of an entity with no attributes wraps at. Text output keeps every name on
 * one line, as mermaid-ascii draws it.
 */
export function nameWrap(units: UnitProfile): number {
  return units.grid === undefined ? PX_NAME_WRAP : Infinity;
}
