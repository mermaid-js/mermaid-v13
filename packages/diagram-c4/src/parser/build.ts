/**
 * The C4 model as v12's DB (`c4Db.ts`) builds it, statement by statement: what each macro's
 * arguments set, by slot or by name, the merges, and the D452/D457 changes (see `model.ts`).
 * Aliases and relation pairs are indexed by `Map`, so each statement costs the same however many
 * came before it (R-PARSE-7). The parser hands each macro's arguments here and places the AST
 * nodes; this module holds no grammar.
 */
import { idEscaper } from '@mermaid-js/shared/parser/support';
import type { AstId, ParseState, Range } from '@mermaid-js/core/parser-kit';
import * as codes from '../codes.ts';
import {
  C4_ELEMENT_KINDS,
  C4_NODE_KINDS,
  type C4Boundary,
  type C4Element,
  type C4ElementKind,
  type C4Extra,
  type C4Model,
  type C4NodeKind,
  type C4Relation,
} from '../model.ts';
import type { C4Argument } from './ast.ts';
import {
  BOUNDARY,
  ELEMENT_STYLE,
  nameRoute,
  NO_NAMES,
  NODE,
  OFFSETS,
  REL,
  REL_STYLE,
} from './slots.ts';
import type { SlotTable } from './slots.ts';

/**
 * Where an alias a named argument gives belongs: an element's or a boundary's own, or a
 * relation end (an element first, else a boundary, resolved at the end as v12 looks it up).
 */
type AliasKind = 'element' | 'boundary' | 'end';

/** A parsed argument: positional (no name) or `$name="value"`, as the AST keeps it. */
export type Arg = C4Argument;

/** How a boundary macro reads its arguments. */
export interface BoundaryMacro {
  /** The type when none is given. */
  type: string;
  /** The type a named boundary splices in as its third argument (v12's `splice(2, 0, …)`). */
  splice?: string;
  /** Set for a deployment node. */
  nodeKind?: C4NodeKind;
}

const ELEMENT_KINDS: ReadonlySet<string> = new Set(C4_ELEMENT_KINDS);
const NODE_KINDS: ReadonlySet<string> = new Set(C4_NODE_KINDS);
type Open<T> = { -readonly [K in keyof T]: T[K] };
type OpenElement = Open<C4Element>;
type OpenBoundary = Open<C4Boundary>;
type OpenRelation = Open<C4Relation>;
type Bag = OpenElement | OpenBoundary | OpenRelation;

/** A model item with its index in its list. */
type Item =
  | { type: 'element'; bag: OpenElement; index: number }
  | { type: 'boundary'; bag: OpenBoundary; index: number }
  | { type: 'relation'; bag: OpenRelation; index: number };

/** One named value for an item (pitfall 10). */
/** Slots `from` to `to` of `table` (to its end when `to` is omitted). */
interface SlotRange {
  readonly table: SlotTable;
  readonly from: number;
  readonly to?: number;
}

interface Setting {
  item: Item;
  name: string;
  value: string;
  at: Range;
  /** The named argument it came from, when one did. */
  arg?: Arg;
  /** The structural names the statement sets again after its arguments. */
  last: ReadonlySet<string>;
}

/** v12's `parseInt` (no radix, as `c4Db.ts` called it: `0x10` reads 16). */
const toInt = (text: string): number => parseInt(text);

/** `%`, `>`, `@` and `#` percent-encoded. */
const esc = /* @__PURE__ */ idEscaper();

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

/** An element statement (pitfall 10). */
export interface ElementParts {
  kind: C4ElementKind;
  /** Its slots (containers and components take `techn` before `descr`). */
  table: SlotTable;
  args: readonly Arg[];
  /** The boundary it is in: an index into the boundaries, -1 at the top level. */
  parent: number;
}

/** A boundary or deployment node statement. */
export interface BoundaryParts {
  macro: BoundaryMacro;
  args: readonly Arg[];
  /** Where its arguments end (the spliced-in type has no source of its own). */
  end: number;
  parent: number;
}

/** A relation statement. */
export interface RelationParts {
  kind: string;
  args: readonly Arg[];
  /** The statement, for the unknown-end diagnostic. */
  at: Range;
}

