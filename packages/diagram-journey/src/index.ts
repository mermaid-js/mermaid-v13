/**
 * `@mermaid-js/diagram-journey`: the user journey diagram plugin (spec #290): the model type and
 * the layout. The parser (T2), renderer (T4) and the plugin export and manifest (T5) follow.
 */
export type * from './model.ts';
export {
  journeyLayoutViolations,
  journeyMetrics,
  layoutJourney,
  type JourneyLayout,
  type JourneyLayoutContext,
} from './layout/index.ts';
export type * from './layout/types.ts';
