/**
 * JourneyLayout: the plain-data result of the journey custom layout (`layoutKind: 'custom'`,
 * spec #290 §Layout). Lengths are px. Rectangles have their top-left corner at `x`, `y`;
 * circles are given by their centre. Colours are left to the renderer: the layout gives slots.
 */
import type { AstId } from '@mermaid-js/core/parser-kit';
import type { PathData } from '@mermaid-js/core/svg';
import type { MeasuredLabel } from '@mermaid-js/core/text';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Circle {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
}

/** A measured label and the box it is drawn in: the label's own size, at its place. */
export interface PlacedLabel extends Rect {
  readonly text: MeasuredLabel;
}

/** A dot in an actor's colour: in the legend, or on a task. */
export interface ActorDot extends Circle {
  readonly actor: string;
  /** On a task, the AST id of the actor mention it draws (`JourneyTask.mentions`). */
  readonly ast?: AstId;
  /**
   * The actor's place among the named actors (v12 `actor-<n>` class): `actorColours[slot % n]`,
   * or the author's `actor<slot>` theme variable (D249). The `''` actor has none (D244).
   */
  readonly slot: number;
}

/** One actor's legend row: its dot and its name, wrapped to `maxLabelWidth`. */
export interface LegendEntry {
  readonly actor: string;
  readonly dot: ActorDot;
  readonly label: PlacedLabel;
}

/** A run of tasks under one section name: v12 draws one band per run. */
export interface BandLayout extends Rect {
  /** The AST id of the section line that opened the run. */
  readonly ast: AstId;
  /** Index into `JourneyModel.sections` of that line; undefined when the model has none. */
  readonly section?: number;
  readonly name: string;
  /** v12 `section-type-<n>`, cycling over the eight `fillType`s (D241). */
  readonly slot: number;
  /** Undefined for a name with no text. */
  readonly label?: PlacedLabel;
}

/** v12's face mouths, chosen by the score as written: above 3, below 3, else (`NaN` too). */
export type Mouth = 'smile' | 'sad' | 'flat';

export interface FaceLayout extends Circle {
  readonly mouth: Mouth;
  /** The mouth in absolute coordinates: an arc band for a smile or a frown, a line when flat. */
  readonly mouthPath: PathData;
  /** The two eyes. */
  readonly eyes: readonly [Circle, Circle];
}

export interface TaskLayout extends Rect {
  readonly ast: AstId;
  /** Index into `JourneyModel.tasks`. */
  readonly index: number;
  /** Its band's slot; 0 before the first section, as v12 (`task-type-0`). */
  readonly slot: number;
  /** Index into `JourneyLayout.bands` of its band; undefined before the first section. */
  readonly band?: number;
  /** Undefined for a name with no text. */
  readonly label?: PlacedLabel;
  /** The score the face is drawn at: `NaN` at 3, the rest clamped to 0–5 (D226). */
  readonly drawnScore: number;
  /** The dashed line from the task box down to the lowest face place, through the face. */
  readonly line: { readonly x: number; readonly y1: number; readonly y2: number };
  readonly face: FaceLayout;
  /** One per named actor mention, in the order written; none for `''` (D244). */
  readonly dots: readonly ActorDot[];
}

/** The arrow under the tasks. */
export interface ActivityLine {
  readonly y: number;
  readonly x1: number;
  /** Where the stroke ends, under the head. */
  readonly x2: number;
  readonly strokeWidth: number;
  /** The arrowhead as a filled path, its tip at `x2 + strokeWidth` (v12's marker, inlined). */
  readonly head: PathData;
}

export interface JourneyLayout {
  readonly units: 'px';
  /** The named actors, in model order (sorted). */
  readonly legend: readonly LegendEntry[];
  readonly bands: readonly BandLayout[];
  /** One per model task, in model order. */
  readonly tasks: readonly TaskLayout[];
  readonly activity: ActivityLine;
  /** Drawn bold at (`left`, v12's baseline 25). */
  readonly title?: PlacedLabel;
  /** The x tasks start at: `leftMargin`, or past the legend when it is wider (D242). */
  readonly left: number;
  /** What is drawn, `diagramMarginX`/`Y` around it: the SVG `viewBox` (D224). */
  readonly bounds: Rect;
}
