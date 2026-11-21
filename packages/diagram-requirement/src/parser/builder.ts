/**
 * v12's `RequirementDB` (`requirementDb.ts`) as a builder for the {@link RequirementModel}: the
 * calls its grammar actions made (`addRequirement`, `addElement`, `addRelationship`,
 * `setCssStyle`, `setClass`, `defineClass`, `setDirection`, the acc setters), with v12's order
 * and lookup rules, so model parity holds. One per parse. On top of v12, as decided:
 *
 * - D433: what v12 drops silently is recorded for one `REQUIREMENT_STYLE_DROPPED` warning: a
 *   `style` that names a box not defined yet (v12 stops there, so the ids after it get nothing
 *   either), a `class` or `a:::c` that names one (v12 skips it), and a `classDef default` that
 *   boxes are defined after (v12 copies its styles only to the boxes already there). Every
 *   entry any statement adds to a box's classes or styles, or to a class's styles, counts
 *   towards the cap (`maxStyleCopies`, R-SEC-5: `class a,a,… c,c,…` copies multiplicatively);
 *   past it no more are made and the model records the overflow (`styleCopies`), which the
 *   layout turns into a `LimitError` (`../limits.ts`), as gantt's step limit (D542);
 * - D434: the first of duplicate definitions is kept (as v12) with one `REQUIREMENT_DUPLICATE`
 *   warning; a requirement and an element of one name are both kept, lookups reaching the
 *   requirement first (as v12), with one `REQUIREMENT_SHARED_NAME` warning; relations to names
 *   no box has stay in the model with one `REQUIREMENT_UNKNOWN_NODE` warning.
 *
 * Lists are appended item by item, never spread into a call: a class may hold any number of
 * styles (`classDef c …` on 300,000 lines), more than a call's arguments may be.
 */
import { checkLimit } from '@mermaid-js/core/limits';
import { formatList } from '@mermaid-js/core/parser-kit';
import type { AstId, Range, RelatedInfo } from '@mermaid-js/core/parser-kit';
import {
  MAX_STYLE_COPIES,
  REQUIREMENT_DUPLICATE,
  REQUIREMENT_SHARED_NAME,
  REQUIREMENT_STYLE_DROPPED,
  REQUIREMENT_UNKNOWN_NODE,
} from '../codes.ts';
import type {
  BoxesByName,
  Element,
  Relation,
  RelationshipKind,
  Requirement,
  RequirementClass,
  RequirementDirection,
  RequirementKind,
  RequirementModel,
  RequirementWarning,
  RiskLevel,
  StyleCopies,
  VerifyMethod,
} from '../model.ts';
import { boxNamed } from './boxes.ts';

type Writable<T> = { -readonly [K in keyof T]: T[K] };

/** A requirement's fields, as its body sets them (`''` for one it does not). */
export interface RequirementFields {
  requirementId: string;
  text: string;
  risk: RiskLevel | '';
  verifyMethod: VerifyMethod | '';
}

/** An element's fields, as its body sets them. */
export interface ElementFields {
  type: string;
  docRef: string;
}

/** Where a definition or statement is: its AST id and source range. */
export interface At {
  ast: AstId;
  range: Range;
}

/** A name a statement refers to, with where it is written. */
export interface Ref {
  name: string;
  range: Range;
}

/** A definition: where it is, and where its name is. */
export interface DefAt extends At {
  nameRange: Range;
}

export interface BuilderOptions {
  /** Entries `style`, `class` and `classDef` may add before the rest are left out (D433). */
  maxStyleCopies?: number | undefined;
  /** Requirement and element cap (core `DEFAULT_LIMITS.maxNodes`, D608). */
  maxNodes?: number | undefined;
  /** Relationship cap (core `DEFAULT_LIMITS.maxEdges`, D608). */
  maxEdges?: number | undefined;
}

/** Where the builder reports a passed cap: the parser kit's diagnostics. */
export interface LimitSink {
  error(code: string, message: string, range: Range): unknown;
}

type Box = Writable<Requirement> | Writable<Element>;

