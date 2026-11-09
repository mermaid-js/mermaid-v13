// cspell:words markerless
/**
 * The usecase rules below a statement (#563): names and their suffixes (`actorItem`,
 * `entityName`, metadata, stereotypes, classes) and relations (`relationTail`, `arrow`), as
 * v12's `usecase.parser.ts` has them. Where Chevrotain chose with more than one token (the
 * separators of a multi-line `@{ … }`, a `--` label), the decision is v12's.
 */
import { DASH, Kind } from '@mermaid-js/core/parser-kit';
import type { Range } from '@mermaid-js/core/parser-kit';
import type { UsecaseArrowType, UsecaseRelationshipType, UsecaseShape } from '../model.ts';
import type { LabelDraft, MetadataDraft, PropertyDraft } from './drafts.ts';
import { STOP, STOP_IN_METADATA, UsecaseReader } from './reader.ts';
import {
  AFTER_BACK_LABEL,
  AFTER_COMMA,
  AFTER_DASH_LABEL,
  AFTER_DASH_LABEL_SET,
  AFTER_NEWLINE,
  ARROWS,
  INCLUDE_EXTEND,
  INCLUDE_EXTEND_SET,
  LABEL_PART,
  NAMES,
  PROPERTY_KEY_SET,
  PROPERTY_KEYS,
  PROPERTY_VALUE_SET,
  PROPERTY_VALUES,
} from './tables.ts';
import { generatedId } from './text.ts';
import { LABEL_TEXT, T } from './tokens.ts';

/** A name as written: an id, a text in quotes or a Markdown text. */
export interface NameRead {
  id: string;
  label: LabelDraft;
  /** The id, or the text between the quotes. */
  range: Range;
  generated: boolean;
  /** A `(…)` / `[…]` label. */
  labelRange?: Range;
}

/** `entityName` / `actorItem`: a name and its suffixes. */
export interface ItemRead extends NameRead {
  shape?: UsecaseShape;
  metadata?: MetadataDraft;
  stereotype?: string;
  classes: string[];
  /** It declares the element: a label, metadata or a stereotype. */
  explicit: boolean;
  /** The source range of the whole item. */
  span: Range;
}

export interface ArrowRead {
  type: UsecaseRelationshipType;
  arrowType: UsecaseArrowType;
  label?: LabelDraft;
  labelRange?: Range;
  minlen: number;
  range: Range;
}

export interface TailRead {
  edgeId?: { id: string; range: Range };
  arrow: ArrowRead;
  target: ItemRead;
  /** From the edge id or the arrow to the end of the target (v12's relation location). */
  range: Range;
}

/** The arrow type a `-- label` closes with. */
const CLOSED_BY: Readonly<Record<number, UsecaseArrowType>> = {
  [T.ForwardSolid]: 'point',
  [T.ForwardCircle]: 'circle',
  [T.ForwardCross]: 'cross',
  [T.MarkerlessSolid]: 'line',
};
/** The arrow type of a backward operator. */
const BACKWARD: Readonly<Record<number, UsecaseArrowType>> = {
  [T.BackwardSolid]: 'reversedPoint',
  [T.BackwardCircle]: 'reversedCircle',
  [T.BackwardCross]: 'reversedCross',
};

export abstract class ItemReader extends UsecaseReader {
  /** Per token, the first token at or after it that is not a label part (-1: not computed). */
  private labelRun: Int32Array | undefined;

  // ---- rules: names and items ---------------------------------------------------------

  /** A quoted or Markdown token's label: the text between the quotes. */
  protected quotedLabel(j: number): { label: LabelDraft; range: Range } {
    const markdown = this.kind(j) === T.MarkdownString;
    const trim = markdown ? 2 : 1;
    const r = this.range(j);
    return {
      label: { raw: this.raw(j, trim), type: markdown ? 'markdown' : 'text' },
      range: { start: r.start + trim, end: Math.max(r.start + trim, r.end - trim) },
    };
  }

