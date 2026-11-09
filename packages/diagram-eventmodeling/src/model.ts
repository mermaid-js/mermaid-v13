/**
 * The event modeling model (spec #527): what the parser (#602) produces and the layout (#604),
 * the renderer (#606) and the language facet (#609) read. Plain, frozen data in source order
 * (R-ARCH-7). Shared contract of the event modeling tickets: change it only additively, and say
 * so in the run notes (`v13/docs/agents/runs/527/GAPS.md`).
 *
 * Lanes and relations are not here: v12 built them while it laid the boxes out (`getState()`),
 * so they are derived from the frames by `eventModelStructure` (`structure.ts`), which the
 * layout reuses.
 */
import type { AstId, Diagnostic } from '@mermaid-js/core/parser-kit';

/**
 * A frame's kind, in its short form: `ui`, `pcr` (`processor`), `cmd` (`command`), `rmo`
 * (`readmodel`) or `evt` (`event`).
 */
export type EventModelKind = 'ui' | 'pcr' | 'cmd' | 'rmo' | 'evt';

/** Data written inline after a frame or as a `data` or `note` block (D523). */
export interface EventModelData {
  /**
   * The text between the braces or quotes, dedented and trimmed (D523, Pele's `blockText`): what
   * a box shows, in mono. `#name;` codes are their characters, as v12 drew them.
   */
  readonly text: string;
  /** The data type written between backticks before it (`json`, …); v12 ignored it, and so does the drawing. */
  readonly type?: string;
}

export interface EventModelFrame {
  /** The frame id as written, one to three digits (`0`, `00` and `01` are distinct). */
  readonly id: string;
  /** `rf`/`resetframe`: no relation is inferred to it. */
  readonly reset: boolean;
  readonly kind: EventModelKind;
  /** The kind as written (`processor`, `pcr`, …). */
  readonly keyword: string;
  /** The qualified name as written (`Inventory.AddItem`, `a.b.c`). */
  readonly name: string;
  /** The `->>` source ids as written, in order, repeats kept. */
  readonly sources: readonly string[];
  /** The `[[name]]` data reference, defined or not. */
  readonly dataRef?: string;
  /** Inline data (`{ … }`, `"…"`, `'…'`). */
  readonly data?: EventModelData;
  /** `frame:<id>` (D528). */
  readonly astId: AstId;
}

/** `entity Name` (D526: kept, not drawn). */
export interface EventModelEntity {
  /** The qualified name as written. */
  readonly name: string;
  /** `entity:<name>`, `@2`, … for a repeat. */
  readonly astId: AstId;
}

/** `data Name { … }`. Repeats are all kept; a reference reads the first (as v12). */
export interface EventModelDataBlock {
  readonly name: string;
  readonly data: EventModelData;
  /** `data:<name>`, `@2`, … for a repeat (D528). */
  readonly astId: AstId;
}

/** `note 01 { … }` (D526: kept, not drawn). */
export interface EventModelNote {
  /** The frame id as written, defined or not. */
  readonly frame: string;
  readonly data: EventModelData;
  /** `note:<frame>`, `@2`, … for a later note on the same frame (D528). */
  readonly astId: AstId;
}

/** One `<kind> <Name>` line of a `gwt`. */
export interface EventModelGwtStep {
  readonly kind: EventModelKind;
  /** The kind as written. */
  readonly keyword: string;
  /** The entity name as written (an entity may or may not declare it). */
  readonly name: string;
}

/** `gwt 01 given … [when …] then …` (D526: kept, not drawn). */
export interface EventModelGwt {
  /** The frame id as written, defined or not. */
  readonly frame: string;
  readonly given: readonly EventModelGwtStep[];
  /** Empty when there is no `when`. */
  readonly when: readonly EventModelGwtStep[];
  readonly then: readonly EventModelGwtStep[];
  /** `gwt:<frame>`, `@2`, … (D528). */
  readonly astId: AstId;
}

export interface EventModel {
  /** Frames in source order: the order of the time line. */
  readonly frames: readonly EventModelFrame[];
  readonly entities: readonly EventModelEntity[];
  readonly dataBlocks: readonly EventModelDataBlock[];
  readonly notes: readonly EventModelNote[];
  readonly gwts: readonly EventModelGwt[];
  /**
   * The last in-text `title` with its keyword stripped (D524) if non-empty, else the
   * front-matter `title` (D218); absent when neither. v12 parsed it and never drew it.
   */
  readonly title?: string;
  /** The AST id of the `title` statement the title comes from; absent for a front-matter title. */
  readonly titleAstId?: AstId;
  /** The last `accTitle`, keyword and `:` stripped (D524); `''` when none. */
  readonly accTitle: string;
  /** The last `accDescr`, keyword stripped (D524); `''` when none. */
  readonly accDescr: string;
  /** The parser's warnings (D525), also in the parse result's diagnostics. */
  readonly warnings: readonly Diagnostic[];
}
