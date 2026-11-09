/**
 * The usecase model builder: v12's `UsecaseModelBuilder` (`usecaseModelBuilder.ts`), fed the
 * drafts the parser reads from each statement and resolved once at the end, in v12's order
 * (`finalize`). Element order is the first offset at which each id is mentioned (relation ends
 * included); an end nothing declares becomes an ellipse use case; the last `direction`,
 * `accTitle` and `accDescr` win.
 *
 * v12 threw its first error. Here each check that threw records an error diagnostic with v12's
 * message without its location (the range carries it, D473; a conflict's earlier declaration is
 * related information) and the build goes on, skipping only what the error leaves undefined
 * (the declaration of a conflicting kind, an unresolved target), so N errors give N diagnostics.
 */
import type { Range } from '@mermaid-js/core/parser-kit';
import {
  USECASE_CONFLICT,
  USECASE_DUPLICATE_ID,
  USECASE_INVALID_ELEMENT,
  USECASE_INVALID_METADATA,
  USECASE_INVALID_NOTE,
  USECASE_INVALID_RELATION,
  USECASE_UNDECLARED_CLASS,
  USECASE_UNRESOLVED,
} from '../codes.ts';
import type {
  UsecaseActorType,
  UsecaseBoundaryType,
  UsecaseDirection,
  UsecaseShape,
} from '../model.ts';
import type { UsecaseElementKind } from './ast.ts';
import type {
  BoundaryDraft,
  BuildReport,
  Built,
  ElementDraft,
  EndpointDraft,
  JsonDraft,
  LabelDraft,
  MetadataAssignment,
  MetadataDraft,
  NoteDraft,
  PropertyDraft,
  RelationshipDraft,
} from './drafts.ts';

interface Origin {
  kind: UsecaseElementKind;
  range: Range;
  generated: boolean;
  /** The label a generated id was made from. */
  label?: string;
}

interface ElementState {
  kind: 'actor' | 'usecase';
  id: string;
  label: LabelDraft;
  range: Range;
  generated: boolean;
  parent?: { id: string; range: Range };
  shape?: UsecaseShape;
  stereotype?: string;
  stereotypeRange?: Range;
  classes: string[];
  styles: string[];
  actorType?: Exclude<UsecaseActorType, 'icon'>;
  icon?: string;
  business?: boolean;
}

interface BoundaryState {
  id: string;
  label: LabelDraft;
  range: Range;
  type?: UsecaseBoundaryType;
  classes: string[];
  styles: string[];
  members: string[];
}

interface Stylable {
  classes: string[];
  styles: string[];
}

/**
 * Append the `values` `target` lacks, in order (v12's `pushUnique`). Each list's members are
 * kept in a set, so many appends stay linear (pitfall 11).
 */
class UniqueLists {
  private readonly sets = new WeakMap<string[], Set<string>>();

  push(target: string[], values: readonly string[]): void {
    let set = this.sets.get(target);
    if (!set) this.sets.set(target, (set = new Set(target)));
    for (const v of values) {
      if (set.has(v)) continue;
      set.add(v);
      target.push(v);
    }
  }
}

/** Collects the drafts of one parse and resolves them into the model. */
export class UsecaseBuilder {
  private readonly elements: ElementDraft[] = [];
  private readonly boundaryDrafts: BoundaryDraft[] = [];
  private readonly jsonDrafts: JsonDraft[] = [];
  private readonly relationDrafts: RelationshipDraft[] = [];
  private readonly noteDrafts: NoteDraft[] = [];
  private readonly assignments: MetadataAssignment[] = [];
  private readonly classAssignments: {
    targets: { id: string; range: Range }[];
    classes: string[];
  }[] = [];
  private readonly styleAssignments: { target: string; range: Range; styles: string[] }[] = [];
  private readonly classDefinitions: { ids: string[]; styles: string[] }[] = [];
  private direction: UsecaseDirection = 'LR';
  accTitle = '';
  accDescr = '';

  private readonly unique = new UniqueLists();

  constructor(private readonly report: BuildReport) {}

