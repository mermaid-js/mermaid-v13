/**
 * Flowchart's swimlane lane drawing and warnings (spec #528, D536), a lazily loaded entry of its
 * own, so a plain flowchart loads none of it (R-PERF-1). `mermaid`'s `swimlane` loader is
 * `engine()`; a host that registers the swimlane engine itself passes it through `withLanes`.
 */
import type * as Swimlane from '@mermaid-js/core/layout/swimlane';
import { withLanes } from './render/lanes.ts';

export { withLanes };

type SwimlaneModule = typeof Swimlane;

/** Core's swimlane engine module, with flowchart's lane drawing installed. */
export const engine = (): Promise<SwimlaneModule> =>
  import('@mermaid-js/core/layout/swimlane').then(withLanes);
