/**
 * v12's `RequirementDB` (`requirementDb.ts`) as a builder for the {@link RequirementModel}: the
 * calls its grammar actions made (`addRequirement`, `addElement`, `addRelationship`,
 * `setCssStyle`, `setClass`, `defineClass`, `setDirection`, the acc setters), with v12's order
 * and lookup rules, so model parity holds. One per parse. On top of v12, as decided:
 *
 * - D433: what v12 drops silently is recorded for one `REQUIREMENT_STYLE_DROPPED` warning: a
 *   `style` that names a box not defined yet (v12 stops there, so the ids after it get nothing
 *   either), a `class` or `a:::c` that names one (v12 skips it), and a `classDef default` that
 *   boxes are defined after (v12 copies its styles only to the boxes already there); every
 *   entry any statement adds to a box's classes or styles, or to a class's styles, counts
 *   towards the cap (`maxStyleCopies`), past which one `LAYOUT_LIMIT` error is reported and no
 *   more are made (R-SEC-5: `class a,a,… c,c,…` copies multiplicatively);
 * - D434: the first of duplicate definitions is kept (as v12) with one `REQUIREMENT_DUPLICATE`
 *   warning; a requirement and an element of one name are both kept, lookups reaching the
 *   requirement first (as v12), with one `REQUIREMENT_SHARED_NAME` warning; relations to names
 *   no box has stay in the model with one `REQUIREMENT_UNKNOWN_NODE` warning.
 */
import { LIMIT_CODES } from '@mermaid-js/core/limits';
import type { AstId, Range, RelatedInfo } from '@mermaid-js/core/parser-kit';
import {
  MAX_STYLE_COPIES,
  REQUIREMENT_DUPLICATE,
  REQUIREMENT_SHARED_NAME,
  REQUIREMENT_STYLE_DROPPED,
  REQUIREMENT_UNKNOWN_NODE,
} from '../codes.ts';
import type {
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
  VerifyMethod,
} from '../model.ts';

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
  maxStyleCopies?: number;
  /** Record an error diagnostic (the style-copy cap). */
  error(code: string, message: string, range: Range): void;
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

interface Lost {
  at: At;
  message: (lines: (offset: number) => number) => string;
}

const EMPTY_REQUIREMENT: RequirementFields = {
  requirementId: '',
  text: '',
  risk: '',
  verifyMethod: '',
};
const EMPTY_ELEMENT: ElementFields = { type: '', docRef: '' };

export class RequirementBuilder {
  private readonly requirements = new Map<string, Writable<Requirement>>();
  private readonly elements = new Map<string, Writable<Element>>();
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
  /** The statement being applied, for the cap's error. */
  private current: Range = { start: 0, end: 0 };
  private limited = false;
  private readonly lost: Lost[] = [];
  /** `classDef default` statements and how many boxes there were when each was read. */
  private readonly defaults: { at: At; boxes: number }[] = [];
  /** Box names in definition order, for the boxes a `classDef default` missed. */
  private readonly order: { name: string; range: Range }[] = [];
  private readonly duplicates: Duplicate[] = [];
  private readonly shared: Shared[] = [];

  constructor(private readonly options: BuilderOptions) {
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
    const first = this.requirements.get(name);
    if (first) {
      this.duplicates.push({ at, first: first.range, element: false, name });
      return;
    }
    const other = this.elements.get(name);
    if (other) this.shared.push({ at, other: other.range, name });
    const box: Writable<Requirement> = {
      ast: at.ast,
      name,
      range: at.range,
      nameRange: at.nameRange,
      kind,
      ...fields,
      classes: ['default'],
      styles: [],
      slot: 0,
    };
    this.requirements.set(name, box);
    this.defined(box);
  }

  /** v12 `addElement`: the first definition of a name wins. */
  addElement(name: string, at: DefAt, fields: ElementFields = EMPTY_ELEMENT): void {
    const first = this.elements.get(name);
    if (first) {
      this.duplicates.push({ at, first: first.range, element: true, name });
      return;
    }
    const other = this.requirements.get(name);
    if (other) this.shared.push({ at, other: other.range, name });
    const box: Writable<Element> = {
      ast: at.ast,
      name,
      range: at.range,
      nameRange: at.nameRange,
      ...fields,
      classes: ['default'],
      styles: [],
      slot: 0,
    };
    this.elements.set(name, box);
    this.defined(box);
  }

