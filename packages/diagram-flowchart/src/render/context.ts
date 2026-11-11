import type { ResolvedConfig } from '@mermaid-js/core/config';
import type { Limits } from '@mermaid-js/core/limits';
import type { LayoutGraph, LayoutModel, UnitProfile } from '@mermaid-js/core/layout';
import type { EmbeddedSvg, OutlinePaint, SecurityLevel } from '@mermaid-js/core/svg';
import type { InlineSpans, Measurer, SvgFragment } from '@mermaid-js/core/text';
import type { Theme } from '@mermaid-js/core/theme';

/** A warning the renderer raises (style, URL and link-target checks, unavailable icons). */
export interface FlowWarning {
  readonly code: string;
  readonly message: string;
  /** Config key path, for config warnings. */
  readonly path?: string;
  /** Text output (D82): the feature kind an `ASCII_DROPPED` warning is about. */
  readonly feature?: string;
  /** Text output (D82): the shapes an `ASCII_SHAPE` warning lists. */
  readonly shapes?: readonly string[];
  /** AST ids of what the warning is about. */
  readonly astIds?: readonly string[];
}

/**
 * What the flowchart's layout and render stages read (DESIGN §3 `RenderContext`). The
 * pipeline's `RenderContext` satisfies it structurally.
 */
export interface FlowRenderContext {
  readonly config: ResolvedConfig;
  readonly measurer: Measurer;
  /** Lengths for layout (D77): `pxProfile` for SVG, a cell profile for ASCII. Defaults to px. */
  readonly units?: UnitProfile;
  /** One render's theme: it records the variables used, so it is never shared. */
  readonly theme: Theme;
  warn(warning: FlowWarning): void;
  /** Integrator limits (R-SEC-5); the parse took its caps from the same object. */
  readonly limits?: Limits;
  /** The layout engine named by `layout` config. Defaults to core's `layered`. */
  layout?(graph: LayoutGraph): LayoutModel;
  /**
   * The part of the drawing this render's layout brings (`layoutParts`): swimlane lanes, a
   * `LaneDrawerFactory`. `unknown`, as core's `RenderContext` has it; anything but a function
   * draws plain subgraphs.
   */
  readonly layoutPart?: unknown;
  /** Prefix of the root's only ids, `${idPrefix}-title` and `${idPrefix}-desc` (R-A11Y-1). */
  readonly idPrefix?: string;
  /** Written as `data-mermaid-version`. */
  readonly version?: string;
  /** Resolved once per render by the pipeline (D75); `default` when absent. */
  readonly securityLevel?: SecurityLevel;
  /** Integrator link schemes for `click` URLs (default http, https, mailto). */
  readonly linkSchemes?: readonly string[];
  /** The render's inline-box providers (D177), handed to every label; text output boxes none. */
  readonly inline?: InlineSpans;
  /**
   * The embedded diagram blocks (ADR-15), rendered by `mermaid` before the draw, by block id.
   * Absent when the plugin is called directly: a block is then drawn as a stand-in frame.
   */
  readonly embed?: (
    id: string
  ) => { readonly width: number; readonly height: number; readonly svg: EmbeddedSvg } | undefined;
  /** A folded block's inner type, by block id (#670); absent when the plugin is called directly. */
  readonly foldedType?: (id: string) => string | undefined;
  /**
   * Text output: the blocks (ADR-15) drawn as text by `mermaid` before the draw, by block id,
   * `columns` × `rows` cells. Absent when the plugin is called directly: a block is then a box
   * with its title.
   */
  readonly embedText?: (
    id: string
  ) => { readonly text: string; readonly columns: number; readonly rows: number } | undefined;
  /**
   * The extensions' glyphs (D293): an icon shape's glyph fitted into a `size` square at the
   * origin, its `currentColor` painted with `paint` (D298); `null` when an extension reported it
   * unresolved (it warns `ICON_NOT_RENDERED`); `'pending'` for a placeholder (D299), as flowchart
   * asks for it; `undefined` when none has it. Absent without an extension that has glyphs.
   */
  readonly icon?: (
    name: string,
    size: number,
    options: { readonly paint: OutlinePaint; readonly pending: true }
  ) => SvgFragment | 'pending' | null | undefined;
}