/** One parse's model, built statement by statement. */
export class C4Builder {
  readonly ids = new Ids();
  readonly elements: OpenElement[] = [];
  readonly boundaries: OpenBoundary[] = [];
  readonly relations: OpenRelation[] = [];
  shapeInRow: number | undefined;
  boundaryInRow: number | undefined;
  /** Each relation's statement, for the unknown-end check. */
  private readonly relationAt: Range[] = [];
  private readonly elementIndex = new Map<string, number>();
  private readonly boundaryIndex = new Map<string, number>();
  /** The relations between each pair of ends, by statement order (a pair can have several). */
  private readonly relationIndex = new Map<string, Map<string, number[]>>();
  /** Relation ends and style targets, resolved to a namespace at the end. */
  private readonly refs: { name: string; range: Range }[] = [];
  /** Each item's `extra` names, by name: where in `extra` each is. */
  private readonly extraIndex = new Map<Bag, Map<string, number>>();
  /** How many items each boundary holds (elements and boundaries with it as parent). */
  private readonly held: number[] = [];

  constructor(
    private readonly src: string,
    private readonly st: ParseState
  ) {}

  // ---- fields -------------------------------------------------------------------------

  /** Set named value `s.name`: structure, a known field, else `extra`. */
  private set(s: Setting): void {
    const { item, name, value } = s;
    if (name === '__proto__') {
      this.st.diagnostics.warning(
        codes.C4_NAME_RESERVED,
        '`$__proto__` sets no field; it is kept as an unknown name (mermaid@12 failed on it).',
        s.at
      );
    }
    const route = nameRoute(item.type, name, s.last);
    // v12 set a name again after the arguments: no effect.
    if (route === 'again') return;
    if (route === 'structure') return this.structure(s);
    if (route === 'field') {
      (item.bag as unknown as Record<string, string>)[name] = value;
      return;
    }
    const extra = item.bag.extra as C4Extra[];
    let names = this.extraIndex.get(item.bag);
    if (!names) this.extraIndex.set(item.bag, (names = new Map<string, number>()));
    const i = names.get(name);
    if (i === undefined) {
      names.set(name, extra.length);
      extra.push({ name, value });
    } else extra[i] = { name, value };
  }

  /**
   * A name for the structure, as v12 took it (`bag[key] = value`). Where v12's value would break
   * the model, the structure is kept with a warning.
   */
  private structure(s: Setting): void {
    const { item, name, value } = s;
    if (name === 'wrap') {
      this.kept(s, 'changes nothing', 'wrapping follows the `c4.wrap` config');
    } else if (item.type === 'relation') {
      if (name === 'type') item.bag.kind = value;
      else {
        this.namedRef(s, 'end');
        this.relationEnds(
          item.index,
          name === 'from' ? value : item.bag.from,
          name === 'to' ? value : item.bag.to
        );
      }
    } else if (name === 'alias') {
      // D458: the macro that gives the alias defines it, unless an item already has it.
      const index = item.type === 'element' ? this.elementIndex : this.boundaryIndex;
      const owner = index.get(value);
      this.namedRef(s, item.type, owner === undefined ? 'def' : 'ref');
      this.rename(item, value, s);
    } else if (name === 'parentBoundary') {
      if (value !== 'global') this.namedRef(s, 'boundary');
      const parent = this.boundaryIndex.get(value) ?? (value === 'global' ? -1 : undefined);
      if (parent === undefined)
        this.kept(s, 'changes nothing', `no boundary has the alias \`${value}\``);
      else this.setParent(item.bag, parent);
    } else if (item.type === 'element') {
      if (ELEMENT_KINDS.has(value)) item.bag.kind = value as C4ElementKind;
      else this.kept(s, 'changes nothing', `\`${value}\` is not an element kind`);
    } else if (NODE_KINDS.has(value)) item.bag.nodeKind = value as C4NodeKind;
    else
      this.kept(
        s,
        'changes nothing',
        `\`${value}\` is not a deployment node kind (\`node\`, \`nodeL\`, \`nodeR\`)`
      );
  }

  /** The structure is kept where v12 broke it: one warning, saying what happens instead. */
  private kept(s: Setting, what: string, why: string): void {
    this.st.diagnostics.warning(
      codes.C4_STRUCTURE_KEPT,
      `\`$${s.name}="${s.value}"\` ${what}: ${why}.`,
      s.at
    );
  }

