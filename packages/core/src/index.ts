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
/** The block nesting limit (ADR-15), shared with the editor through the parser kit. */
export { MAX_BLOCK_DEPTH, openerRange, tooDeep } from './parser-kit/embed-depth.ts';
export {
  drawDiagram,
  drawText,
  type AsciiHook,
  type DrawHooks,
  type Drawn,
  type EdgeStep,
} from './pipeline/draw.ts';
export {
  HookRunner,
  type ActiveOutline,
  type ExtensionClaim,
  type ExtensionNeed,
  type ExtensionPlugin,
  type ExtensionResources,
  type GlyphProvider,
  type GlyphRequest,
  type HookContext,
  type HookRun,
  type LaidOut,
  type OutlineDrawer,
  type ResourceRequest,
  someString,
} from './pipeline/extensions.ts';
export type {
  IconifyAlias,
  IconifyIcon,
  IconifyJSON,
  IconPacks,
  IconPackSource,
  IconPackState,
} from './pipeline/icon-packs.ts';
export {
  readManifest,
  type DiagramManifest,
  type ExtensionManifest,
  type LayoutManifest,
  type PluginFormat,
  type PluginManifest,
} from './pipeline/manifest.ts';
export type {
  DiagramIcon,
  DiagramParseContext,
  DiagramPlugin,
  GlyphOptions,
  IconLookup,
  IconOptions,
  EmbeddedDiagram,
  EmbeddedText,
  RenderContext,
  TextRenderContext,
  Warning,
} from './pipeline/types.ts';
