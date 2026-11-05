/**
 * QuadrantModel: the plain-data result of a quadrant chart parse (spec #289 §Parser), and the
 * input of the quadrant layout.
 *
 * Shared contract (run notes GAPS.md): #332 (T3) lands the type, #301 (T2) adopts it and may
 * extend it additively. Text is kept as written, trimmed as v12's DB trims it, never sanitised;
 * `<br>`, entities and markdown are resolved when labels are laid out (D225).
 *
 * What the parser guarantees, as v12's DB did:
 * - the last `quadrant-N` and `title` wins. An axis statement sets the labels it names:
 *   `x-axis A` sets only `start`, so an earlier `x-axis B --> C` keeps `end: C` (v12's `setData`
 *   merge). `x-axis Low -->` stores `start: 'Low ⟶'`;
 * - points are in source order (R-ARCH-7), duplicate names kept. v12's `addPoints` prepends, so
 *   parity normalisers reverse the oracle's list;
 * - every style value has passed v12's checks (`radius` `^\d+$`, colours
 *   `^#?([\dA-Fa-f]{6}|[\dA-Fa-f]{3})$`, `stroke-width` `^\d+px$`); a bad one is a diagnostic,
 *   not a model value;
 * - an overridden statement (a repeated `quadrant-N`, `title` or axis) draws nothing, so it has
 *   no slot here; its AST node gets `st:<ordinal>`;
 * - coordinates are the lexed text, unconverted. The lexer's rule `(1)|(0(.\d+)?)` lets `0x5` and
 *   `0a5` through; the layout converts them and leaves out a point that is not in [0, 1] (D226).
 */
import type { AstId, Diagnostic } from '@mermaid-js/core/parser-kit';

/** A label as written: plain and quoted text are `markdown: false`, a markdown string is `true`. */
export interface QuadrantText {
  readonly text: string;
  readonly markdown: boolean;
}

/**
 * A point's or a class's styles, validated. Absent keys fall back: inline, then class, then the
 * config and theme (`pointRadius`, `quadrantPointFill`, no stroke width).
 */
export interface QuadrantStyles {
  /** `radius: 10`, in px. */
  readonly radius?: number;
  /** `color: #ff0000`, as written: `ff0000` keeps its missing `#` here (the layout adds it, D235). */
  readonly color?: string;
  /** `stroke-color: …`, as written. */
  readonly strokeColor?: string;
  /** `stroke-width: 3px`, in px. */
  readonly strokeWidth?: number;
}

export interface QuadrantPoint {
  /** `pt:<name>`; `pt:<name>@2` for the second point of that name, and so on. */
  readonly ast: AstId;
  readonly label: QuadrantText;
  /** The name after `:::`, when given. An unknown class is ignored at layout. */
  readonly className?: string;
  /** The coordinates as lexed (`'0.3'`, `'1'`, `'0x5'`). */
  readonly x: string;
  readonly y: string;
  /** Inline styles; they win over the class's, key by key. */
  readonly styles: QuadrantStyles;
}

export interface QuadrantClass {
  /** `c:<name>`. */
  readonly ast: AstId;
  readonly styles: QuadrantStyles;
}

export interface QuadrantLabel extends QuadrantText {
  /** `q:1`…`q:4`. */
  readonly ast: AstId;
}

export interface QuadrantAxis {
  /**
   * `ax:x` or `ax:y`: the start label's id. The end label's id is this with `/end` (`ax:x/end`,
   * `ax:y/end`), so each drawn label has its own `data-ast` (pitfall 12).
   */
  readonly ast: AstId;
  /** The text before `-->`: the x axis's left label, the y axis's bottom label. */
  readonly start?: QuadrantText;
  /** The text after `-->`: the x axis's right label, the y axis's top label. */
  readonly end?: QuadrantText;
}

/** The four quadrant labels, `quadrant-1` at index 0. */
export type QuadrantLabels = readonly [
  QuadrantLabel | undefined,
  QuadrantLabel | undefined,
  QuadrantLabel | undefined,
  QuadrantLabel | undefined,
];

export interface QuadrantModel {
  /**
   * The title shown: the last in-text `title`, else the front-matter `title` (D218; v12 set the
   * front-matter one before parsing). An empty string shows no title, as in v12.
   */
  readonly title?: string;
  /** The AST id of the in-text `title` statement (`st:<ordinal>`), when there is one. */
  readonly titleAst?: AstId;
  readonly accTitle: string;
  readonly accDescr: string;
  readonly quadrants: QuadrantLabels;
  readonly xAxis?: QuadrantAxis;
  readonly yAxis?: QuadrantAxis;
  /** Source order. */
  readonly points: readonly QuadrantPoint[];
  /** The last `classDef` of each name wins; classes may follow their points. */
  readonly classes: ReadonlyMap<string, QuadrantClass>;
  /** Warning diagnostics of the parse (also in `ParseResult.diagnostics`). */
  readonly warnings: readonly Diagnostic[];
}
