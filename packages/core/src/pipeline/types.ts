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
import type { OutlinePaint } from '../svg/types.ts';
import type { SvgFragment, SvgWriter } from '../svg/writer.ts';
import type { SecurityLevel } from '../svg/url.ts';
import type { InlineSpans } from '../text/inline.ts';
import type { Measurer } from '../text/measurer.ts';
import type { Theme } from '../theme/theme.ts';
import type { Resource } from './errors.ts';
import type { IconPacks } from './icon-packs.ts';

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
  /**
   * The instant the diagram treats as now, in ms since the epoch (D270): `RenderOptions.now`,
   * or the clock the `mermaid` API read at the call (D275). Core never reads the clock.
   */
  readonly now?: number;
  /**
   * `RenderOptions.availableWidth` in the profile's units (R-LAYOUT-5, D272), for a custom
   * layout; `ctx.layout()` already passes it to the graph engine. Absent unless asked for.
   */
  readonly availableWidth?: number;
  /** Integrator-only limits (R-SEC-5): `resolveLimits(initialize config, limits option)`. */
  readonly limits: Limits;
  /**
   * The API object's icon packs (D294), for an icons extension's hooks: a view without the
   * loader `ResourceRequest.iconPacks` has, so a draw cannot start one (R-ARCH-6).
   */
  readonly iconPacks?: IconPacks;
  /**
   * The extensions' inline-box providers for this render (D177), for `layoutLabel`'s `inline`
   * option. In text output it boxes nothing: every span is shown as written, with one
   * `ASCII_DROPPED` warning per feature (D179).
   */
  readonly inline?: InlineSpans;
  /**
   * The extensions' glyphs (D293), for icons a diagram draws outside labels (flowchart icon
   * shapes, mindmap `::icon()`): `name` as written (`fa:bell`), drawn in a `size` px square at
   * the origin (the provider fits it, xMidYMid meet); `null` when an extension reported it
   * unresolved (and warns `ICON_NOT_RENDERED`, D291); `undefined` when none has it (or it is a
   * placeholder). Asked with `pending: true`, a placeholder is `'pending'` instead (an extension
   * has the glyph, but its data is still loading, D299), so `undefined` is only a name no
   * extension has. Absent when no extension has `glyphs`, and in text output.
   */
  readonly icon?: IconLookup;
  warn(warning: Warning): void;
}

/** {@link RenderContext.icon}: `'pending'` (a placeholder) only for a caller that asks for it. */
export interface IconLookup {
  (
    name: string,
    size: number,
    options: GlyphOptions & { readonly pending: true }
  ): SvgFragment | 'pending' | null | undefined;
  (name: string, size: number, options?: GlyphOptions): SvgFragment | null | undefined;
}

/** How {@link RenderContext.icon} resolves a name. */
export interface IconOptions {
  /** The pack a name without a prefix comes from (v12's `fallbackPrefix`); none when absent. */
  readonly fallbackPrefix?: string;
}

/** How {@link RenderContext.icon} resolves and paints a glyph. */
export interface GlyphOptions extends IconOptions {
  /**
   * What the glyph's `currentColor` paints take (D298): a colour, which the provider sets as the
   * glyph's `color`, or the render's gradient (`url(#…)`), which it puts in place of each
   * `currentColor` fill and stroke. Absent, they stay `currentColor`.
   */
  readonly paint?: OutlinePaint;
}

/**
 * An icon a diagram draws outside labels ({@link DiagramPlugin.icons}): its name as written, or
 * that name with the `fallbackPrefix` the diagram passes to {@link RenderContext.icon} for it.
 */
export type DiagramIcon = string | ({ readonly name: string } & IconOptions);

/**
 * What a diagram's `ascii` hook gets (DESIGN §6.3, D82): the render context, laid out in
 * cells (`units.id === 'cell'`, the cell measurer), plus the front-matter title and the AST.
 */
export interface TextRenderContext extends RenderContext {
  /** The front-matter `title`; a hook prints it centred on the first line (D82). */
  readonly title?: string;
  /** The parse's AST, for the AST ids of drop warnings. */
  readonly ast?: AstNode;
}

/** A diagram plugin (DESIGN §12.1). `M` is its model, `L` its layout. */
export interface DiagramPlugin<M = unknown, L = unknown> {
  /** Also the config section that holds its options (`flowchart`). */
  readonly id: string;
  readonly aliases?: readonly string[];
  /**
   * v12's detector contract (DESIGN §12.1): the text with front matter, directives and `%%`
   * comments removed, and the integrator's config.
   */
  detector(text: string, config?: Readonly<Record<string, unknown>>): boolean;
  /** Output formats; `['svg']` when absent. */
  readonly formats?: readonly ('svg' | 'ascii')[];
  readonly layoutKind: 'graph' | 'custom';
  /**
   * The layout engine a graph diagram is drawn with (D284): `default` when no config layer sets
   * `layout`, and in place of an unknown or uninstalled one; `aliases` map `layout` names (v12's)
   * to engines before lookup. A first-party engine other than `layered` (`tree`) is reached only
   * by plugins that name it here (D285). Without it, `layered`.
   */
  readonly layoutEngine?: {
    readonly default: string;
    readonly aliases?: Readonly<Record<string, string>>;
  };
  /** Its config section's defaults. */
  readonly configDefaults?: Readonly<Record<string, unknown>>;
  /** `text` is the whole source; every range is into it. Never throws. */
  parse(text: string, ctx: DiagramParseContext): ParseResult<M, AstNode>;
  /** Resources the parsed diagram needs beyond the plugin and the layout engine. */
  resources?(parse: ParseResult<M, AstNode>, config: ResolvedConfig): readonly Resource[];
  /**
   * Every text the layout hands to core's label layout for `model`, as written (D176, D178).
   * An extension that loads an engine for a delimiter (math's `$$`) scans these instead of
   * every string the parse holds, so a `$$` in a tooltip or URL loads nothing.
   */
  labels?(model: M): readonly string[];
  /**
   * Every icon name the layout draws outside labels for `model`, as written (`fa:bell`, D293):
   * flowchart icon shapes, mindmap `::icon()`, each with the fallback pack it is drawn with, if any.
   * Label icons are in `labels()`. An icons extension reads them through `ResourceRequest.icons`
   * to load only the packs a diagram names.
   */
  icons?(model: M): readonly DiagramIcon[];
  layout?(model: M, ctx: RenderContext): L;
  /** Writes the whole `<svg>` document. */
  render(model: M, layout: L, ctx: RenderContext, w: SvgWriter): void;
  /**
   * Text output (D76): the drawing as text, `\n` line ends, no trailing spaces. First-party
   * plugins ship it as a separate lazily loaded entry (manifest key `ascii`) instead.
   */
  ascii?(model: M, layout: L, ctx: TextRenderContext): string;
}