/** A later definition of a name (D434). */
interface Duplicate {
  at: DefAt;
  /** The kept definition. */
  first: Range;
  element: boolean;
  name: string;
}

/** A requirement and an element of one name (D434), at the later of the two. */
interface Shared {
  at: DefAt;
  other: Range;
  name: string;
}

/** A `style`, `class` or `a:::c` statement that named boxes not defined yet (D433). */
interface Lost {
  at: At;
  what: 'style' | 'class';
  /** The names it lost, in order. */
  names: string[];
  /** Names after the last of them that a `style` (which stops there) never reached. */
  rest: number;
}

/** One entry of a warning's `related`, with its statement's AST id. */
interface Entry {
  at: At;
  message: string;
}

/** The parts of one D433/D434 warning. */
interface WarningParts {
  code: string;
  message: string;
  entries: readonly Entry[];
}

const EMPTY_REQUIREMENT: RequirementFields = {
  requirementId: '',
  text: '',
  risk: '',
  verifyMethod: '',
};
const EMPTY_ELEMENT: ElementFields = { type: '', docRef: '' };

/** The lost names a D433 message names; the rest are counted (`and 35 more`). */
const LOST_NAMES_SHOWN = 5;

/** `"a"`, `"a" and "b"`, `"a", "b" and "c"`. */
const quotedList = (names: readonly string[]): string => formatList(names.map((n) => `"${n}"`));

export class RequirementBuilder {
  private readonly requirements = new Map<string, Writable<Requirement>>();
  private readonly elements = new Map<string, Writable<Element>>();
  private readonly byName: BoxesByName<Writable<Requirement>, Writable<Element>> = {
    requirements: this.requirements,
    elements: this.elements,
  };
  private readonly relations: { kind: RelationshipKind; src: string; dst: string; at: At }[] = [];
  private readonly classes = new Map<string, Writable<RequirementClass>>();
  /** Boxes in definition order, both kinds: what a `classDef default` reached. */
  private boxes = 0;
  /**
   * The boxes that have each class (v12 scanned every box for it in `defineClass`): a map, so
   * a `classDef` costs the copies it makes, not a scan of every box (R-PARSE-7).
   */
  private readonly byClass = new Map<string, Set<Box>>();
  /** Each box name's first definition, for the D433 messages. */
  private readonly firstOf = new Map<string, Range>();
  private direction: RequirementDirection = 'TB';
  private accTitle = '';
  private accDescr = '';
  private readonly maxCopies: number;
  private copies = 0;
  /** The statement being applied, for the cap's record. */
  private current: Range = { start: 0, end: 0 };
  /** Set once the cap is passed; nothing more is copied. */
  private overflow: StyleCopies | undefined;
  private readonly lost: Lost[] = [];
  /** `classDef default` statements and how many boxes there were when each was read. */
  private readonly defaults: { at: At; boxes: number }[] = [];
  /** Box names in definition order, for the boxes a `classDef default` missed. */
  private readonly order: { name: string; range: Range }[] = [];
  private readonly duplicates: Duplicate[] = [];
  private readonly shared: Shared[] = [];

  constructor(
    private readonly options: BuilderOptions = {},
    private readonly sink: LimitSink = { error: () => undefined }
  ) {
    this.maxCopies = options.maxStyleCopies ?? MAX_STYLE_COPIES;
  }

  // ---- v12's calls --------------------------------------------------------------------

  /** v12 `addRequirement`: the first definition of a name wins. */
  addRequirement(
    name: string,
    kind: RequirementKind,
    at: DefAt,
    fields: RequirementFields = EMPTY_REQUIREMENT
  ): void {
    this.add(this.requirements, this.elements, { ...this.boxOf(name, at), kind, ...fields }, false);
  }

  /** v12 `addElement`: the first definition of a name wins. */
  addElement(name: string, at: DefAt, fields: ElementFields = EMPTY_ELEMENT): void {
    this.add(this.elements, this.requirements, { ...this.boxOf(name, at), ...fields }, true);
  }