  /** `ID ('(' label ')' [ '[' label ']' ])? | STR | MD`; `brackets` allows `[ … ]`. */
  protected name(brackets: boolean): NameRead & { shape?: UsecaseShape } {
    const k = this.kind();
    if (k === T.Identifier) {
      const j = this.i++;
      const range = this.range(j);
      const id = this.raw(j);
      const open = this.kind();
      if (open === T.LParen || (brackets && open === T.LBracket)) {
        this.i++;
        const read = this.nodeLabel(open === T.LParen ? T.RParen : T.RBracket);
        this.expect(open === T.LParen ? T.RParen : T.RBracket);
        return {
          id,
          label: read.label,
          range,
          generated: false,
          labelRange: read.range,
          shape: open === T.LParen ? 'ellipse' : 'rect',
        };
      }
      return { id, label: { raw: id, type: 'text' }, range, generated: false };
    }
    if (k === T.PlainString || k === T.MarkdownString) {
      const { label, range } = this.quotedLabel(this.i++);
      return { id: generatedId(label.raw), label, range, generated: true };
    }
    this.fail(NAMES);
  }

  /**
   * `nodeLabel: STR | MD | LABEL_TEXT+` before `close`. An unquoted label is the text from its
   * first token to its last, blanks between them included.
   */
  protected nodeLabel(close: number): { label: LabelDraft; range: Range } {
    const k = this.kind();
    if (k === T.PlainString || k === T.MarkdownString) {
      const read = this.quotedLabel(this.i);
      this.i++;
      return read;
    }
    if (LABEL_TEXT[k] !== 1) this.fail([...NAMES, T.Number, close]);
    const first = this.i;
    while (LABEL_TEXT[this.kind()] === 1) this.i++;
    const last = this.i - 1;
    return {
      label: { raw: this.rawSpan(first, last), type: 'text' },
      range: { start: this.range(first).start, end: this.range(last).end },
    };
  }

  /** `actorItem` / `entityName`: a name, then metadata, a stereotype and classes, in that order. */
  protected item(entity: boolean): ItemRead {
    const start = this.range().start;
    const name = this.name(entity);
    const read: ItemRead = { ...name, classes: [], explicit: false, span: { start, end: 0 } };
    if (!entity) delete read.shape;
    if (this.kind() === T.MetadataStart) read.metadata = this.metadata();
    if (this.kind() === T.StereotypeStart) read.stereotype = this.stereotype();
    if (this.kind() === T.ClassSeparator) read.classes = this.classSuffix();
    read.explicit =
      read.shape !== undefined || read.metadata !== undefined || read.stereotype !== undefined;
    read.span.end = this.end();
    return read;
  }

  /**
   * `'@{' NEWLINE* ( property ( separator property )* ','? NEWLINE* )? '}'`. An error inside
   * stops with {@link STOP_IN_METADATA}, so recovery skips through the `}`.
   */
  protected metadata(): MetadataDraft {
    try {
      return this.metadataBody();
    } catch (error) {
      if (error === STOP) throw STOP_IN_METADATA;
      throw error;
    }
  }

  private metadataBody(): MetadataDraft {
    this.i++;
    const properties: PropertyDraft[] = [];
    this.skipNewlines();
    if (PROPERTY_KEY_SET[this.kind()] === 1) {
      properties.push(this.property());
      while (this.separatorAhead()) {
        this.separator();
        properties.push(this.property());
      }
      if (this.kind() === T.Comma) this.i++;
      this.skipNewlines();
    }
    this.expect(T.RBrace, this.kind() === T.Comma ? 'a `,` separates two properties' : undefined);
    return { properties };
  }

  /**
   * Whether a separator and another property follow, as v12's parser decided it with three
   * tokens: `,` and a key, `,` and line breaks and a key, a line break and a key or `,`, …;
   * `,` and two line breaks, or three line breaks, count as a separator although `}` may follow.
   */
  protected separatorAhead(): boolean {
    const k1 = this.kind();
    const k2 = this.kind(this.i + 1);
    const k3 = this.kind(this.i + 2);
    if (k1 === T.Comma) {
      if (AFTER_COMMA[k2] === 1) return true;
      return k2 === Kind.Newline && (k3 === Kind.Newline || AFTER_COMMA[k3] === 1);
    }
    if (k1 === Kind.Newline) {
      if (AFTER_NEWLINE[k2] === 1) return true;
      return k2 === Kind.Newline && (k3 === Kind.Newline || AFTER_NEWLINE[k3] === 1);
    }
    return false;
  }

