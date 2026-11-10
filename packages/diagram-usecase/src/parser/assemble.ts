/**
 * After the parse (#563): the AST ids of the element mentions, which wait for the kinds the
 * model resolves (D475); the {@link UsecaseModel}, with each text shown as v12 drew it; and the
 * symbols (D477).
 */
import type { AstId, Diagnostic, ParseState, Range } from '@mermaid-js/core/parser-kit';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import type { UsecaseLabelType, UsecaseModel } from '../model.ts';
import type {
  UsecaseBoundaryNode,
  UsecaseElementKind,
  UsecaseElementNode,
  UsecaseJsonNode,
} from './ast.ts';
import type { Built, LabelDraft } from './drafts.ts';
import { jsonRows } from './json.ts';
import { esc, shown } from './text.ts';

/** An element, boundary or JSON node, and the kind it declares (else its name's kind). */
export interface Mention {
  node: UsecaseElementNode | UsecaseBoundaryNode | UsecaseJsonNode;
  kind?: UsecaseElementKind;
}

/** One occurrence of a name, for the symbols. */
export interface Occurrence {
  id: string;
  range: Range;
}

/** `kind:name` for the first mention of a name as `kind`, then `@2`, `@3`, … (D475). */
export function assignIds(mentions: readonly Mention[], built: Built): void {
  const counts = new Map<string, number>();
  for (const m of mentions) {
    const kind = m.kind ?? built.symbols.get(m.node.name)?.kind ?? 'usecase';
    if (m.node.type === 'Element') m.node.kind = kind;
    const base = astIdOf(kind, m.node.name);
    const n = (counts.get(base) ?? 0) + 1;
    counts.set(base, n);
    m.node.id = n === 1 ? base : `${base}@${n}`;
  }
}

/** The AST id of the first mention of `id` as `kind`: the model element's. */
const astIdOf = (kind: UsecaseElementKind, id: string): AstId => `${kind}:${esc(id)}`;

const label = (l: LabelDraft): { label: string; labelType: UsecaseLabelType } => ({
  label: shown(l.raw),
  labelType: l.type,
});
const look = (e: { classes: string[]; styles: string[] }) => ({
  classes: [...e.classes],
  styles: e.styles.map(shown),
});
const stereotype = (s: string | undefined) => (s === undefined ? {} : { stereotype: shown(s) });

/** The model from the builder's result, frozen. */
export function assembleModel(
  built: Built,
  pre: PreprocessResult,
  diagnostics: readonly Diagnostic[]
): UsecaseModel {
  const model: UsecaseModel = {
    actors: built.actors.map((a) => ({
      astId: astIdOf('actor', a.id),
      ...a,
      ...label(a.label),
      ...stereotype(a.stereotype),
      ...look(a),
    })),
    useCases: built.useCases.map((u) => ({
      astId: astIdOf('usecase', u.id),
      ...u,
      ...label(u.label),
      ...stereotype(u.stereotype),
      ...look(u),
    })),
    boundaries: built.boundaries.map((b) => ({
      astId: astIdOf('boundary', b.id),
      ...b,
      members: [...b.members],
      ...label(b.label),
      ...look(b),
    })),
    relationships: built.relationships.map((r) => {
      const { label: l, ...rest } = r;
      return { ...rest, ...(l ? label(l) : {}), ...look(r) };
    }),
    notes: built.notes.map((n) => ({ ...n, ...label(n.label) })),
    jsonTables: built.jsonTables.map((j) => ({
      astId: astIdOf('json', j.id),
      id: j.id,
      value: j.value,
      propertyOrder: j.propertyOrder,
      // v12 kept the JSON as its lexer read it and drew each code as its character.
      rows: jsonRows(j.value, j.propertyOrder).map((row) => ({
        key: shown(row.key),
        accessibleKey: shown(row.accessibleKey),
        value: shown(row.value),
      })),
      ...look(j),
    })),
    classDefs: built.classDefs.map((c) => ({ id: c.id, styles: c.styles.map(shown) })),
    direction: built.direction,
    accTitle: shown(built.accTitle),
    accDescr: shown(built.accDescr),
    warnings: diagnostics.filter((d) => d.severity === 'warning'),
  };
  const title = pre.frontMatter?.title;
  if (title !== undefined) model.title = title;
  return Object.freeze(model);
}

/**
 * The symbols (D477): every mention of an actor, use case, boundary, JSON table or explicit
 * edge id; the first by offset defines it. A quoted element's symbol is its label (D191), and
 * a bare mention of its generated id refers to the same symbol. Names that resolve to nothing
 * (an unresolved `class` target) have no symbol.
 */
export function recordSymbols(
  st: ParseState,
  occurrences: readonly Occurrence[],
  built: Built
): void {
  const defined = new Set<string>();
  const list = [...occurrences].sort((a, b) => a.range.start - b.range.start);
  for (const o of list) {
    const s = built.symbols.get(o.id);
    if (!s) continue;
    const name = s.generated && s.label !== undefined ? shown(s.label) : o.id;
    const def = !defined.has(o.id);
    defined.add(o.id);
    st.symbol(name, s.kind, o.range, def ? 'def' : 'ref');
  }
}
