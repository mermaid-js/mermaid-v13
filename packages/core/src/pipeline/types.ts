/**
 * The diagram plugin contract and the per-render context (DESIGN §3, §12.1).
 */
import type { ResolvedConfig } from '../config/resolve.ts';
import type { LayoutGraph, LayoutModel } from '../layout/types.ts';
import type { UnitProfile } from '../layout/units.ts';
import type { Limits } from '../limits/index.ts';
import type { AstNode } from '../parser-kit/ast.ts';
import type { ParseResult } from '../parser-kit/result.ts';
import type { PreprocessResult } from '../preprocess/preprocess.ts';
import type { SvgWriter } from '../svg/writer.ts';
import type { SecurityLevel } from '../svg/url.ts';
import type { Measurer } from '../text/measurer.ts';
import type { Theme } from '../theme/theme.ts';
import type { Resource } from './errors.ts';

/** A problem that did not stop the render, as returned in `RenderResult.warnings`. */
export interface Warning {
  readonly code: string;
  readonly message: string;
  /** Config key path, for config warnings. */
  readonly path?: string;
  /** Where a config value came from (`initialize`, `frontMatter`, `directive`). */
  readonly source?: string;
  /** Text output (D82): the feature kind an `ASCII_DROPPED` warning is about. */
  readonly feature?: string;
  /** Text output (D82): the shapes an `ASCII_SHAPE` warning lists. */
  readonly shapes?: readonly string[];
  /** AST ids of what the warning is about (`ASCII_DROPPED`, `ASCII_SHAPE`, `ASCII_ROUTE`). */
  readonly astIds?: readonly string[];
}

/** What `parse` gets: the frozen config and the source already preprocessed. */
export interface DiagramParseContext {
  readonly config: ResolvedConfig;
  readonly preprocessed: PreprocessResult;
  /** Features extension plugins handle (e.g. `callbacks`). */
  readonly claims?: readonly string[];
  /** Integrator limits (R-SEC-5) the parse enforces (edges, nodes, depth); defaults when absent. */
  readonly limits?: Limits;
}

/**
 * One render's context (DESIGN §3). Created per call; everything but the warning sink is
 * read-only. It is the only thing layout and render receive.
 */
export interface RenderContext {
  readonly config: ResolvedConfig;
  readonly measurer: Measurer;
  /** Lengths for layout (D77): `pxProfile` for SVG, a cell profile for ASCII. */
  readonly units: UnitProfile;
  /** One render's theme: it records the variables used, so it is never shared. */
  readonly theme: Theme;
  /** The level resolved once per render from `config.securityLevel` (D75). */
  readonly securityLevel: SecurityLevel;
  /** Prefix of every id the output writes. */
  readonly idPrefix: string;
  /** Written as `data-mermaid-version`. */
  readonly version: string;
  /** Integrator link schemes for URLs (default http, https, mailto). */
  readonly linkSchemes?: readonly string[];
  /** The layout engine named by `layout` config. */
  layout(graph: LayoutGraph): LayoutModel;
  /** Integrator-only limits (R-SEC-5): `resolveLimits(initialize config, limits option)`. */
  readonly limits: Limits;
  warn(warning: Warning): void;
}

/** A diagram plugin (DESIGN §12.1). `M` is its model, `L` its layout. */
export interface DiagramPlugin<M = unknown, L = unknown> {
  /** Also the config section that holds its options (`flowchart`). */
  readonly id: string;
  readonly aliases?: readonly string[];
  /** Whole source in, as the registry's first-party table detects it otherwise. */
  detector(text: string): boolean;
  /** Output formats; `['svg']` when absent. */
  readonly formats?: readonly ('svg' | 'ascii')[];
  readonly layoutKind: 'graph' | 'custom';
  /** Its config section's defaults. */
  readonly configDefaults?: Readonly<Record<string, unknown>>;
  /** `text` is the whole source; every range is into it. Never throws. */
  parse(text: string, ctx: DiagramParseContext): ParseResult<M, AstNode>;
  /** Resources the parsed diagram needs beyond the plugin and the layout engine. */
  resources?(parse: ParseResult<M, AstNode>, config: ResolvedConfig): readonly Resource[];
  layout?(model: M, ctx: RenderContext): L;
  /** Writes the whole `<svg>` document. */
  render(model: M, layout: L, ctx: RenderContext, w: SvgWriter): void;
}