  /** v12 `addRelationship`: kept whatever its ends name. */
  addRelationship(kind: RelationshipKind, src: string, dst: string, at: At): void {
    this.relations.push({ kind, src, dst, at });
    const count = this.relations.length;
    checkLimit(this.sink, 'maxEdges', count, this.options.maxEdges, 'relationships', at.range);
  }

  /** v12 `setCssStyle`: stops at the first id that names no box yet (D433: recorded). */
  setCssStyle(ids: readonly Ref[], styles: readonly string[], at: At): void {
    this.current = at.range;
    for (let k = 0; k < ids.length && !this.overflow; k++) {
      const id = ids[k] as Ref;
      const node = this.lookup(id.name);
      if (!node) {
        this.dropped(at, id, 'style', ids.length - k - 1);
        return;
      }
      for (const s of styles) this.push(node.styles, s.split(','));
    }
  }

  /** v12 `setClass`: skips an id that names no box yet (D433: recorded). */
  setClass(ids: readonly Ref[], classNames: readonly string[], at: At): void {
    this.current = at.range;
    for (const id of ids) {
      if (this.overflow) return;
      const node = this.lookup(id.name);
      if (!node) {
        this.dropped(at, id, 'class', 0);
        continue;
      }
      for (const name of classNames) {
        if (!this.push(node.classes, [name])) return;
        this.has(node, name);
        const styles = this.classes.get(name)?.styles;
        if (styles && !this.push(node.styles, styles)) return;
      }
    }
  }

  /**
   * v12 `defineClass`: adds the styles to each class, and copies them to every box that has
   * the class now (so `classDef default` reaches the boxes defined before it only, D433).
   */
  defineClass(ids: readonly string[], styles: readonly string[], at: At): void {
    this.current = at.range;
    const split = styles.flatMap((s) => s.split(','));
    const text = styles.filter((s) => s.includes('color')).map((s) => s.replace('fill', 'bgFill'));
    for (const id of ids) {
      if (this.overflow) return;
      let c = this.classes.get(id);
      if (!c) this.classes.set(id, (c = { name: id, styles: [], textStyles: [] }));
      // v12 pushed each style's label form, then the style, in turn: two lists, same result.
      if (!this.push(c.textStyles, text) || !this.push(c.styles, styles)) return;
      for (const box of this.byClass.get(id) ?? []) {
        if (!this.push(box.styles, split)) return;
      }
      // Once per statement (its names are applied one after another).
      if (id === 'default' && this.defaults[this.defaults.length - 1]?.at !== at) {
        this.defaults.push({ at, boxes: this.boxes });
      }
    }
  }

  setDirection(dir: RequirementDirection): void {
    this.direction = dir;
  }

  /** v12 `setAccTitle`: leading blanks off. */
  setAccTitle(text: string): void {
    this.accTitle = text.replace(/^\s+/, '');
  }

  /** v12 `setAccDescription`: blanks after each line break off. */
  setAccDescr(text: string): void {
    this.accDescr = text.replace(/\n\s+/g, '\n');
  }

  // ---- the model ----------------------------------------------------------------------

  /** The model, and the D433 and D434 warnings (in source order) for the parse. */
  model(
    title: string | undefined,
    line: (offset: number) => number
  ): { model: Omit<RequirementModel, 'warnings'>; warnings: RequirementWarning[] } {
    const requirements = [...this.requirements.values()];
    const elements = [...this.elements.values()];
    requirements.forEach((r, k) => (r.slot = k));
    elements.forEach((e, k) => (e.slot = requirements.length + k));
    const resolve = (name: string) => this.lookup(name)?.ast;
    const relations = this.relations.map(
      ({ kind, src, dst, at }): Relation => ({
        ast: at.ast,
        kind,
        src,
        dst,
        from: resolve(src),
        to: resolve(dst),
        range: at.range,
      })
    );
    const model = {
      requirements,
      elements,
      relations,
      classes: [...this.classes.values()],
      direction: this.direction,
      accTitle: this.accTitle,
      accDescr: this.accDescr,
      ...(title !== undefined ? { title } : {}),
      ...(this.overflow ? { styleCopies: this.overflow } : {}),
    };
    const warnings = [
      this.styleWarning(line),
      this.duplicateWarning(line),
      this.sharedWarning(line),
      this.unknownWarning(relations),
    ].filter((w): w is RequirementWarning => w !== undefined);
    return { model, warnings };
  }