  addElement(draft: ElementDraft): void {
    this.elements.push(draft);
  }
  addBoundary(draft: BoundaryDraft): void {
    this.boundaryDrafts.push(draft);
  }
  addJson(draft: JsonDraft): void {
    this.jsonDrafts.push(draft);
  }
  addRelationship(draft: RelationshipDraft): void {
    this.relationDrafts.push(draft);
  }
  addNote(astId: string, target: string, targetRange: Range, label: LabelDraft): void {
    this.noteDrafts.push({ astId, target, targetRange, label });
  }
  addMetadata(target: string, targetRange: Range, metadata: MetadataDraft): void {
    this.assignments.push({ target, targetRange, metadata });
  }
  addClassDef(ids: string[], styles: string[]): void {
    this.classDefinitions.push({ ids, styles });
  }
  addClassAssignment(targets: { id: string; range: Range }[], classes: string[]): void {
    this.classAssignments.push({ targets, classes });
  }
  addStyle(target: string, range: Range, styles: string[]): void {
    this.styleAssignments.push({ target, range, styles });
  }
  setDirection(direction: string): void {
    this.direction = (direction === 'TD' ? 'TB' : direction) as UsecaseDirection;
  }

  // ---- errors -------------------------------------------------------------------------

  private labelSuffix(label: string | undefined): string {
    return label === undefined ? '' : ` (label "${this.report.shown(label)}")`;
  }

  /** v12's `conflict()`: the message at `current`, the earlier declaration as related info. */
  private conflict(
    code: string,
    message: string,
    current: Range,
    previous: Range,
    currentLabel?: string,
    previousLabel?: string
  ): void {
    this.report.error(code, `${message}${this.labelSuffix(currentLabel)}`, current, [
      { message: `previous declaration${this.labelSuffix(previousLabel)}`, range: previous },
    ]);
  }

  private invalidMetadata(id: string, kind: string, property: PropertyDraft): void {
    this.report.error(
      USECASE_INVALID_METADATA,
      `Metadata property '${property.key}' is invalid for ${kind} '${id}'`,
      property.range
    );
  }

  // ---- finalize -----------------------------------------------------------------------

  build(): Built {
    const symbols = new Map<string, Origin>();
    const elements = new Map<string, ElementState>();
    const boundaries = new Map<string, BoundaryState>();
    const first = new Map<string, number>();
    const seen = (id: string, at: number) => {
      const was = first.get(id);
      if (was === undefined || at < was) first.set(id, at);
    };
    for (const r of this.relationDrafts) {
      seen(r.source.id, r.source.range.start);
      seen(r.target.id, r.target.range.start);
    }
    for (const d of [...this.elements, ...this.boundaryDrafts, ...this.jsonDrafts]) {
      seen(d.id, d.range.start);
    }
    this.declarations(symbols, elements, boundaries);
    const byFirst = <E extends { id: string }>(list: Iterable<E>): E[] =>
      [...list].sort((x, y) => (first.get(x.id) ?? 0) - (first.get(y.id) ?? 0));

    const relationships = this.relationships(symbols, elements, seen);
    this.applyMetadata(symbols, elements, boundaries, new Map(relationships.map((r) => [r.id, r])));
    this.checkElements(elements);
    this.members(boundaries);
    const notes = this.notes(symbols);
    const { actors, useCases } = materialize(byFirst(elements.values()));
    const boundaryList = byFirst(boundaries.values()).map((b) => ({
      id: b.id,
      label: b.label,
      type: b.type ?? 'rect',
      members: b.members,
      classes: b.classes,
      styles: b.styles,
    }));
    const jsonTables = byFirst(this.jsonDrafts).map((j) => ({
      ...j,
      classes: [...j.classes],
      styles: [] as string[],
    }));
    const classDefs = new Map<string, { id: string; styles: string[] }>();
    for (const def of this.classDefinitions) {
      for (const id of def.ids) classDefs.set(id, { id, styles: [...def.styles] });
    }

    // What `class` and `style` reach, by the kind the id resolves to (v12's `getStylable`). An
    // element's model object shares its state's `classes` and `styles` arrays.
    const stylables = new Map<string, Stylable>();
    const add = (id: string, kind: UsecaseElementKind, target: Stylable) => {
      if (symbols.get(id)?.kind === kind) stylables.set(id, target);
    };
    for (const e of elements.values()) add(e.id, e.kind, e);
    for (const b of boundaryList) add(b.id, 'boundary', b);
    for (const j of jsonTables) add(j.id, 'json', j);
    for (const r of relationships) if (r.explicitId) add(r.id, 'edge', r);
    this.classesAndStyles(stylables);

    return {
      actors,
      useCases,
      boundaries: boundaryList,
      relationships,
      notes,
      jsonTables,
      classDefs: [...classDefs.values()],
      direction: this.direction,
      accTitle: this.accTitle,
      accDescr: this.accDescr,
      symbols: new Map(
        [...symbols].map(([id, o]) => [
          id,
          o.label === undefined
            ? { kind: o.kind, generated: o.generated }
            : { kind: o.kind, generated: o.generated, label: o.label },
        ])
      ),
    };
  }