  /** `$alias`: the item takes the new alias, and statements after it find it by that one. */
  private rename(item: Item & { type: 'element' | 'boundary' }, alias: string, s: Setting): void {
    const index = item.type === 'element' ? this.elementIndex : this.boundaryIndex;
    if (index.get(item.bag.alias) === item.index) index.delete(item.bag.alias);
    const other = index.get(alias);
    // v12 found the first item with an alias.
    if (other === undefined || other > item.index) index.set(alias, item.index);
    item.bag.alias = alias;
    // v12 kept the boundary's statements under its old alias, outside the diagram: those it
    // holds, and in a macro (`s.last` is not `NO_NAMES`) those in its braces.
    if (item.type === 'boundary' && (s.last !== NO_NAMES || (this.held[item.index] ?? 0) > 0)) {
      this.kept(
        s,
        'renames the boundary, and its statements stay in it',
        'mermaid@12 left them outside the diagram'
      );
    }
  }

  private setParent(bag: OpenElement | OpenBoundary, parent: number): void {
    if (bag.parent >= 0) this.held[bag.parent] = (this.held[bag.parent] ?? 1) - 1;
    if (parent >= 0) this.held[parent] = (this.held[parent] ?? 0) + 1;
    bag.parent = parent;
  }

  /** The relations between `from` and `to` written so far, in statement order. */
  private between(from: string, to: string): number[] {
    let ends = this.relationIndex.get(from);
    if (!ends) this.relationIndex.set(from, (ends = new Map<string, number[]>()));
    let list = ends.get(to);
    if (!list) ends.set(to, (list = []));
    return list;
  }

  /** A relation's ends, re-indexed: it is found by the new pair from now on. */
  private relationEnds(i: number, from: string, to: string): void {
    const r = this.relations[i] as OpenRelation;
    const old = this.between(r.from, r.to);
    old.splice(old.indexOf(i), 1);
    r.from = from;
    r.to = to;
    const next = this.between(from, to);
    const at = next.findIndex((other) => other > i);
    next.splice(at === -1 ? next.length : at, 0, i);
  }

