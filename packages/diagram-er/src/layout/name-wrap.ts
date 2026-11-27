// Where an entity's name wraps, per unit profile (#1226, D751). v12 drew an entity with no
// attributes with `drawRect`, whose label wrapped at `flowchart.wrappingWidth` (120 by default);
// v13 reads `er.wrappingWidth` instead. An entity with attributes keeps its name on one line.
import { fromPx, type UnitProfile } from '@mermaid-js/core/layout';
import type { ConfigLength } from '@mermaid-js/shared/config/readers';
import { erConfigDefaults } from '../generated/config-defaults.ts';

/**
 * The width the name of an entity with no attributes wraps at: `er.wrappingWidth` in px. In
 * cells only a value the author set converts; the default (120 px) gives the cell profile's own
 * wrap width, and a value equal to the default counts as not set (D124).
 */
export function nameWrap(units: UnitProfile, length: ConfigLength): number {
  const fallback = erConfigDefaults.wrappingWidth;
  const px = length('wrappingWidth') ?? fallback;
  // The schema gives the key a default, so `px` is set; the type cannot say so.
  if (units.grid === undefined) return px ?? Infinity;
  return px === undefined || px === fallback ? units.builder.wrapWidth : fromPx(units, px, 'x');
}