  /** Register the declarations in offset order (v12's `finalize`): elements, boundaries, JSON, edge ids. */
  private declarations(
    symbols: Map<string, Origin>,
    elements: Map<string, ElementState>,
    boundaries: Map<string, BoundaryState>
  ): void {
    type Declaration =
      | { at: number; element: ElementDraft }
      | { at: number; boundary: BoundaryDraft }
      | { at: number; json: JsonDraft }
      | { at: number; edge: { id: string; range: Range } };
    const list: Declaration[] = [
      ...this.elements.map((element) => ({ at: element.range.start, element })),
      ...this.boundaryDrafts.map((boundary) => ({ at: boundary.range.start, boundary })),
      ...this.jsonDrafts.map((json) => ({ at: json.range.start, json })),
      ...this.relationDrafts.flatMap((r) =>
        r.explicitId ? [{ at: r.explicitId.range.start, edge: r.explicitId }] : []
      ),
    ].sort((x, y) => x.at - y.at);
    for (const d of list) {
      if ('element' in d) this.collectElement(d.element, symbols, elements);
      else if ('boundary' in d) this.collectBoundary(d.boundary, symbols, boundaries);
      else if ('json' in d) this.registerUnique(symbols, d.json.id, 'json', d.json.range);
      else this.registerUnique(symbols, d.edge.id, 'edge', d.edge.range);
    }
  }

  private collectElement(
    draft: ElementDraft,
    symbols: Map<string, Origin>,
    states: Map<string, ElementState>
  ): void {
    const origin = symbols.get(draft.id);
    const draftLabel = draft.generated ? draft.label.raw : undefined;
    if (origin && origin.kind !== draft.kind) {
      this.conflict(
        USECASE_CONFLICT,
        `ID '${draft.id}' is declared as both ${origin.kind} and ${draft.kind}`,
        draft.range,
        origin.range,
        draftLabel,
        origin.generated ? origin.label : undefined
      );
      return;
    }
    if (origin && (origin.generated || draft.generated)) {
      this.conflict(
        USECASE_DUPLICATE_ID,
        `Generated ID '${draft.id}' collides with another declaration`,
        draft.range,
        origin.range,
        draftLabel,
        origin.generated ? origin.label : undefined
      );
      return;
    }
    const existing = states.get(draft.id);
    if (!existing) {
      const state: ElementState = {
        kind: draft.kind,
        id: draft.id,
        label: draft.label,
        range: draft.range,
        generated: draft.generated,
        classes: [...draft.classes],
        styles: [],
      };
      if (draft.parent) state.parent = draft.parent;
      if (draft.shape) state.shape = draft.shape;
      if (draft.stereotype !== undefined) {
        state.stereotype = draft.stereotype;
        state.stereotypeRange = draft.range;
      }
      this.declarationMetadata(state, draft.metadata);
      states.set(draft.id, state);
      symbols.set(draft.id, {
        kind: draft.kind,
        range: draft.range,
        generated: draft.generated,
        label: draft.label.raw,
      });
      return;
    }
    this.merge(existing, draft);
  }

