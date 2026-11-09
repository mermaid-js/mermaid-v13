/**
 * The C4 model as v12's DB (`c4Db.ts`) builds it, statement by statement: what each macro's
 * arguments set, by slot or by name, the merges, and the D452/D457 changes (see `model.ts`).
 * Aliases and relation pairs are indexed by `Map`, so each statement costs the same however many
 * came before it (R-PARSE-7). The parser hands each macro's arguments here and places the AST
 * nodes; this module holds no grammar.
 */
import type { AstId, ParseState, Range } from '@mermaid-js/core/parser-kit';
import * as codes from '../codes.ts';
import type {
  C4Boundary,
  C4Element,
  C4ElementKind,
  C4Extra,
  C4Model,
  C4NodeKind,
  C4Relation,
  C4RelationKind,
} from '../model.ts';

/** A parsed argument: positional (no name) or `$name="value"`. */
export interface Arg {
  name?: string;
  /** Trimmed. */
  value: string;
  range: Range;
}

/** How a boundary macro reads its arguments. */
export interface BoundaryMacro {
  /** The type when none is given. */
  type: string;
  /** The type a named boundary splices in as its third argument (v12's `splice(2, 0, …)`). */
  splice?: string;
  /** Set for a deployment node. */
  nodeKind?: C4NodeKind;
}

/** The fields a named argument sets on an element or a boundary; any other name is `extra`. */
const ELEMENT_FIELDS: ReadonlySet<string> = new Set([
  'label',
  'descr',
  'techn',
  'type',
  'sprite',
  'tags',
  'link',
  'bgColor',
  'fontColor',
  'borderColor',
  'shadowing',
  'shape',
  'legendText',
  'legendSprite',
]);
/** The text fields a named argument sets on a relation (`offsetX`/`offsetY` are numbers). */
const RELATION_FIELDS: ReadonlySet<string> = new Set([
  'label',
  'descr',
  'techn',
  'sprite',
  'tags',
  'link',
  'textColor',
  'lineColor',
]);
const OFFSETS: ReadonlySet<string> = new Set(['offsetX', 'offsetY']);
/** `UpdateElementStyle`'s slots after the target. */
const ELEMENT_STYLE_SLOTS = [
  'bgColor',
  'fontColor',
  'borderColor',
  'shadowing',
  'shape',
  'sprite',
  'techn',
  'legendText',
  'legendSprite',
] as const;

type Open<T> = { -readonly [K in keyof T]: T[K] };
type OpenElement = Open<C4Element>;
type OpenBoundary = Open<C4Boundary>;
type OpenRelation = Open<C4Relation>;
type Bag = OpenElement | OpenBoundary | OpenRelation;

/** v12's `parseInt` (no radix, as `c4Db.ts` called it: `0x10` reads 16). */
const toInt = (text: string): number => parseInt(text);

