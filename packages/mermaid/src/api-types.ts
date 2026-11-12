/**
 * The public option and result types of the API object (`api.ts` re-exports them).
 */
import type {
  ExtensionPlugin as CoreExtensionPlugin,
  MermaidError,
  Warning,
} from '@mermaid-js/core';
import type { MermaidConfig, ResolvedConfig } from '@mermaid-js/core/config';
import type { ParseResult } from '@mermaid-js/core/parser-kit';
import type { InitializeConfig } from './config-snapshot.ts';

export interface RenderOptions {
  /**
   * Prefix of the ids in the output (`render(id)` passes its id). Without one, the prefix is
   * `mermaid-<hash>`, a stable hash of the source text and the resolved config, so different
   * diagrams on one page get distinct ids and the same input stays byte-identical (R-SVG-3,
   * R-ARCH-6). Pass an `id` to render the same text twice on one page.
   */
  id?: string;
  /** Per-call integrator config, merged over `initialize()`'s. */
  config?: InitializeConfig;
  /** Draw placeholders for missing resources, with a warning, instead of throwing. */
  placeholders?: boolean;
  /**
   * Output format (R-ASCII-4, D80): `svg` (default) or `ascii`, text drawn in character cells
   * for the types whose manifest lists it (`supportsFormat`).
   */
  format?: 'svg' | 'ascii';
  /**
   * Width in px the drawing should fit (R-LAYOUT-5): graph layouts tighten their spacing and
   * may turn LR into TB. Off by default; `mount(…, { availableWidth: true })` passes the
   * element's width. SVG only: text output fits `ascii.maxWidth` columns instead (D84).
   */
  availableWidth?: number;
  /**
   * The instant the diagram treats as now (D270): gantt's `today` line and `today`-relative
   * dates. Defaults to `Date.now()` at each call (D275). Not a config key: diagram text
   * cannot set it.
   */
  now?: number | Date;
}

/** Options of an SVG render (`format` absent or `svg`). */
export interface SvgRenderOptions extends RenderOptions {
  format?: 'svg';
}

/** Options of a text render (R-ASCII-4, D80). */
export interface TextRenderOptions extends RenderOptions {
  format: 'ascii';
  /**
   * Explicit text options for this call (the CLI's `--charset` and `--width`). Each key set here
   * wins over the same `ascii` key from any config, the diagram's front matter and directives
   * included; unset keys fall back to the config as usual.
   */
  ascii?: { charset?: 'unicode' | 'ascii'; padding?: 'compact' | 'roomy'; maxWidth?: number };
}

/**
 * A text render (R-ASCII-4, D80): `\n` line ends, no trailing spaces, byte-deterministic.
 * `columns` is the widest line in cells (a wide character takes 2), `rows` the line count.
 */
export interface TextRenderResult {
  format: 'ascii';
  text: string;
  columns: number;
  rows: number;
  diagramType: string;
  warnings: Warning[];
}

export interface RenderResult {
  svg: string;
  diagramType: string;
  width: number;
  height: number;
  warnings: Warning[];
  /**
   * Set only when a registered extension has an `afterMount` hook (the interactions plugin,
   * DESIGN §12.3): runs those hooks on the element the svg was mounted in. The DOM adapter
   * (`run`/`mount`, #16) calls it after inserting the svg.
   */
  bindFunctions?: (element: Element) => void;
}

/**
 * An extension plugin (DESIGN §12.2): hooks for every diagram type, registered through
 * `registerExternalDiagrams`. `afterMount` runs only in the DOM adapter (`bindFunctions`).
 */
export type ExtensionPlugin = CoreExtensionPlugin<Element, RenderResult>;

/**
 * What `prepare` found: cached so `renderSync` right after does not parse again. The object is the
 * cached one, shared with later renders of the same text: read it, never change it. Only the
 * config is frozen (by `resolveText`).
 */
export interface Prepared {
  readonly diagramType: string;
  readonly config: ResolvedConfig;
  /** The diagram plugin's parse result (model, AST, diagnostics, symbols). */
  readonly parse: ParseResult<unknown>;
  readonly warnings: readonly Warning[];
}

export interface ParseOptions {
  /** Resolve to `false` instead of rejecting when the diagram is invalid. */
  suppressErrors?: boolean;
}

export interface ParseResult12 {
  /** The v12 diagram type, e.g. `flowchart-v2`. */
  diagramType: string;
  /**
   * The config given in front matter and directives, without the integrator-only keys.
   * `theme` keeps v12's type so v12 callers still compile (R-COMPAT-5); a diagram that asks
   * for v13's `theme: 'auto'` reports it as the string `'auto'` all the same.
   */
  config: Omit<MermaidConfig, 'securityLevel' | 'theme'> & { theme?: V12Theme };
  warnings: Warning[];
}

/** The `theme` names v12 declared: every v13 name except `auto`. */
type V12Theme = Exclude<MermaidConfig['theme'], 'auto'>;

export interface PreloadRequest {
  /** Diagram types or plugin ids. */
  types?: readonly string[];
  layouts?: readonly string[];
  themes?: readonly string[];
  /** `'ascii'` also loads each type's text entry, for `renderSync(…, { format: 'ascii' })`. */
  formats?: readonly ('svg' | 'ascii')[];
  /**
   * Runs these packs' loaders (`registerIconPacks`), for `renderSync` with their icons (D294).
   * An unregistered name is ignored; a rejecting loader does not reject (D299).
   */
  iconPacks?: readonly string[];
  /** Loads what a registered math extension provides, for `renderSync` with `$$…$$` (D178). */
  math?: boolean;
}

/** @deprecated v12 compatibility: receives the `MermaidError` of a failed `parse`. */
export type ParseErrorHandler = (error: MermaidError) => void;