  /** A later declaration of an element: v12's checks, then what it adds. */
  private merge(existing: ElementState, draft: ElementDraft): void {
    if (existing.label.raw !== draft.label.raw || existing.label.type !== draft.label.type) {
      this.conflict(
        USECASE_CONFLICT,
        `ID '${draft.id}' has conflicting labels`,
        draft.range,
        existing.range
      );
    }
    if (draft.shape && existing.shape && draft.shape !== existing.shape) {
      this.conflict(
        USECASE_CONFLICT,
        `Use case '${draft.id}' has conflicting shapes`,
        draft.range,
        existing.range
      );
    }
    if (draft.parent && existing.parent && draft.parent.id !== existing.parent.id) {
      this.conflict(
        USECASE_CONFLICT,
        `Element '${draft.id}' belongs to more than one system boundary`,
        draft.parent.range,
        existing.parent.range
      );
    }
    if (
      draft.stereotype !== undefined &&
      existing.stereotype !== undefined &&
      draft.stereotype !== existing.stereotype
    ) {
      this.conflict(
        USECASE_CONFLICT,
        `Element '${draft.id}' has conflicting stereotypes`,
        draft.range,
        existing.stereotypeRange ?? existing.range
      );
    }
    existing.shape ??= draft.shape;
    existing.parent ??= draft.parent;
    if (existing.stereotype === undefined && draft.stereotype !== undefined) {
      existing.stereotype = draft.stereotype;
      existing.stereotypeRange = draft.range;
    }
    this.unique.push(existing.classes, draft.classes);
    this.declarationMetadata(existing, draft.metadata);
  }

  private collectBoundary(
    draft: BoundaryDraft,
    symbols: Map<string, Origin>,
    states: Map<string, BoundaryState>
  ): void {
    const origin = symbols.get(draft.id);
    const draftLabel = draft.generated ? draft.label.raw : undefined;
    let registered = true;
    if (origin && origin.kind !== 'boundary') {
      this.conflict(
        USECASE_CONFLICT,
        `ID '${draft.id}' is declared as both ${origin.kind} and boundary`,
        draft.range,
        origin.range,
        draftLabel,
        origin.generated ? origin.label : undefined
      );
      registered = false;
    } else if (origin && (origin.generated || draft.generated)) {
      this.conflict(
        USECASE_DUPLICATE_ID,
        `Generated ID '${draft.id}' collides with another declaration`,
        draft.range,
        origin.range,
        draftLabel,
        origin.generated ? origin.label : undefined
      );
      registered = false;
    }
    const existing = states.get(draft.id);
    if (existing) {
      if (existing.label.raw !== draft.label.raw || existing.label.type !== draft.label.type) {
        this.conflict(
          USECASE_CONFLICT,
          `Boundary '${draft.id}' has conflicting titles`,
          draft.range,
          existing.range
        );
      }
      this.unique.push(existing.classes, draft.classes);
      return;
    }
    // A boundary whose id another kind holds still keeps its members (they name it as their
    // parent), but it is not the id's symbol.
    states.set(draft.id, {
      id: draft.id,
      label: draft.label,
      range: draft.range,
      classes: [...draft.classes],
      styles: [],
      members: [],
    });
    if (registered) {
      symbols.set(draft.id, {
        kind: 'boundary',
        range: draft.range,
        generated: draft.generated,
        label: draft.label.raw,
      });
    }
  }

  private registerUnique(
    symbols: Map<string, Origin>,
    id: string,
    kind: UsecaseElementKind,
    range: Range
  ): void {
    const previous = symbols.get(id);
    if (previous) {
      this.conflict(
        USECASE_DUPLICATE_ID,
        `ID '${id}' is declared more than once (${previous.kind} and ${kind})`,
        range,
        previous.range,
        undefined,
        previous.generated ? previous.label : undefined
      );
      return;
    }
    symbols.set(id, { kind, range, generated: false });
  }