  /** A named argument: on a relation an offset is a number; any other name sets its field. */
  private named(item: Item, arg: Arg, last: ReadonlySet<string>): void {
    const name = arg.name ?? '';
    if (nameRoute(item.type, name, last) === 'offset' && item.type === 'relation') {
      this.offset(item.bag, name, arg.value, arg.range);
    } else this.set({ item, name, value: arg.value, at: arg.range, arg, last });
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
  private label(item: Item, arg: Arg | undefined, last: ReadonlySet<string>): void {
    item.bag.label = '';
    if (arg === undefined) return;
    if (arg.name === undefined) {
      item.bag.label = arg.value;
      return;
    }
    this.moved(arg, 'label');
    this.named(item, arg, last);
  }

  /** A text slot with v12's empty default (`descr`, `techn`): kept when left out. */
  private text(
    item: Item,
    field: 'descr' | 'techn',
    arg: Arg | undefined,
    last: ReadonlySet<string>
  ): void {
    if (arg === undefined) item.bag[field] ??= '';
    else this.slot(item, field, arg, last);
  }

  /** Any other slot: positional text sets its field, a named argument the field it names. */
  private slot(item: Item, field: string, arg: Arg | undefined, last: ReadonlySet<string>): void {
    if (arg === undefined) return;
    if (arg.name === undefined) (item.bag as unknown as Record<string, string>)[field] = arg.value;
    else this.named(item, arg, last);
  }

  /** An alias as written, or undefined for a named argument there (moved, D452). */
  private alias(arg: Arg | undefined, slot: string): string | undefined {
    if (arg === undefined) return '';
    if (arg.name === undefined) return arg.value;
    this.moved(arg, slot);
    return undefined;
  }

  // ---- symbols ------------------------------------------------------------------------

  // Each alias written as an argument is an occurrence at the argument's range: bare, or with
  // its quotes (the service reads the text between them, D191). Where the source does not
  // write it as it is (an entity, a directive or blanks inside its quotes) the range does not
  // read as the name: the service drops the occurrence and refuses to rename the symbol, which
  // it could not rename everywhere.

  private definition(name: string, arg: Arg | undefined, kind: string, first: boolean): void {
    if (arg === undefined || arg.name !== undefined || name === '') return;
    this.st.symbol(name, kind, arg.range, first ? 'def' : 'ref');
  }

  private ref(name: string, arg: Arg | undefined): void {
    if (arg === undefined || arg.name !== undefined || name === '') return;
    this.refs.push({ name, range: arg.range });
  }

  /**
   * The range of a named argument's value, when the source writes it as `value` between the
   * quotes of `$name="…"` (blanks around it aside); else the whole argument, which the service
   * drops.
   */
  private valueRange(arg: Arg): Range {
    const { start, end } = arg.range;
    const text = this.src.slice(start, end);
    const open = text.indexOf('"');
    if (open < 0 || !text.endsWith('"')) return arg.range;
    let from = start + open + 1;
    let to = end - 1;
    while (from < to && /\s/.test(this.src.charAt(from))) from++;
    while (to > from && /\s/.test(this.src.charAt(to - 1))) to--;
    return this.src.slice(from, to) === arg.value ? { start: from, end: to } : arg.range;
  }

  /** An alias a named argument gives: an occurrence at its value. */
  private namedRef(s: Setting, kind: AliasKind, role: 'def' | 'ref' = 'ref'): void {
    if (s.value === '' || s.arg === undefined) return;
    const range = this.valueRange(s.arg);
    if (kind === 'end') this.refs.push({ name: s.value, range });
    else this.st.symbol(s.value, kind, range, role);
  }

  /** Whether the statement's `$alias` renames its item (to another alias). */
  private renames(args: readonly Arg[], alias: string): boolean {
    return args.some((a) => a.name === 'alias' && a.value !== alias);
  }

  /**
   * Slots `from` to `to` of `table` (to its end when omitted), each read into its field:
   * `blank` ones keep v12's empty default, `dropped` ones are read and ignored.
   */
  private rest(item: Item, args: readonly Arg[], { table, from, to }: SlotRange) {
    const { slots, setAfter } = table;
    for (let k = from; k < (to ?? slots.length); k++) {
      const s = slots[k];
      if (!s || s.dropped) continue;
      if (s.blank) this.text(item, s.name as 'descr' | 'techn', args[k], setAfter);
      else this.slot(item, s.name, args[k], setAfter);
    }
  }

  // ---- statements ---------------------------------------------------------------------

  /** `Person(alias, label, descr?, sprite?, tags?, link?)`; containers take `techn` first. */
  element(parts: ElementParts): Added {
    const { kind, args } = parts;
    const written = this.alias(args[0], 'alias');
    const alias = written ?? '';
    let i = written === undefined ? undefined : this.elementIndex.get(alias);
    const first = i === undefined;
    if (i === undefined) {
      i = this.elements.length;
      this.elements.push({ ast: '', alias, kind, label: '', parent: -1, extra: [] });
      if (written !== undefined) this.elementIndex.set(alias, i);
    }
    const item: Item = { type: 'element', bag: this.elements[i] as OpenElement, index: i };
    const ast = this.ids.element(alias);
    if (first) item.bag.ast = ast;
    const { table } = parts;
    if (written === undefined && args[0]) this.named(item, args[0], table.setAfter);
    // A `$alias` that renames the new item defines the alias it gives instead (D458).
    if (!(first && this.renames(args, alias))) this.definition(alias, args[0], 'element', first);
    this.label(item, args[1], table.setAfter);
    this.rest(item, args, { table, from: 2 });
    item.bag.kind = kind;
    this.setParent(item.bag, parts.parent);
    return { ast, alias };
  }

  /**
   * A boundary or deployment node: `Boundary(alias, label, type?, tags?, link?)`;
   * `Enterprise_Boundary`, `System_Boundary` and `Container_Boundary` splice their type in as the
   * third argument (an author's third shifts to `tags`); nodes take `type?, descr?, sprite?`
   * (the sprite dropped, as v12 did), `tags?, link?`. Returns the boundary's index too: the
   * parent of the statements in its braces.
   */
  boundary(parts: BoundaryParts): Added & { index: number } {
    const { macro } = parts;
    const args = [...parts.args];
    if (macro.splice !== undefined) {
      args.splice(2, 0, { value: macro.splice, range: { start: parts.end, end: parts.end } });
    }
    // Read as written after the splice: a named boundary's type is the third argument.
    const table = macro.nodeKind === undefined ? BOUNDARY : NODE;
    const last = table.setAfter;
    const name = this.alias(args[0], 'alias');
    const alias = name ?? '';
    let i = name === undefined ? undefined : this.boundaryIndex.get(alias);
    const first = i === undefined;
    if (i === undefined) {
      i = this.boundaries.length;
      this.boundaries.push({ ast: '', alias, label: '', parent: -1, extra: [] });
      if (name !== undefined) this.boundaryIndex.set(alias, i);
    }
    const item: Item = { type: 'boundary', bag: this.boundaries[i] as OpenBoundary, index: i };
    const ast = this.ids.boundary(alias);
    if (first) item.bag.ast = ast;
    if (name === undefined && args[0]) this.named(item, args[0], last);
    if (!(first && this.renames(args, alias))) this.definition(alias, args[0], 'boundary', first);
    this.label(item, args[1], last);
    if (args[2] === undefined) item.bag.type = macro.type;
    // A node's sprite: v12's `addDeploymentNode` never assigns it (a named one included).
    this.rest(item, args, { table, from: 2 });
    if (macro.nodeKind !== undefined) item.bag.nodeKind = macro.nodeKind;
    this.setParent(item.bag, parts.parent);
    return { ast, alias: item.bag.alias, index: i };
  }

  /**
   * `Rel(from, to, label, techn?, descr?, sprite?, tags?, link?)`. Undefined when v12 dropped
   * it: without its three first arguments.
   */
  relation(parts: RelationParts): (Added & { from: string; to: string }) | undefined {
    const { args } = parts;
    if (args[0] === undefined || args[1] === undefined || args[2] === undefined) return undefined;
    const fromWritten = this.alias(args[0], 'start of the relation');
    const toWritten = this.alias(args[1], 'end of the relation');
    const from = fromWritten ?? '';
    const to = toWritten ?? '';
    const known = fromWritten !== undefined && toWritten !== undefined;
    // Each statement is a relation of its own (#680).
    const i = this.relations.length;
    const ast = this.ids.relation(from, to);
    this.relations.push({ ast, kind: parts.kind, from, to, label: '', extra: [] });
    this.relationAt.push(parts.at);
    if (known) this.between(from, to).push(i);
    const item: Item = { type: 'relation', bag: this.relations[i] as OpenRelation, index: i };
    if (fromWritten === undefined) this.named(item, args[0], REL.setAfter);
    if (toWritten === undefined) this.named(item, args[1], REL.setAfter);
    this.ref(from, args[0]);
    this.ref(to, args[1]);
    this.label(item, args[2], REL.setAfter);
    this.rest(item, args, { table: REL, from: 3 });
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
    let item: Item | undefined;
    if (i !== undefined) item = { type: 'element', bag: this.elements[i] as OpenElement, index: i };
    else if (j !== undefined) {
      item = { type: 'boundary', bag: this.boundaries[j] as OpenBoundary, index: j };
    }
    if (!item) return;
    this.rest(item, args, { table: ELEMENT_STYLE, from: 1 });
  }

  /**
   * `UpdateRelStyle(from, to, textColor?, lineColor?, offsetX?, offsetY?)`: on every relation
   * between them, nothing when there is none yet (as v12). The offset slots read a number,
   * whatever a named argument there names (v12 `parseInt`ed both).
   */
  relStyle(args: readonly Arg[]): void {
    const [from, to] = args;
    if (!from || !to || from.name !== undefined || to.name !== undefined) return;
    this.ref(from.value, from);
    this.ref(to.value, to);
    // Every relation between the pair written so far (#680), listed before any is styled: a
    // `$from` or `$to` among the arguments moves each out of that list.
    for (const i of [...(this.relationIndex.get(from.value)?.get(to.value) ?? [])]) {
      const item: Item = { type: 'relation', bag: this.relations[i] as OpenRelation, index: i };
      this.rest(item, args, { table: REL_STYLE, from: 2, to: 4 });
      this.relStyleOffsets(item, args);
    }
  }

  /** The offset slots of `UpdateRelStyle` on `item`. */
  private relStyleOffsets(item: Item & { type: 'relation' }, args: readonly Arg[]): void {
    for (let k = 4; k < REL_STYLE.slots.length; k++) {
      const arg = args[k];
      if (arg === undefined) continue;
      const name = arg.name ?? REL_STYLE.slots[k]?.name ?? '';
      if (OFFSETS.has(name)) this.offset(item.bag, name, arg.value, arg.range);
      // Another name in an offset slot: v12 stored `parseInt` of the value under it.
      else this.set({ item, name, value: String(toInt(arg.value)), at: arg.range, last: NO_NAMES });
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
