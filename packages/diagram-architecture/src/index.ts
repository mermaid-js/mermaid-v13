/**
 * `@mermaid-js/diagram-architecture`: the architecture diagram plugin (spec #525), in progress.
 * The runtime entry has the plugin (`architecture`, #614), the parser and detection, the model and
 * the AST (#599), the layout (#607), which measures the model and builds the `LayoutGraph`
 * `compass` lays out, and the SVG renderer with its icons and theme table (#614); the manifest
 * lands with T5. The lexer, its parity gate's helpers and the render harness are in `./testing`.
 */
export { architecture } from './plugin.ts';
export { architectureIcons, architectureLabels } from './icons.ts';
export { renderArchitecture } from './render/render.ts';
export type { ArchitectureRenderContext } from './render/context.ts';
export { ICON_NOT_RENDERED } from './render/assets.ts';
export {
  ARCHITECTURE_ARROW_SHRUNK,
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
export { prepareArchitecture } from './layout/prepare.ts';
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
