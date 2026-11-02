/**
 * Public mermaid API (DESIGN §3): render, prepare, renderSync, preload, parse, initialize,
 * detectType, supportsFormat and the register functions. The v12 `mermaidAPI` object is
 * removed (R-API-5). `run` and `mount` (the DOM adapter) come with #16.
 */
import { createMermaid } from './api.ts';

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
  type Warning,
} from '@mermaid-js/core';
export type { MermaidConfig } from '@mermaid-js/core/config';
export {
  createMermaid,
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
} from './api.ts';
export type { ExternalDiagram, LayoutLoader, LazyDiagram, ManifestPlugin } from './registry.ts';

const mermaid = createMermaid();

export const {
  render,
  prepare,
  renderSync,
  preload,
  parse,
  initialize,
  detectType,
  supportsFormat,
  registerExternalDiagrams,
  registerLayoutLoaders,
  registerIconPacks,
  setParseErrorHandler,
} = mermaid;

export default mermaid;