  // ---- inside -------------------------------------------------------------------------

  /** What a new box of either kind starts with. */
  private boxOf(name: string, at: DefAt) {
    return {
      ast: at.ast,
      name,
      range: at.range,
      nameRange: at.nameRange,
      classes: ['default'],
      styles: [],
      slot: 0,
    };
  }

  /** Add `box` to `own` unless its name is there (D434), noting a name `other` has. */
  private add<B extends Box>(
    own: Map<string, B>,
    other: ReadonlyMap<string, Box>,
    box: B,
    element: boolean
  ): void {
    const { name, ast, range, nameRange } = box;
    const at = { ast, range, nameRange };
    const first = own.get(name);
    if (first) {
      this.duplicates.push({ at, first: first.range, element, name });
      return;
    }
    const shared = other.get(name);
    if (shared) this.shared.push({ at, other: shared.range, name });
    own.set(name, box);
    this.boxes++;
    // One check per box made (D608); a repeated definition makes none (D434).
    const what = 'requirements and elements';
    checkLimit(this.sink, 'maxNodes', this.boxes, this.options.maxNodes, what, range);
    this.order.push({ name, range });
    if (!this.firstOf.has(name)) this.firstOf.set(name, range);
    this.has(box, 'default');
  }

  /** A box of `name`: the requirement, else the element (v12's order). */
  private lookup(name: string): Box | undefined {
    return boxNamed(name, this.byName)?.box;
  }

  /** Record that `box` has class `name`. */
  private has(box: Box, name: string): void {
    let boxes = this.byClass.get(name);
    if (!boxes) this.byClass.set(name, (boxes = new Set()));
    boxes.add(box);
  }

  /**
   * Append `items` to `list`, counting each against the cap (D433); false once past it, with
   * the overflow recorded (the copies made, plus these).
   */
  private push(list: string[], items: readonly string[]): boolean {
    if (this.overflow) return false;
    if (this.copies + items.length > this.maxCopies) {
      this.overflow = {
        max: this.maxCopies,
        found: this.copies + items.length,
        range: this.current,
      };
      return false;
    }
    this.copies += items.length;
    for (const item of items) list.push(item);
    return true;
  }

  /** Record a name a statement lost; one entry per statement (its names in order). */
  private dropped(at: At, id: Ref, what: 'style' | 'class', rest: number): void {
    const last = this.lost[this.lost.length - 1];
    if (last?.at === at) {
      last.names.push(id.name);
      last.rest = rest;
    } else this.lost.push({ at, what, names: [id.name], rest });
  }

  private lostMessage(l: Lost, line: (offset: number) => number): string {
    // A Set, not an indexOf filter: `class n0,…,nN c` may lose any number of names (R-PARSE-7).
    const distinct = [...new Set(l.names)];
    const shown = distinct.slice(0, LOST_NAMES_SHOWN);
    const more = distinct.length - shown.length;
    const why = shown.map((n) => {
      const box = this.firstOf.get(n);
      return box
        ? `"${n}" is defined only later, at line ${line(box.start)}`
        : `no requirement or element is named "${n}"`;
    });
    const names =
      more > 0 ? `${shown.map((n) => `"${n}"`).join(', ')} and ${more} more` : quotedList(shown);
    const rest = more > 0 ? `; and ${more} more` : '';
    const after =
      l.rest === 0
        ? ''
        : ` The ${l.rest === 1 ? 'name' : `${l.rest} names`} after it ${l.rest === 1 ? 'gets' : 'get'} no style either.`;
    const later = distinct.some((n) => this.firstOf.has(n));
    const fix = later ? ' Move the statement after the definition.' : '';
    return `The ${l.what} for ${names} is lost: ${why.join('; ')}${rest}.${after}${fix}`;
  }

