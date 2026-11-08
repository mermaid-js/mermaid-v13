/**
 * The Wardley map model (spec #430): what the parser (#489) produces and the layout (#490) and
 * renderer (#493) read. Plain, frozen data (R-ARCH-7), resolved as v12's `wardleyParser.ts` and
 * `wardleyBuilder.ts` populated their builder: each list holds its statements in source order,
 * and the nodes are in v12's map order (anchors, then components, then pipeline children, each
 * kept at its first position when a later statement merges into it). Shared contract of the
 * wardley tickets: change it only additively, and say so in the run notes
 * (`v13/docs/agents/runs/430/GAPS.md`).
 *
 * **Coordinates.** Every position is a percentage, 0 to 100, as v12 stored it: a value written
 * as at most 1 is a fraction (`0.5` is 50, `1.0` is 100), a larger one is a percentage already
 * (`1.5` is 1.5, D428). `x` is evolution (left to right), `y` visibility (bottom to top); the
 * text writes `[visibility, evolution]`. A value above 100 is an error
 * (`WARDLEY_OUT_OF_RANGE`) and is kept here as 100, so the model stays drawable.
 */
import type { AstId, Diagnostic } from '@mermaid-js/core/parser-kit';

/** A component's `(build)`, `(buy)`, `(outsource)` or `(market)`. */
/**
 * A coordinate as the model holds it (v12 `toPercent`): up to 1 a fraction of the axis, above
 * it a percentage; outside 0–100 out of range (`WARDLEY_OUT_OF_RANGE`) and kept as 100.
 */
export function toPercent(value: number): { percent: number; inRange: boolean } {
  const percent = value <= 1 ? value * 100 : value;
  return percent < 0 || percent > 100
    ? { percent: 100, inRange: false }
    : { percent, inRange: true };
}

export type WardleyStrategy = 'build' | 'buy' | 'outsource' | 'market';

/** Which way a link's flow arrow points (`+>`, `+<`, `+<>`, `+'label'>` …). */
export type WardleyFlow = 'forward' | 'backward' | 'bidirectional';

/** What made the node, as v12's `className`. */
export type WardleyNodeClass = 'anchor' | 'component' | 'pipeline-component';

/**
 * One map node: an `anchor`, a `component` or a component inside a `pipeline`. Statements with
 * the same id merge into one node, as v12's `addNode` did: the later one sets the label,
 * position, class, inertia and strategy; the label offsets fall back to the earlier ones.
 */
export interface WardleyNode {
  /** The name as written (converted), or `<parent>_<name>` for a pipeline child, as v12's ids. */
  readonly id: string;
  /** The name as written (converted). */
  readonly label: string;
  /** Evolution, 0–100. */
  readonly x: number;
  /** Visibility, 0–100. A pipeline child has its parent's. */
  readonly y: number;
  readonly className: WardleyNodeClass;
  /** `label [x, y]`: the label's offset in px; absent when no statement for the node set one. */
  readonly labelOffsetX?: number;
  readonly labelOffsetY?: number;
  /** `inertia` or `(inertia)` on the last component statement for the node. */
  readonly inertia: boolean;
  /** The strategy of the last component statement for the node. */
  readonly sourceStrategy?: WardleyStrategy;
  /** Added by a `pipeline` block (also after a later block for its parent replaced it). */
  readonly inPipeline: boolean;
  /** The parent of a `pipeline` block. */
  readonly isPipelineParent: boolean;
  /** The AST id of the node's first statement (`node:<id>`), which the drawn node carries. */
  readonly astId: AstId;
}

/** One link `A -> B`, kept whether or not its ends name nodes (D425). */
export interface WardleyLink {
  /** The node id the source name resolves to (by id, then by the first label), else the name. */
  readonly source: string;
  readonly target: string;
  /** `-.->`. */
  readonly dashed: boolean;
  /** The `+'label'` of the arrow, else the `; label` after the link. */
  readonly label?: string;
  /** From the source's port, else the target's port, else the arrow's `+'…'` form. */
  readonly flow?: WardleyFlow;
  /** `link:<a>-><b>` with the names as written. */
  readonly astId: AstId;
}

/** `evolve A 0.8`: the last one per node wins, at the first one's position. */
export interface WardleyTrend {
  readonly nodeId: string;
  /** The target evolution, 0–100. */
  readonly targetX: number;
  /** The node's visibility when the trend was read (v12: the final one). */
  readonly targetY: number;
  /** The AST id of the `evolve` statement that won. */
  readonly astId: AstId;
}

/** `pipeline P { … }`: a later block for the same parent replaces this one's children. */
export interface WardleyPipeline {
  readonly nodeId: string;
  /** The children's node ids (`<parent>_<name>`), in order. */
  readonly componentIds: readonly string[];
  /** The AST id of the block that won (`pipeline:<id>`, `@2` for a repeat). */
  readonly astId: AstId;
}

/** `note "text" [visibility, evolution]`. */
export interface WardleyNote {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly astId: AstId;
}

/** `annotation 1, [visibility, evolution] "text"`: duplicates of a number are all kept. */
export interface WardleyAnnotation {
  readonly number: number;
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly astId: AstId;
}

/** `accelerator Name [visibility, evolution]` or `deaccelerator …`. */
export interface WardleyAccelerator {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly astId: AstId;
}

/** `evolution A -> B -> C`: the last statement wins. */
export interface WardleyEvolution {
  /** Stage labels: the name trimmed, or `<name> / <second name>`, both trimmed. */
  readonly stages: readonly string[];
  /** The `@n` of the stages that have one, raw (fractions, not clamped), in order. */
  readonly boundaries: readonly number[];
  readonly astId: AstId;
}

export interface WardleyModel {
  /** v12's map order: anchors, components, pipeline children; merged nodes stay at their first. */
  readonly nodes: readonly WardleyNode[];
  readonly links: readonly WardleyLink[];
  /** One per node, at its first `evolve`, with the last one's target. */
  readonly trends: readonly WardleyTrend[];
  /** One per parent, at its first block, with the last block's children. */
  readonly pipelines: readonly WardleyPipeline[];
  readonly notes: readonly WardleyNote[];
  readonly annotations: readonly WardleyAnnotation[];
  /** The first `annotations [visibility, evolution]`, as a position. */
  readonly annotationsBox?: { readonly x: number; readonly y: number; readonly astId: AstId };
  readonly accelerators: readonly WardleyAccelerator[];
  readonly deaccelerators: readonly WardleyAccelerator[];
  /** The last `evolution`; absent when there is none (the layout draws v12's default stages). */
  readonly evolution?: WardleyEvolution;
  /** The last `size [width, height]`, in px; absent when there is none. */
  readonly size?: { readonly width: number; readonly height: number; readonly astId: AstId };
  /** The last in-text `title` if non-empty, else the front-matter `title` (D218); absent when neither. */
  readonly title?: string;
  /** The AST id of the `title` statement the title comes from; absent for a front-matter title. */
  readonly titleAstId?: AstId;
  /** The last `accTitle: …` (`''` when none). */
  readonly accTitle: string;
  /** The last `accDescr …` (`''` when none). */
  readonly accDescr: string;
  /** Warning diagnostics of the parse (also in `ParseResult.diagnostics`). */
  readonly warnings: readonly Diagnostic[];
}