  private relationships(
    symbols: Map<string, Origin>,
    states: Map<string, ElementState>,
    seen: (id: string, at: number) => void
  ): Built['relationships'] {
    const out: Built['relationships'] = [];
    let anonymous = 0;
    for (const draft of this.relationDrafts) {
      const sourceKind = this.resolveEndpoint(draft.source, symbols, states, seen);
      const targetKind = this.resolveEndpoint(draft.target, symbols, states, seen);
      this.checkRelationship(draft, sourceKind, targetKind, symbols);
      const relationship: Built['relationships'][number] = {
        astId: draft.astId,
        id: draft.explicitId?.id ?? `edge-${anonymous++}`,
        explicitId: draft.explicitId !== undefined,
        source: draft.source.id,
        target: draft.target.id,
        type: draft.type,
        arrowType: draft.arrowType,
        minlen: draft.minlen,
        classes: [],
        styles: [],
        animate: false,
      };
      if (draft.label) relationship.label = draft.label;
      out.push(relationship);
    }
    return out;
  }

  private resolveEndpoint(
    end: EndpointDraft,
    symbols: Map<string, Origin>,
    states: Map<string, ElementState>,
    seen: (id: string, at: number) => void
  ): UsecaseElementKind {
    if (end.classes && !end.declaration) {
      this.report.error(
        USECASE_UNDECLARED_CLASS,
        `Relationship endpoint '${end.id}' uses ::: without declaring the node`,
        end.range
      );
    }
    const origin = symbols.get(end.id);
    if (origin) return origin.kind;
    states.set(end.id, {
      kind: 'usecase',
      id: end.id,
      label: end.label,
      range: end.range,
      generated: end.generated,
      shape: 'ellipse',
      classes: [],
      styles: [],
    });
    symbols.set(end.id, {
      kind: 'usecase',
      range: end.range,
      generated: end.generated,
      label: end.label.raw,
    });
    seen(end.id, end.range.start);
    return 'usecase';
  }

  private checkRelationship(
    draft: RelationshipDraft,
    sourceKind: UsecaseElementKind,
    targetKind: UsecaseElementKind,
    symbols: Map<string, Origin>
  ): void {
    const allowed = (kind: UsecaseElementKind) =>
      kind === 'actor' || kind === 'usecase' || kind === 'json';
    const at = (id: string) => symbols.get(id)?.range ?? draft.range;
    if (!allowed(sourceKind)) {
      this.conflict(
        USECASE_INVALID_RELATION,
        `Relationship source '${draft.source.id}' cannot be ${sourceKind}`,
        draft.source.range,
        at(draft.source.id)
      );
      return;
    }
    if (!allowed(targetKind)) {
      this.conflict(
        USECASE_INVALID_RELATION,
        `Relationship target '${draft.target.id}' cannot be ${targetKind}`,
        draft.target.range,
        at(draft.target.id)
      );
      return;
    }
    let message: string | undefined;
    if (
      (draft.type === 'include' || draft.type === 'extend') &&
      (sourceKind !== 'usecase' || targetKind !== 'usecase')
    ) {
      message = `${draft.type} relationship requires use-case endpoints`;
    } else if (
      draft.type === 'generalization' &&
      ((sourceKind !== 'actor' && sourceKind !== 'usecase') || sourceKind !== targetKind)
    ) {
      message = 'Generalization requires actor-to-actor or use-case-to-use-case endpoints';
    } else if (
      draft.type === 'association' &&
      (sourceKind === 'json' || targetKind === 'json') &&
      draft.arrowType !== 'point' &&
      draft.arrowType !== 'reversedPoint' &&
      draft.arrowType !== 'line'
    ) {
      message = `JSON relationship '${draft.source.id}' to '${draft.target.id}' permits only point, reversed-point, or markerless solid association`;
    }
    if (message !== undefined) this.report.error(USECASE_INVALID_RELATION, message, draft.range);
  }