  /** v12 `addRelationship`: kept whatever its ends name. */
  addRelationship(kind: RelationshipKind, src: string, dst: string, at: At): void {
    this.relations.push({ kind, src, dst, at });
  }

  /** v12 `setCssStyle`: stops at the first id that names no box yet (D433: recorded). */
  setCssStyle(ids: readonly Ref[], styles: readonly string[], at: At): void {
    this.current = at.range;
    for (let k = 0; k < ids.length && !this.limited; k++) {
      const id = ids[k] as Ref;
      const node = this.lookup(id.name);
      if (!node) {
        const rest = ids.length - k - 1;
        this.dropped(at, id, 'style', rest);
        return;
      }
      for (const s of styles) this.push(node.styles, ...s.split(','));
    }
  }

  /** v12 `setClass`: skips an id that names no box yet (D433: recorded). */
  setClass(ids: readonly Ref[], classNames: readonly string[], at: At): void {
    this.current = at.range;
    for (const id of ids) {
      if (this.limited) return;
      const node = this.lookup(id.name);
      if (!node) {
        this.dropped(at, id, 'class', 0);
        continue;
      }
      for (const name of classNames) {
        if (!this.push(node.classes, name)) return;
        this.has(node, name);
        const styles = this.classes.get(name)?.styles;
        if (styles) this.push(node.styles, ...styles);
      }
    }
  }