  /** `',' NEWLINE* | NEWLINE+ ','? NEWLINE*` */
  protected separator(): void {
    if (this.kind() === T.Comma) {
      this.i++;
      this.skipNewlines();
      return;
    }
    this.skipNewlines();
    if (this.kind() === T.Comma) this.i++;
    this.skipNewlines();
  }

  /** `(ID | STR) ':' (ID | STR | 'true' | 'false')` */
  protected property(): PropertyDraft {
    const keyAt = this.expectOne(PROPERTY_KEY_SET, PROPERTY_KEYS);
    this.expect(T.Colon);
    const valueAt = this.expectOne(
      PROPERTY_VALUE_SET,
      PROPERTY_VALUES,
      this.kind() === T.LabelSymbol || this.kind() === T.CssIdentifier
        ? 'a value is a word of letters, digits and `_`, `true`, `false`, or a text in quotes'
        : undefined
    );
    const quoted = (j: number) => this.kind(j) === T.PlainString;
    const vk = this.kind(valueAt);
    let value: string | boolean = this.raw(valueAt, quoted(valueAt) ? 1 : 0);
    if (vk === T.True || vk === T.False) value = vk === T.True;
    const r = this.range(keyAt);
    const range = quoted(keyAt) ? { start: r.start + 1, end: r.end - 1 } : r;
    return { key: this.raw(keyAt, quoted(keyAt) ? 1 : 0), value, range };
  }

  /** `'<<' STEREOTYPE_TEXT '>>'`: the text, trimmed. */
  protected stereotype(): string {
    this.i++;
    const j = this.expect(
      T.StereotypeText,
      this.kind() === T.StereotypeEnd ? 'a stereotype has a text, such as `<<Human>>`' : undefined
    );
    this.expect(T.StereotypeEnd);
    return this.raw(j).trim();
  }

  /** `':::' ID (',' ID)*` */
  protected classSuffix(): string[] {
    this.i++;
    return this.commaList(() => this.raw(this.expect(T.Identifier)));
  }

  // ---- rules: relations ---------------------------------------------------------------

  /** `(ID '@')? arrow entityName` */
  protected relationTail(): TailRead {
    const start = this.range().start;
    let edgeId: TailRead['edgeId'];
    if (this.kind() === T.Identifier && this.kind(this.i + 1) === T.At) {
      edgeId = { id: this.raw(this.i), range: this.range() };
      this.i += 2;
    }
    const arrow = this.arrow();
    const target = this.item(true);
    const tail: TailRead = { arrow, target, range: { start, end: this.end() } };
    if (edgeId) tail.edgeId = edgeId;
    return tail;
  }

  /** v12's `arrow`: the eight operators and the labelled forms. */
  protected arrow(): ArrowRead {
    const j = this.i;
    const k = this.kind();
    const start = this.range().start;
    let read: Omit<ArrowRead, 'range'>;
    if (k === T.DependencyArrow) read = this.dependency();
    else if (k === T.Generalization) {
      this.i++;
      read = { type: 'generalization', arrowType: 'point', minlen: 1 };
    } else if (k === T.ForwardSolid) {
      this.i++;
      read = { type: 'association', arrowType: 'point', minlen: this.minlen(j) };
    } else if (k === T.ForwardCircle || k === T.ForwardCross) {
      this.i++;
      read = { type: 'association', arrowType: CLOSED_BY[k] ?? 'circle', minlen: 1 };
    } else if (k === T.MarkerlessSolid) read = this.dashes(j);
    else if (BACKWARD[k] !== undefined) read = this.backward(j, k);
    else this.fail(ARROWS, this.arrowHint());
    return { ...read, range: { start, end: this.end() } };
  }