  private applyMetadata(
    symbols: Map<string, Origin>,
    elements: Map<string, ElementState>,
    boundaries: Map<string, BoundaryState>,
    edges: Map<string, Built['relationships'][number]>
  ): void {
    for (const a of this.assignments) {
      const origin = symbols.get(a.target);
      if (!origin) {
        const inferred = inferKind(a.metadata);
        this.report.error(
          USECASE_UNRESOLVED,
          `Metadata target '${a.target}' is unresolved${inferred ? ` (metadata implies ${inferred})` : ''}`,
          a.targetRange
        );
        continue;
      }
      const element = elements.get(a.target);
      if ((origin.kind === 'actor' || origin.kind === 'usecase') && element) {
        this.elementMetadata(element, a.metadata);
      } else if (origin.kind === 'boundary') {
        const boundary = boundaries.get(a.target);
        for (const p of a.metadata.properties) {
          if (p.key !== 'type' || (p.value !== 'rect' && p.value !== 'package')) {
            this.invalidMetadata(a.target, origin.kind, p);
          } else if (boundary) boundary.type = p.value;
        }
      } else if (origin.kind === 'edge') this.edgeMetadata(a, edges.get(a.target));
      else for (const p of a.metadata.properties) this.invalidMetadata(a.target, origin.kind, p);
    }
    for (const edge of edges.values()) if (edge.animation) edge.animate = true;
  }

  /** A standalone `Id@{ … }` on an actor or use case: it replaces what declarations set. */
  private elementMetadata(element: ElementState, metadata: MetadataDraft): void {
    for (const p of metadata.properties) {
      if (element.kind === 'actor') this.actorProperty(element, p, true);
      else if (p.key === 'business' && typeof p.value === 'boolean') element.business = p.value;
      else this.invalidMetadata(element.id, element.kind, p);
    }
  }

  /** `e1@{ animate: true }`, `e1@{ animation: fast }`. */
  private edgeMetadata(
    a: MetadataAssignment,
    edge: Built['relationships'][number] | undefined
  ): void {
    if (!edge) {
      this.report.error(
        USECASE_UNRESOLVED,
        `Metadata target '${a.target}' is not an explicit edge`,
        a.targetRange
      );
      return;
    }
    for (const p of a.metadata.properties) {
      if (p.key === 'animate' && typeof p.value === 'boolean') edge.animate = p.value;
      else if (p.key === 'animation' && (p.value === 'fast' || p.value === 'slow')) {
        edge.animation = p.value;
        edge.animate = true;
      } else this.invalidMetadata(a.target, 'edge', p);
    }
  }

  private declarationMetadata(state: ElementState, metadata: MetadataDraft | undefined): void {
    for (const p of metadata?.properties ?? []) {
      if (state.kind === 'actor') this.actorProperty(state, p, false);
      else if (p.key === 'business' && typeof p.value === 'boolean') {
        if (state.business !== undefined && state.business !== p.value) {
          this.conflict(
            USECASE_CONFLICT,
            `Use case '${state.id}' has conflicting business metadata`,
            p.range,
            state.range
          );
          continue;
        }
        state.business = p.value;
      } else this.invalidMetadata(state.id, state.kind, p);
    }
  }

  /** `type`, `icon` or `business` of an actor; a standalone `X@{…}` replaces, a declaration may not. */
  private actorProperty(state: ElementState, p: PropertyDraft, replace: boolean): void {
    const clash = (what: string) =>
      this.conflict(
        USECASE_CONFLICT,
        `Actor '${state.id}' has conflicting ${what} metadata`,
        p.range,
        state.range
      );
    if (
      p.key === 'type' &&
      (p.value === 'normal' || p.value === 'hollow' || p.value === 'awesome')
    ) {
      if (!replace && state.actorType !== undefined && state.actorType !== p.value) clash('type');
      else state.actorType = p.value;
    } else if (p.key === 'icon' && typeof p.value === 'string') {
      if (!replace && state.icon !== undefined && state.icon !== p.value) clash('icon');
      else state.icon = p.value;
    } else if (p.key === 'business' && typeof p.value === 'boolean') {
      if (!replace && state.business !== undefined && state.business !== p.value) clash('business');
      else state.business = p.value;
    } else this.invalidMetadata(state.id, state.kind, p);
  }

