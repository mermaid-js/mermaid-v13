/**
 * `@mermaid-js/diagram-radar/testing`: what the conformance gates read and a render never does,
 * kept out of the runtime entry so that chunk stays small (D217): the layout invariants, for the
 * parser-produced corpus spec (#446's merge adds it).
 */
export { radarLayoutViolations } from './layout/index.ts';
