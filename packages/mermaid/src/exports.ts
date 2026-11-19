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
  type IconifyAlias,
  type IconifyIcon,
  type IconifyJSON,
  type IconPacks,
  type IconPackState,
  type LaidOut,
  type MermaidErrorCode,
  type PluginManifest,
  type Resource,
  type TextRenderContext,
  type Warning,
} from '@mermaid-js/core';
export type { MermaidConfig } from '@mermaid-js/core/config';
export type { FontTable } from '@mermaid-js/core/text';
export type { InitializeConfig, IntegratorOptions, Mermaid } from './api.ts';
export type {
  ExtensionPlugin,
  ParseErrorHandler,
  ParseOptions,
  ParseResult12 as ParseResult,
  Prepared,
  PreloadRequest,
  RenderOptions,
  RenderResult,
  SvgRenderOptions,
  TextRenderOptions,
  TextRenderResult,
} from './api-types.ts';
export type { Mounted, MountOptions, RunOptions } from './dom.ts';
export type { AsyncIconLoader, IconLoader, SyncIconLoader } from './icon-packs.ts';
export type { ExternalDiagram, LayoutLoader, LazyDiagram, ManifestPlugin } from './registry.ts';
