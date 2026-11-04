/** The exports `mermaid` and `mermaid/slim` share: errors, plugin and API types. */
export {
  MermaidError,
  NotLoadedError,
  renderErrorSvg,
  UnsupportedFormatError,
  readManifest,
  type DiagramPlugin,
  type ExtensionClaim,
  type HookContext,
  type LaidOut,
  type MermaidErrorCode,
  type PluginManifest,
  type Resource,
  type TextRenderContext,
  type Warning,
} from '@mermaid-js/core';
export type { MermaidConfig } from '@mermaid-js/core/config';
export {
  type ExtensionPlugin,
  type InitializeConfig,
  type IntegratorOptions,
  type Mermaid,
  type ParseErrorHandler,
  type ParseOptions,
  type ParseResult12 as ParseResult,
  type Prepared,
  type PreloadRequest,
  type RenderOptions,
  type RenderResult,
  type SvgRenderOptions,
  type TextRenderOptions,
  type TextRenderResult,
} from './api.ts';
export type { Mounted, MountOptions, RunOptions } from './dom.ts';
export type { ExternalDiagram, LayoutLoader, LazyDiagram, ManifestPlugin } from './registry.ts';