  private styleWarning(line: (offset: number) => number): RequirementWarning | undefined {
    const entries: Entry[] = this.lost.map((l) => ({
      at: l.at,
      message: this.lostMessage(l, line),
    }));
    for (const { at, boxes } of this.defaults) {
      const first = this.order[boxes];
      if (!first) continue;
      const more = this.order.length - boxes - 1;
      entries.push({
        at,
        message: `The default class reaches only the boxes defined before it: "${first.name}" (line ${line(first.range.start)})${more > 0 ? ` and ${more} more get` : ' gets'} none of its styles. Move the \`classDef default\` after the last definition.`,
      });
    }
    entries.sort((a, b) => a.at.range.start - b.at.range.start);
    const first = entries[0];
    if (!first) return undefined;
    const message =
      entries.length === 1
        ? first.message
        : `${entries.length} styling statements are lost to the order of the text (the first at line ${line(first.at.range.start)}): \`style\`, \`class\` and \`:::\` reach only the boxes defined before them.`;
    return this.warning({ code: REQUIREMENT_STYLE_DROPPED, message, entries });
  }

  private duplicateWarning(line: (offset: number) => number): RequirementWarning | undefined {
    const first = this.duplicates[0];
    if (!first) return undefined;
    const describe = (d: Duplicate) =>
      `The ${d.element ? 'element' : 'requirement'} "${d.name}" is defined again: the definition at line ${line(d.first.start)} is kept, and this one is left out.`;
    const message =
      this.duplicates.length === 1
        ? describe(first)
        : `${this.duplicates.length} requirements or elements are defined again (the first: "${first.name}"); the first definition of each is kept, and the later ones are left out.`;
    const entries = this.duplicates.map((d) => ({ at: d.at, message: describe(d) }));
    return this.warning({ code: REQUIREMENT_DUPLICATE, message, entries });
  }

  private sharedWarning(line: (offset: number) => number): RequirementWarning | undefined {
    const first = this.shared[0];
    if (!first) return undefined;
    const describe = (s: Shared) =>
      `A requirement and an element are both named "${s.name}" (the other at line ${line(s.other.start)}): both are drawn, and relations, \`style\` and \`class\` naming "${s.name}" reach the requirement.`;
    const message =
      this.shared.length === 1
        ? describe(first)
        : `${this.shared.length} names are each used by a requirement and an element (the first: "${first.name}"): both boxes are drawn, and relations, \`style\` and \`class\` reach the requirement.`;
    const entries = this.shared.map((s) => ({ at: s.at, message: describe(s) }));
    return this.warning({ code: REQUIREMENT_SHARED_NAME, message, entries });
  }

  private unknownWarning(relations: readonly Relation[]): RequirementWarning | undefined {
    const bad = relations.filter((r) => r.from === undefined || r.to === undefined);
    const first = bad[0];
    if (!first) return undefined;
    const describe = (r: Relation) => {
      const names = [
        r.from === undefined ? r.src : undefined,
        r.to === undefined ? r.dst : undefined,
      ].filter((n): n is string => n !== undefined);
      return `The relation from "${r.src}" to "${r.dst}" names ${quotedList([...new Set(names)])}, which no requirement or element is called: it is left out of the drawing.`;
    };
    const message =
      bad.length === 1
        ? describe(first)
        : `${bad.length} relations name a requirement or element that is not defined (the first: from "${first.src}" to "${first.dst}"); they are left out of the drawing.`;
    const entries = bad.map((r) => ({ at: { ast: r.ast, range: r.range }, message: describe(r) }));
    return this.warning({ code: REQUIREMENT_UNKNOWN_NODE, message, entries });
  }

  /** One warning at its first entry, listing every entry (`related`, `astIds`). */
  private warning({ code, message, entries }: WarningParts): RequirementWarning {
    const related: RelatedInfo[] = entries.map((e) => ({ message: e.message, range: e.at.range }));
    return {
      severity: 'warning',
      code,
      message,
      range: entries[0]?.at.range ?? { start: 0, end: 0 },
      related,
      // Core's render `Warning` keeps `astIds`, not `related` (as sankey's D394 warning).
      astIds: entries.map((e) => e.at.ast),
    };
  }
}
