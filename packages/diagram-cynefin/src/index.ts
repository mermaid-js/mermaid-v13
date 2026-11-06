/**
 * `@mermaid-js/diagram-cynefin` (spec #423). T3 (#467): the custom layout. The plugin object
 * lands in T4 (#468), the manifest in T5 (#469). The layout invariants and v12's boundary
 * generator, which only the conformance gates read, are at `./testing`.
 */
export type {
  CynefinDomain,
  CynefinDomainName,
  CynefinItem,
  CynefinModel,
  CynefinTransition,
} from './model.ts';
export { layoutCynefin } from './layout/index.ts';
export type { CynefinLayout, CynefinLayoutContext } from './layout/index.ts';