/** `%`, `>`, `@` and `#` percent-encoded. */
function esc(name: string): string {
  return /[%>@#]/.test(name)
    ? name.replace(/[%>@#]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`)
    : name;
}

/** D458's AST ids. */
class Ids {
  private readonly seen = new Map<string, number>();
  private styles = 0;

  private next(base: string): AstId {
    const n = (this.seen.get(base) ?? 0) + 1;
    this.seen.set(base, n);
    return n === 1 ? base : `${base}@${n}`;
  }

  element(alias: string): AstId {
    return this.next(`element:${esc(alias)}`);
  }

  boundary(alias: string): AstId {
    return this.next(`boundary:${esc(alias)}`);
  }

  relation(from: string, to: string): AstId {
    return this.next(`rel:${esc(from)}->${esc(to)}`);
  }

  style(): AstId {
    return `style:${++this.styles}`;
  }
}

/** What an element or boundary statement added: its AST id and alias. */
export interface Added {
  ast: AstId;
  alias: string;
}

/** One parse's model, built statement by statement. */
export class C4Builder {
  readonly ids = new Ids();
  readonly elements: OpenElement[] = [];
  readonly boundaries: OpenBoundary[] = [];
  readonly relations: OpenRelation[] = [];
  /** The boundary statements are in: an index into {@link boundaries}, -1 at the top level. */
  current = -1;
  shapeInRow: number | undefined;
  boundaryInRow: number | undefined;
  /** Each relation's first statement, for the unknown-end check. */
  private readonly relationAt: Range[] = [];
  private readonly elementIndex = new Map<string, number>();
  private readonly boundaryIndex = new Map<string, number>();
  private readonly relationIndex = new Map<string, Map<string, number>>();
  /** Relation ends and style targets, resolved to a namespace at the end. */
  private readonly refs: { name: string; range: Range }[] = [];
  /** Each item's `extra` names, by name: where in `extra` each is. */
  private readonly extraIndex = new Map<Bag, Map<string, number>>();

  constructor(
    private readonly src: string,
    private readonly st: ParseState
  ) {}

  // ---- fields -------------------------------------------------------------------------

  /** Set field `name` of `bag` to `value`: a known field, else `extra`. */
  private set(bag: Bag, known: ReadonlySet<string>, name: string, value: string, at: Range): void {
    if (name === '__proto__') {
      this.st.diagnostics.error(
        codes.C4_NAME_RESERVED,
        '`$__proto__` is not an argument name C4 can keep; rename it.',
        at
      );
    }
    if (known.has(name)) {
      (bag as unknown as Record<string, string>)[name] = value;
      return;
    }
    const extra = bag.extra as C4Extra[];
    let names = this.extraIndex.get(bag);
    if (!names) this.extraIndex.set(bag, (names = new Map<string, number>()));
    const i = names.get(name);
    if (i === undefined) {
      names.set(name, extra.length);
      extra.push({ name, value });
    } else extra[i] = { name, value };
  }

  /** A named argument: on a relation an offset is a number; any other name sets its field. */
  private named(bag: Bag, arg: Arg, onRelation: boolean): void {
    const name = arg.name ?? '';
    if (!onRelation) this.set(bag, ELEMENT_FIELDS, name, arg.value, arg.range);
    else if (OFFSETS.has(name)) this.offset(bag as OpenRelation, name, arg.value, arg.range);
    else this.set(bag, RELATION_FIELDS, name, arg.value, arg.range);
  }

  /** D457: an offset as v12's renderer read it, 0 when it is not a number. */
  private offset(r: OpenRelation, field: string, text: string, at: Range): void {
    const n = toInt(text);
    if (Number.isNaN(n)) {
      this.st.diagnostics.warning(
        codes.C4_OFFSET_INVALID,
        `\`${field}\` takes a whole number of pixels; \`${text}\` counts as 0.`,
        at
      );
    }
    r[field === 'offsetX' ? 'offsetX' : 'offsetY'] = Number.isNaN(n) ? 0 : n;
  }

  /** D452: a named argument where an alias, a relation end or a label belongs. */
  private moved(arg: Arg, slot: string): void {
    const name = arg.name ?? '';
    this.st.diagnostics.warning(
      codes.C4_NAMED_ARGUMENT_MOVED,
      `\`$${name}\` is written where the ${slot} belongs: it sets \`${name}\`, and the ${slot} is empty.`,
      arg.range
    );
  }

  /** The label slot: positional text, empty when left out, a named argument moved (D452). */
  private label(bag: Bag, arg: Arg | undefined, onRelation: boolean): void {
    bag.label = '';
    if (arg === undefined) return;
    if (arg.name === undefined) {
      bag.label = arg.value;
      return;
    }
    this.moved(arg, 'label');
    this.named(bag, arg, onRelation);
  }

  /** A text slot with v12's empty default (`descr`, `techn`): kept when left out. */
  private text(
    bag: Bag,
    field: 'descr' | 'techn',
    arg: Arg | undefined,
    onRelation: boolean
  ): void {
    if (arg === undefined) bag[field] ??= '';
    else this.slot(bag, field, arg, onRelation);
  }

  /** Any other slot: positional text sets its field, a named argument the field it names. */
  private slot(bag: Bag, field: string, arg: Arg | undefined, onRelation: boolean): void {
    if (arg === undefined) return;
    if (arg.name === undefined) (bag as unknown as Record<string, string>)[field] = arg.value;
    else this.named(bag, arg, onRelation);
  }

  /** An alias as written, or undefined for a named argument there (moved, D452). */
  private alias(arg: Arg | undefined, slot: string): string | undefined {
    if (arg === undefined) return '';
    if (arg.name === undefined) return arg.value;
    this.moved(arg, slot);
    return undefined;
  }

  // ---- symbols ------------------------------------------------------------------------

  /** `arg` written exactly as `name` in the source (else no symbol: the service drops it). */
  private exact(name: string, arg: Arg | undefined): arg is Arg {
    return (
      arg !== undefined &&
      arg.name === undefined &&
      name !== '' &&
      this.src.slice(arg.range.start, arg.range.end) === name
    );
  }

  private definition(name: string, arg: Arg | undefined, kind: string, first: boolean): void {
    if (this.exact(name, arg)) this.st.symbol(name, kind, arg.range, first ? 'def' : 'ref');
  }

  private ref(name: string, arg: Arg | undefined): void {
    if (this.exact(name, arg)) this.refs.push({ name, range: arg.range });
  }

  // ---- statements ---------------------------------------------------------------------

  /** `Person(alias, label, descr?, sprite?, tags?, link?)`; containers take `techn` first. */
  element(kind: C4ElementKind, withTechn: boolean, args: readonly Arg[]): Added {
    const written = this.alias(args[0], 'alias');
    const alias = written ?? '';
    let i = written === undefined ? undefined : this.elementIndex.get(alias);
    const first = i === undefined;
    if (i === undefined) {
      i = this.elements.length;
      this.elements.push({ ast: '', alias, kind, label: '', parent: -1, extra: [] });
      if (written !== undefined) this.elementIndex.set(alias, i);
    }
    const el = this.elements[i] as OpenElement;
    const ast = this.ids.element(alias);
    if (first) el.ast = ast;
    if (written === undefined && args[0]) this.named(el, args[0], false);
    this.definition(alias, args[0], 'element', first);
    this.label(el, args[1], false);
    let next = 2;
    if (withTechn) this.text(el, 'techn', args[next++], false);
    this.text(el, 'descr', args[next++], false);
    this.slot(el, 'sprite', args[next++], false);
    this.slot(el, 'tags', args[next++], false);
    this.slot(el, 'link', args[next], false);
    el.kind = kind;
    el.parent = this.current;
    return { ast, alias };
  }

  /**
   * A boundary or deployment node: `Boundary(alias, label, type?, tags?, link?)`;
   * `Enterprise_Boundary`, `System_Boundary` and `Container_Boundary` splice their type in as the
   * third argument (an author's third shifts to `tags`); nodes take `type?, descr?, sprite?`
   * (the sprite dropped, as v12 did), `tags?, link?`. Returns the boundary's index too, which
   * becomes {@link current} once its `{` is read.
   */
  boundary(macro: BoundaryMacro, written: readonly Arg[], at: number): Added & { index: number } {
    const args = [...written];
    if (macro.splice !== undefined) {
      args.splice(2, 0, { value: macro.splice, range: { start: at, end: at } });
    }
    const name = this.alias(args[0], 'alias');
    const alias = name ?? '';
    let i = name === undefined ? undefined : this.boundaryIndex.get(alias);
    const first = i === undefined;
    if (i === undefined) {
      i = this.boundaries.length;
      this.boundaries.push({ ast: '', alias, label: '', parent: -1, extra: [] });
      if (name !== undefined) this.boundaryIndex.set(alias, i);
    }
    const b = this.boundaries[i] as OpenBoundary;
    const ast = this.ids.boundary(alias);
    if (first) b.ast = ast;
    if (name === undefined && args[0]) this.named(b, args[0], false);
    this.definition(alias, args[0], 'boundary', first);
    this.label(b, args[1], false);
    if (args[2] === undefined) b.type = macro.type;
    else this.slot(b, 'type', args[2], false);
    if (macro.nodeKind !== undefined) {
      this.text(b, 'descr', args[3], false);
      // args[4], the sprite: v12's `addDeploymentNode` never assigns it (a named one included).
      this.slot(b, 'tags', args[5], false);
      this.slot(b, 'link', args[6], false);
      b.nodeKind = macro.nodeKind;
    } else {
      this.slot(b, 'tags', args[3], false);
      this.slot(b, 'link', args[4], false);
    }
    b.parent = this.current;
    return { ast, alias, index: i };
  }

  /**
   * `Rel(from, to, label, techn?, descr?, sprite?, tags?, link?)`. Undefined when v12 dropped
   * it: without its three first arguments.
   */
  relation(
    kind: C4RelationKind,
    args: readonly Arg[],
    at: Range
  ): (Added & { from: string; to: string }) | undefined {
    if (args[0] === undefined || args[1] === undefined || args[2] === undefined) return undefined;
    const fromWritten = this.alias(args[0], 'start of the relation');
    const toWritten = this.alias(args[1], 'end of the relation');
    const from = fromWritten ?? '';
    const to = toWritten ?? '';
    const known = fromWritten !== undefined && toWritten !== undefined;
    let i = known ? this.relationIndex.get(from)?.get(to) : undefined;
    const first = i === undefined;
    if (i === undefined) {
      i = this.relations.length;
      this.relations.push({ ast: '', kind, from, to, label: '', extra: [] });
      this.relationAt.push(at);
      if (known) {
        let ends = this.relationIndex.get(from);
        if (!ends) this.relationIndex.set(from, (ends = new Map<string, number>()));
        ends.set(to, i);
      }
    }
    const r = this.relations[i] as OpenRelation;
    const ast = this.ids.relation(from, to);
    if (first) r.ast = ast;
    if (fromWritten === undefined) this.named(r, args[0], true);
    if (toWritten === undefined) this.named(r, args[1], true);
    this.ref(from, args[0]);
    this.ref(to, args[1]);
    r.kind = kind;
    this.label(r, args[2], true);
    this.text(r, 'techn', args[3], true);
    this.text(r, 'descr', args[4], true);
    this.slot(r, 'sprite', args[5], true);
    this.slot(r, 'tags', args[6], true);
    this.slot(r, 'link', args[7], true);
    return { ast, alias: from, from, to };
  }

  /**
   * `UpdateElementStyle`: `name`, then `bgColor?`, `fontColor?`, `borderColor?`, `shadowing?`,
   * `shape?`, `sprite?`, `techn?`, `legendText?`, `legendSprite?`; on the element with that
   * alias, else the boundary; nothing when there is none yet (as v12).
   */
  elementStyle(args: readonly Arg[]): void {
    const target = args[0];
    if (!target || target.name !== undefined) return;
    this.ref(target.value, target);
    const i = this.elementIndex.get(target.value);
    const j = i === undefined ? this.boundaryIndex.get(target.value) : undefined;
    let bag: Bag | undefined;
    if (i !== undefined) bag = this.elements[i];
    else if (j !== undefined) bag = this.boundaries[j];
    if (!bag) return;
    for (let k = 0; k < ELEMENT_STYLE_SLOTS.length; k++) {
      this.slot(bag, ELEMENT_STYLE_SLOTS[k] ?? '', args[k + 1], false);
    }
  }

  /**
   * `UpdateRelStyle(from, to, textColor?, lineColor?, offsetX?, offsetY?)`: on the relation
   * between them, nothing when there is none yet (as v12). The offset slots read a number,
   * whatever a named argument there names (v12 `parseInt`ed both).
   */
  relStyle(args: readonly Arg[]): void {
    const [from, to] = args;
    if (!from || !to || from.name !== undefined || to.name !== undefined) return;
    this.ref(from.value, from);
    this.ref(to.value, to);
    const i = this.relationIndex.get(from.value)?.get(to.value);
    const r = i === undefined ? undefined : this.relations[i];
    if (!r) return;
    this.slot(r, 'textColor', args[2], true);
    this.slot(r, 'lineColor', args[3], true);
    const offsets = ['offsetX', 'offsetY'];
    for (let k = 0; k < 2; k++) {
      const arg = args[k + 4];
      if (arg === undefined) continue;
      const target = arg.name ?? offsets[k] ?? '';
      if (OFFSETS.has(target)) this.offset(r, target, arg.value, arg.range);
      // Another name in an offset slot: v12 stored `parseInt` of the value under it.
      else this.set(r, RELATION_FIELDS, target, String(toInt(arg.value)), arg.range);
    }
  }

  /**
   * `UpdateLayoutConfig(c4ShapeInRow?, c4BoundaryInRow?)`: by position, a name changes nothing
   * (as v12); a value is kept when its integer prefix is at least 1.
   */
  layout(args: readonly Arg[]): void {
    // v12's `$__proto__="…"` read as `{}`, with no value.
    const value = (a: Arg | undefined) =>
      a === undefined || a.name === '__proto__' ? NaN : toInt(a.value);
    const shapes = value(args[0]);
    const bounds = value(args[1]);
    if (shapes >= 1) this.shapeInRow = shapes;
    if (bounds >= 1) this.boundaryInRow = bounds;
  }

  // ---- end of the text ----------------------------------------------------------------

  /**
   * D457: a relation whose end names no element or boundary, v12's render error, here a
   * diagnostic. `excused` aliases (a statement that failed may have defined them) are not
   * reported: one error, one diagnostic. Then the references, each in its namespace.
   */
  finish(excused: (alias: string) => boolean): void {
    const known = (alias: string) =>
      this.elementIndex.has(alias) || this.boundaryIndex.has(alias) || excused(alias);
    this.relations.forEach((r, i) => {
      if (known(r.from) && known(r.to)) return;
      this.st.diagnostics.error(
        codes.C4_UNKNOWN_END,
        `C4 rel "${r.from}" -> "${r.to}" references an unknown shape or boundary`,
        this.relationAt[i] ?? { start: 0, end: 0 }
      );
    });
    for (const { name, range } of this.refs) {
      const shape = this.elementIndex.has(name) || !this.boundaryIndex.has(name);
      this.st.symbol(name, shape ? 'element' : 'boundary', range, 'ref');
    }
  }

  /** The model's items and row counts. */
  model(): Pick<C4Model, 'elements' | 'boundaries' | 'relations' | 'shapeInRow' | 'boundaryInRow'> {
    return {
      elements: this.elements,
      boundaries: this.boundaries,
      relations: this.relations,
      ...(this.shapeInRow !== undefined && { shapeInRow: this.shapeInRow }),
      ...(this.boundaryInRow !== undefined && { boundaryInRow: this.boundaryInRow }),
    };
  }
}
