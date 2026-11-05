/**
 * Core pipeline: the diagram plugin contract, the render context, typed errors, the error
 * image, the synchronous draw step, extension hooks and plugin manifests (DESIGN §3, §11,
 * §12.1, §12.2). Imports nothing.
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
export {
  drawDiagram,
  drawText,
  type AsciiHook,
  type DrawHooks,
  type Drawn,
} from './pipeline/draw.ts';
export {
  HookRunner,
  type ExtensionClaim,
  type ExtensionNeed,
  type ExtensionPlugin,
  type ExtensionResources,
  type HookContext,
  type HookRun,
  type LaidOut,
  type ResourceRequest,
} from './pipeline/extensions.ts';
export {
  readManifest,
  type DiagramManifest,
  type ExtensionManifest,
  type LayoutManifest,
  type PluginFormat,
  type PluginManifest,
} from './pipeline/manifest.ts';
export type {
  DiagramParseContext,
  DiagramPlugin,
  RenderContext,
  TextRenderContext,
  Warning,
} from './pipeline/types.ts';
