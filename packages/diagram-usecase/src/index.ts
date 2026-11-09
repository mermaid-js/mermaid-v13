/**
 * `@mermaid-js/diagram-usecase`: the usecase diagram plugin (spec #517). A graph
 * type (`layoutKind: 'graph'`, laid out by `ctx.layout ?? layered`). This entry has the parser
 * (#563): `parseUsecase(text, { preprocessed })` gives the {@link UsecaseModel}, the AST,
 * diagnostics, symbols and statement spans. `layoutUsecase(model, ctx)` (#565) measures it and
 * lays it out with `ctx.layout ?? layered`; `renderUsecase` (#566) draws it, and `usecase` is the
 * plugin with its theme table and config defaults, which `mermaid` loads through its generated
 * registry (#567). The lexer, its parity gate's helpers, the layout invariants and the render
 * harness are in `./testing`; the language facet is `./language`.
 */
export { usecase } from './plugin.ts';
export { renderUsecase } from './render/index.ts';
export type { UsecaseRenderContext } from './render/index.ts';
export { detectUsecase, parseUsecase } from './parser/index.ts';
export type { UsecaseParseOptions, UsecaseParseResult } from './parser/index.ts';
export type * from './parser/ast.ts';
export type * from './model.ts';
export * from './codes.ts';
export { layoutUsecase } from './layout/layout.ts';
export type { UsecaseLayout, UsecaseLayoutContext } from './layout/layout.ts';
export { isOval, prepareUsecase, relationText } from './layout/prepare.ts';
export type {
  ActorView,
  BoundaryView,
  JsonRowView,
  JsonTableView,
  NoteEdgeView,
  NoteView,
  RelationEdgeView,
  UsecaseEdgeKind,
  UsecaseEdgeView,
  UsecaseNodeView,
  UsecasePrepared,
  UseCaseView,
} from './layout/prepare.ts';
export { fontWeight, USECASE_CONFIG_DEFAULTS, usecaseLayoutConfig } from './config.ts';
export type { ConfigFont, UsecaseLayoutConfig } from './config.ts';
