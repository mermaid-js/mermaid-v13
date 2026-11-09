/**
 * The C4 custom layout (spec #522 T3): `layoutC4` and its result type, the path helper the
 * renderer draws relations with, and the metrics table. The invariants are in the package's
 * `./testing` entry.
 */
export { layoutC4, stereotypeText, type C4LayoutContext } from './layout.ts';
export { c4RelationPath, type C4PathCommand } from './path.ts';
export { C4_METRICS } from './metrics.ts';
export { shapeOf } from './shapes.ts';
export type * from './types.ts';