  private checkElements(states: Map<string, ElementState>): void {
    for (const s of states.values()) {
      const type: UsecaseActorType = s.icon ? 'icon' : (s.actorType ?? 'normal');
      let message: string | undefined;
      if (s.kind === 'actor') {
        if (s.icon && s.actorType && s.actorType !== 'normal') {
          message = `Actor '${s.id}' cannot combine icon with type '${s.actorType}'`;
        } else if (s.business && (type === 'icon' || type === 'awesome')) {
          message = `Business actor '${s.id}' must use normal or hollow geometry`;
        }
      } else if ((s.shape ?? 'ellipse') === 'rect' && s.business) {
        message = `Rectangular use case '${s.id}' cannot be a business use case`;
      }
      if (message !== undefined) this.report.error(USECASE_INVALID_ELEMENT, message, s.range);
    }
  }

  /** Each boundary's members, in declaration order. */
  private members(boundaries: Map<string, BoundaryState>): void {
    const drafts = [...this.elements].sort((a, b) => a.range.start - b.range.start);
    for (const d of drafts) {
      if (!d.parent) continue;
      const boundary = boundaries.get(d.parent.id);
      if (boundary) this.unique.push(boundary.members, [d.id]);
    }
  }

  private notes(symbols: Map<string, Origin>): Built['notes'] {
    const out: Built['notes'] = [];
    for (const d of this.noteDrafts) {
      const origin = symbols.get(d.target);
      if (!origin) {
        this.report.error(
          USECASE_UNRESOLVED,
          `Note target '${d.target}' is unresolved`,
          d.targetRange
        );
        continue;
      }
      if (origin.kind !== 'actor' && origin.kind !== 'usecase') {
        this.conflict(
          USECASE_INVALID_NOTE,
          `Note target '${d.target}' must be an actor or use case, not ${origin.kind}`,
          d.targetRange,
          origin.range
        );
        continue;
      }
      out.push({ astId: d.astId, id: `note-${out.length}`, target: d.target, label: d.label });
    }
    return out;
  }

  private classesAndStyles(stylables: Map<string, Stylable>): void {
    const target = (id: string, range: Range): Stylable | undefined => {
      const found = stylables.get(id);
      if (!found) {
        this.report.error(
          USECASE_UNRESOLVED,
          `Class/style target '${id}' is unresolved or anonymous`,
          range
        );
      }
      return found;
    };
    for (const a of this.classAssignments) {
      for (const t of a.targets) {
        const s = target(t.id, t.range);
        if (s) this.unique.push(s.classes, a.classes);
      }
    }
    for (const a of this.styleAssignments) target(a.target, a.range)?.styles.push(...a.styles);
  }
}

/** The actors and use cases of the resolved element states, in the given order. */
function materialize(states: readonly ElementState[]): Pick<Built, 'actors' | 'useCases'> {
  const actors: Built['actors'] = [];
  const useCases: Built['useCases'] = [];
  for (const s of states) {
    const common = {
      id: s.id,
      label: s.label,
      business: s.business ?? false,
      classes: s.classes,
      styles: s.styles,
      ...(s.stereotype !== undefined ? { stereotype: s.stereotype } : {}),
      ...(s.parent ? { parentId: s.parent.id } : {}),
    };
    if (s.kind === 'actor') {
      const type = s.icon ? 'icon' : (s.actorType ?? 'normal');
      actors.push({ ...common, type, ...(s.icon ? { icon: s.icon } : {}) });
    } else useCases.push({ ...common, shape: s.shape ?? 'ellipse' });
  }
  return { actors, useCases };
}

/** v12's `inferMetadataKind`: the one kind the keys allow, for the unresolved-target message. */
function inferKind(metadata: MetadataDraft): string | undefined {
  const possible = new Set(['actor', 'usecase', 'boundary', 'edge']);
  for (const p of metadata.properties) {
    if (p.key === 'icon') {
      possible.clear();
      possible.add('actor');
    } else if (p.key === 'animate' || p.key === 'animation') {
      possible.clear();
      possible.add('edge');
    } else if (p.key === 'type') {
      possible.clear();
      if (p.value === 'rect' || p.value === 'package') possible.add('boundary');
      else if (p.value === 'normal' || p.value === 'hollow' || p.value === 'awesome') {
        possible.add('actor');
      }
    } else if (p.key === 'business') {
      possible.delete('boundary');
      possible.delete('edge');
    } else return undefined;
  }
  return possible.size === 1 ? [...possible][0] : undefined;
}
