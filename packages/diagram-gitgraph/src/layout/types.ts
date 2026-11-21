/**
 * GitLayout: the plain-data result of the gitGraph custom layout (`layoutKind: 'custom'`, spec
 * #292 T3). Lengths are px; rectangles have their top-left corner at `x`, `y`. What v12 drew
 * with a `transform` keeps it as a {@link Transform}, so the renderer writes the same one and
 * the bounds take the corners it moves.
 */
import type { AstId } from '@mermaid-js/core/parser-kit';
import type { FontKey } from '@mermaid-js/core/text';
import type { Rect } from '@mermaid-js/shared/layout';
import type { GitCommitType, GitDirection } from '../model.ts';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export type { Rect };

/** SVG `translate(dx, dy) rotate(angle, cx, cy)`: rotate about (cx, cy), then move. */
export interface Transform {
  readonly dx: number;
  readonly dy: number;
  /** Degrees, clockwise on screen. */
  readonly angle: number;
  readonly cx: number;
  readonly cy: number;
}

/**
 * Plain text (D268): lines as written, no markup, measured in the font it is drawn in
 * (pitfall 16). The box is the text's own; line `i`'s baseline is at
 * `y + baseline + i * lineHeight`. Only branch names have more than one line (D263).
 */
export interface GitText extends Rect {
  readonly lines: readonly string[];
  readonly font: FontKey;
  readonly lineHeight: number;
  /** From the top of a line to its baseline. */
  readonly baseline: number;
}

export interface Segment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/** A branch name's box at the start of its lane. */
export interface GitBranchLabel {
  readonly box: Rect;
  /** The box's corner radius. */
  readonly radius: number;
  readonly text: GitText;
}

/** One lane per model branch, in drawing order. */
export interface GitLane {
  readonly branch: string;
  /** Index into `GitModel.branches` and `GitLayout.lanes`: the colour slot's source (D267). */
  readonly index: number;
  /** The lane's position across the commit axis: y in LR, x in TB and BT (v12 `branchPos`). */
  readonly pos: number;
  /** The dashed branch line, with `showBranches`. */
  readonly line?: Segment;
  /** The branch name, with `showBranches`. */
  readonly label?: GitBranchLabel;
}

/** The commit id in its box. */
export interface GitCommitLabel {
  readonly box: Rect;
  readonly text: GitText;
  /** With `rotateCommitLabel`: applied to the box and the text. */
  readonly transform?: Transform;
}

/** A tag: a flag-shaped polygon with a hole, and its text. */
export interface GitTagLayout {
  /** The tag as written. */
  readonly tag: string;
  readonly points: readonly Point[];
  readonly hole: Point & { readonly r: number };
  readonly text: GitText;
  /** TB/BT: the polygon's and the hole's transform, and the text's. */
  readonly transform?: Transform;
  readonly textTransform?: Transform;
}

export interface GitCommitLayout {
  readonly id: string;
  readonly ast: AstId;
  readonly seq: number;
  readonly branch: string;
  /** Index into `GitLayout.lanes`. */
  readonly lane: number;
  /** The bullet's centre. */
  readonly x: number;
  readonly y: number;
  /** What the bullet is drawn as: a merge's `type:` if it has one, else its type. */
  readonly symbol: GitCommitType;
  /** The bullet's radius (half a highlight square's side). */
  readonly radius: number;
  /** The id label: absent for a cherry-pick, a merge without `id:`, or `showCommitLabel: false`. */
  readonly label?: GitCommitLabel;
  /** In source order; the last is nearest the commit. */
  readonly tags: readonly GitTagLayout[];
}

/** A path command: move, line, or a quarter arc (`A r r, 0, 0, sweep, x y`). */
export type PathCommand =
  | { readonly op: 'M' | 'L'; readonly x: number; readonly y: number }
  | {
      readonly op: 'A';
      readonly r: number;
      readonly sweep: 0 | 1;
      readonly x: number;
      readonly y: number;
    };

/** One arrow per parent, from the parent's centre to the commit's. */
export interface GitArrow {
  /** The parent's id and the commit's. */
  readonly from: string;
  readonly to: string;
  /** The lane whose colour it takes (v12's rules: the commit's, or the source's). */
  readonly lane: number;
  /** Whether it goes round a commit in the way, on a free lane. */
  readonly rerouted: boolean;
  readonly path: readonly PathCommand[];
}

export interface GitLayout {
  readonly direction: GitDirection;
  readonly lanes: readonly GitLane[];
  /** By `seq`. */
  readonly commits: readonly GitCommitLayout[];
  /** By commit, then parent, in model order; no arrow for a self-parent (D264). */
  readonly arrows: readonly GitArrow[];
  /** The arrows' stroke width, and the branch lines'. */
  readonly arrowWidth: number;
  readonly lineWidth: number;
  /** Centred over the drawing, its baseline `titleTopMargin` above 0 (D265). */
  readonly title?: GitText;
  /** Everything drawn, `diagramPadding` around it: the SVG `viewBox` (D224). */
  readonly bounds: Rect;
}