  /** `'..>' ':' ('include' | 'extend')`, any case: the label is the lower-case word. */
  private dependency(): Omit<ArrowRead, 'range'> {
    this.i++;
    this.expect(T.Colon, 'write `..> : include` or `..> : extend`');
    const word = this.expectOne(INCLUDE_EXTEND_SET, INCLUDE_EXTEND);
    const type = this.kind(word) === T.Include ? 'include' : 'extend';
    return {
      type,
      arrowType: 'point',
      label: { raw: type, type: 'text' },
      labelRange: this.range(word),
      minlen: 1,
    };
  }

  /** `--` (`---`, …), or exactly `--` with a label closed by `-->`, `--`, `--o` or `--x`. */
  private dashes(j: number): Omit<ArrowRead, 'range'> {
    this.i++;
    if (this.raw(j) !== '--' || !this.labelAhead(AFTER_DASH_LABEL)) {
      return { type: 'association', arrowType: 'line', minlen: this.minlen(j) };
    }
    const read = this.nodeLabel(T.ForwardSolid);
    const last = this.expectOne(AFTER_DASH_LABEL_SET, AFTER_DASH_LABEL);
    const arrowType = CLOSED_BY[this.kind(last)] ?? 'line';
    const minlen = arrowType === 'point' || arrowType === 'line' ? this.minlen(last) : 1;
    return { type: 'association', arrowType, label: read.label, labelRange: read.range, minlen };
  }

  /** `<--` (`<---`, …), `o--`, `x--`; exactly `<--`, `o--` or `x--` may take a label and `--`. */
  private backward(j: number, k: number): Omit<ArrowRead, 'range'> {
    this.i++;
    const arrowType = BACKWARD[k] ?? 'reversedPoint';
    const solid = k === T.BackwardSolid;
    if ((solid && this.raw(j) !== '<--') || !this.labelAhead(AFTER_BACK_LABEL)) {
      return { type: 'association', arrowType, minlen: solid ? this.minlen(j) : 1 };
    }
    const read = this.nodeLabel(T.MarkerlessSolid);
    const last = this.expect(T.MarkerlessSolid);
    const minlen = solid ? this.minlen(last) : 1;
    return { type: 'association', arrowType, label: read.label, labelRange: read.range, minlen };
  }

  protected arrowHint(): string | undefined {
    const k = this.kind();
    if (k === T.Identifier && this.kind(this.i + 1) !== T.At) {
      return 'an id before an arrow is followed by `@`, as `A e1@--> B`';
    }
    if (k === T.Dash) return 'an arrow has at least two dashes, as `-->`';
    return undefined;
  }

  /** v12's `solidMinlen`: dashes − 1, at least 1. */
  protected minlen(j: number): number {
    let dashes = 0;
    const text = this.raw(j);
    for (let p = 0; p < text.length; p++) if (text.charCodeAt(p) === DASH) dashes++;
    return Math.max(1, (dashes || 2) - 1);
  }

  /**
   * v12's `hasLabeledRight`: label tokens from the cursor on, and then one of `close`. The first
   * token after each run of label tokens is found once (R-PARSE-7: v12 scanned again per `--`).
   */
  protected labelAhead(close: readonly number[]): boolean {
    const j = this.i;
    if (LABEL_PART[this.kind(j)] !== 1) return false;
    return close.includes(this.kind(this.labelRunEnd(j)));
  }

  /** The first token at or after `j` that is not a label part; each run is scanned once. */
  protected labelRunEnd(j: number): number {
    const memo = (this.labelRun ??= new Int32Array(this.t.length + 1).fill(-1));
    let e = j;
    let stop = -1;
    while (LABEL_PART[this.kind(e)] === 1) {
      const known = memo[e] ?? -1;
      if (known >= 0) {
        stop = known;
        break;
      }
      e++;
    }
    if (stop < 0) stop = e;
    for (let p = j; p < e; p++) memo[p] = stop;
    return stop;
  }
}
