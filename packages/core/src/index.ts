/**
 * Core pipeline: the diagram plugin contract, the render context, typed errors, the error
 * image and the synchronous draw step (DESIGN §3, §11, §12.1). Imports nothing.
 */
export {
  errorFromDiagnostics,
  MermaidError,
  NotLoadedError,
  UnsupportedFormatError,
  type MermaidErrorCode,
  type MermaidErrorInit,
  type Resource,
} from './pipeline/errors.ts';
export { renderErrorSvg, type ErrorSvgContext } from './pipeline/error-svg.ts';
export { drawDiagram, type Drawn } from './pipeline/draw.ts';
export type {
  DiagramParseContext,
  DiagramPlugin,
  RenderContext,
  Warning,
} from './pipeline/types.ts';