  /**
   * v12 `defineClass`: adds the styles to each class, and copies them to every box that has
   * the class now (so `classDef default` reaches the boxes defined before it only, D433).
   */
  defineClass(ids: readonly string[], styles: readonly string[], at: At): void {
    this.current = at.range;
    for (const id of ids) {
      if (this.limited) return;
      let c = this.classes.get(id);
      if (!c) this.classes.set(id, (c = { name: id, styles: [], textStyles: [] }));
      for (const s of styles) {
        if (s.includes('color')) this.push(c.textStyles, s.replace('fill', 'bgFill'));
        this.push(c.styles, s);
      }
      const split = styles.flatMap((s) => s.split(','));
      for (const box of this.byClass.get(id) ?? []) {
        if (!this.push(box.styles, ...split)) return;
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
    const resolve = (name: string) =>
      this.requirements.get(name)?.ast ?? this.elements.get(name)?.ast;
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

  /** A box of `name`: the requirement, else the element (v12's order). */
  private lookup(name: string): Box | undefined {
    return this.requirements.get(name) ?? this.elements.get(name);
  }

  private defined(box: Box): void {
    this.boxes++;
    this.order.push({ name: box.name, range: box.range });
    if (!this.firstOf.has(box.name)) this.firstOf.set(box.name, box.range);
    this.has(box, 'default');
  }

  /** Record that `box` has class `name`. */
  private has(box: Box, name: string): void {
    let boxes = this.byClass.get(name);
    if (!boxes) this.byClass.set(name, (boxes = new Set()));
    boxes.add(box);
  }

  /** Push `items` onto `list`, counting each against the cap (D433); false past it. */
  private push(list: string[], ...items: string[]): boolean {
    if (this.limited) return false;
    if (this.copies + items.length > this.maxCopies) {
      this.limited = true;
      this.options.error(
        LIMIT_CODES.maxLayoutWork,
        `The diagram's \`style\`, \`class\` and \`classDef\` statements copy more than ${this.maxCopies} styles and classes onto its boxes, the limit; the rest were left out. Name each box and class once per statement.`,
        this.current
      );
      return false;
    }
    this.copies += items.length;
    for (const item of items) list.push(item);
    return true;
  }

  private dropped(at: At, id: Ref, what: 'style' | 'class', rest: number): void {
    const { name } = id;
    this.lost.push({
      at,
      message: (line) => {
        const box = this.firstOf.get(name);
        const why = box
          ? `"${name}" is defined only later, at line ${line(box.start)}`
          : `no requirement or element is named "${name}"`;
        const after =
          rest === 0
            ? ''
            : ` The ${rest === 1 ? 'name' : `${rest} names`} after it ${rest === 1 ? 'gets' : 'get'} no style either.`;
        const fix = box ? ' Move the statement after the definition.' : '';
        return `The ${what} for "${name}" is lost: ${why}.${after}${fix}`;
      },
    });
  }

  private styleWarning(line: (offset: number) => number): RequirementWarning | undefined {
    const entries: Lost[] = [...this.lost];
    for (const { at, boxes } of this.defaults) {
      const first = this.order[boxes];
      if (!first) continue;
      const more = this.order.length - boxes - 1;
      entries.push({
        at,
        message: (l) =>
          `The default class reaches only the boxes defined before it: "${first.name}" (line ${l(first.range.start)})${more > 0 ? ` and ${more} more get` : ' gets'} none of its styles. Move the \`classDef default\` after the last definition.`,
      });
    }
    entries.sort((a, b) => a.at.range.start - b.at.range.start);
    const first = entries[0];
    if (!first) return undefined;
    const related: RelatedInfo[] = entries.map((e) => ({
      message: e.message(line),
      range: e.at.range,
    }));
    const message =
      entries.length === 1
        ? (related[0]?.message ?? '')
        : `${entries.length} styling statements are lost to the order of the text (the first at line ${line(first.at.range.start)}): \`style\`, \`class\` and \`:::\` reach only the boxes defined before them.`;
    return this.warning(REQUIREMENT_STYLE_DROPPED, message, first.at.range, related, entries);
  }

  private duplicateWarning(line: (offset: number) => number): RequirementWarning | undefined {
    const first = this.duplicates[0];
    if (!first) return undefined;
    const describe = (d: Duplicate) =>
      `The ${d.element ? 'element' : 'requirement'} "${d.name}" is defined again: the definition at line ${line(d.first.start)} is kept, and this one is left out.`;
    const related = this.duplicates.map((d) => ({ message: describe(d), range: d.at.range }));
    const message =
      this.duplicates.length === 1
        ? describe(first)
        : `${this.duplicates.length} requirements or elements are defined again (the first: "${first.name}"); the first definition of each is kept, and the later ones are left out.`;
    return this.warning(
      REQUIREMENT_DUPLICATE,
      message,
      first.at.range,
      related,
      this.duplicates.map((d) => ({ at: d.at }))
    );
  }

  private sharedWarning(line: (offset: number) => number): RequirementWarning | undefined {
    const first = this.shared[0];
    if (!first) return undefined;
    const describe = (s: Shared) =>
      `A requirement and an element are both named "${s.name}" (the other at line ${line(s.other.start)}): both are drawn, and relations, \`style\` and \`class\` naming "${s.name}" reach the requirement.`;
    const related = this.shared.map((s) => ({ message: describe(s), range: s.at.range }));
    const message =
      this.shared.length === 1
        ? describe(first)
        : `${this.shared.length} names are each used by a requirement and an element (the first: "${first.name}"): both boxes are drawn, and relations, \`style\` and \`class\` reach the requirement.`;
    return this.warning(
      REQUIREMENT_SHARED_NAME,
      message,
      first.at.range,
      related,
      this.shared.map((s) => ({ at: s.at }))
    );
  }

  private unknownWarning(relations: readonly Relation[]): RequirementWarning | undefined {
    const bad = relations.filter((r) => r.from === undefined || r.to === undefined);
    const first = bad[0];
    if (!first) return undefined;
    const describe = (r: Relation) => {
      const names = [
        r.from === undefined ? r.src : undefined,
        r.to === undefined ? r.dst : undefined,
      ]
        .filter((n): n is string => n !== undefined)
        .filter((n, k, all) => all.indexOf(n) === k)
        .map((n) => `"${n}"`);
      return `The relation from "${r.src}" to "${r.dst}" names ${names.join(' and ')}, which no requirement or element is called: it is left out of the drawing.`;
    };
    const related = bad.map((r) => ({ message: describe(r), range: r.range }));
    const message =
      bad.length === 1
        ? describe(first)
        : `${bad.length} relations name a requirement or element that is not defined (the first: from "${first.src}" to "${first.dst}"); they are left out of the drawing.`;
    return this.warning(
      REQUIREMENT_UNKNOWN_NODE,
      message,
      first.range,
      related,
      bad.map((r) => ({ at: { ast: r.ast, range: r.range } }))
    );
  }

  private warning(
    code: string,
    message: string,
    range: Range,
    related: RelatedInfo[],
    entries: readonly { at: At }[]
  ): RequirementWarning {
    return {
      severity: 'warning',
      code,
      message,
      range,
      related,
      // Core's render `Warning` keeps `astIds`, not `related` (as sankey's D394 warning).
      astIds: entries.map((e) => e.at.ast),
    };
  }
}
