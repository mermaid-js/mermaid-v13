/**
 * Flowchart diagram plugin. Imports `@mermaid-js/core` only.
 */
export { flowchartConfigDefaults } from './generated/config-defaults.ts';
export {
  detectFlowchart,
  flowchartTokens,
  FlowTokenKind,
  JISON_NAMES,
  parseFlowchart,
} from './parser/index.ts';
export type * from './parser/index.ts';
export { flowchart } from './plugin.ts';
