/**
 * `@mermaid-js/diagram-architecture`: the architecture diagram plugin (spec #525), in progress.
 * The runtime entry has the parser and detection, the model and the AST (#599), and the layout
 * (#607), which measures the model and builds the `LayoutGraph` `compass` lays out; the renderer
 * and manifest land with T4 and T5. The lexer and its parity gate's helpers are in
 * `./testing` (#594).
 */
export {
  ARCHITECTURE_ALIGN_MEMBER,
  ARCHITECTURE_ALIGN_REPEAT,
  ARCHITECTURE_ALIGN_SHORT,
  ARCHITECTURE_CONFIG_IGNORED,
  ARCHITECTURE_DUPLICATE_ID,
  ARCHITECTURE_GROUP_EDGE_END,
  ARCHITECTURE_GROUP_EDGE_SAME_GROUP,
  ARCHITECTURE_GROUP_EDGE_UNGROUPED,
  ARCHITECTURE_PARENT_NOT_GROUP,
  ARCHITECTURE_SELF_PARENT,
  ARCHITECTURE_UNKNOWN_ID,
  ARCHITECTURE_UNKNOWN_PARENT,
} from './codes.ts';
export { detectArchitecture, parseArchitecture } from './parser/index.ts';
export type * from './parser/ast.ts';
export { layoutArchitecture, type ArchitectureLayout } from './layout/layout.ts';
export { architectureSizesOf, prepareArchitecture } from './layout/prepare.ts';
export type {
  ArchitectureEdgeView,
  ArchitectureGroupView,
  ArchitectureNodeView,
  ArchitecturePrepared,
} from './layout/prepare.ts';
export type { ArchitectureLayoutContext } from './layout/context.ts';
export {
  ARCHITECTURE_METRICS,
  architectureSizes,
  type ArchitectureSizes,
} from './layout/metrics.ts';
export type { ArchitectureParseOptions, ArchitectureParseResult } from './parser/index.ts';
export type {
  ArchitectureAlignment,
  ArchitectureEdge,
  ArchitectureGroup,
  ArchitectureJunction,
  ArchitectureModel,
  ArchitectureService,
  ArchitectureSide,
} from './model.ts';
