// What ER text output cannot show (D82, R-ASCII-5): one `ASCII_DROPPED` warning per feature
// kind. Each names the AST ids of what it dropped: the elements from the model, and the
// statements when the AST is given.
import type { AstNode } from '@mermaid-js/core/parser-kit';
import type { CheckedStyle } from '@mermaid-js/core/svg';
import type { ErModel } from '../parser/index.ts';
import type { ErWarning } from '../layout/context.ts';
import type { ErPrepared } from '../layout/prepare.ts';
import { styled } from '@mermaid-js/shared/ascii';
import { statements } from '@mermaid-js/shared/ascii';
import { asciiDropped } from '@mermaid-js/shared/ascii';

/** The feature kinds an `ASCII_DROPPED` warning names, in the order they are reported. */
export type AsciiDroppedFeature = 'style' | 'accessibility';

/** One feature kind text output dropped (D82). */
export interface AsciiDroppedWarning extends ErWarning {
  readonly code: 'ASCII_DROPPED';
  readonly feature: AsciiDroppedFeature;
  readonly astIds: readonly string[];
}

/** Relationships the repair router found no free lane for (D78). */
export interface AsciiRouteWarning extends ErWarning {
  readonly code: 'ASCII_ROUTE';
  readonly astIds: readonly string[];
}

export type AsciiWarning = AsciiDroppedWarning | AsciiRouteWarning;

const WHAT: Record<AsciiDroppedFeature, string> = {
  style: 'colours and styles (style, classDef, class)',
  accessibility: 'accTitle and accDescr',
};

// The statements behind each feature kind (`ErSimpleKind`).
const STATEMENTS: Record<AsciiDroppedFeature, readonly string[]> = {
  style: ['Style', 'ClassDef', 'Class'],
  accessibility: ['AccTitle', 'AccDescr'],
};

/**
 * The warnings for one drawing: the features without a text form, one per kind (D82). `ast`
 * adds the statements' ids (`style:1`, `classDef:1`, `accTitle:1`, …).
 */
export function asciiWarnings(model: ErModel, er: ErPrepared, ast?: AstNode): AsciiWarning[] {
  const found: Partial<Record<AsciiDroppedFeature, Set<string>>> = {};
  const add = (feature: AsciiDroppedFeature, id?: string): void => {
    const ids = (found[feature] ??= new Set());
    if (id) ids.add(id);
  };
  for (const v of [...er.groups, ...er.entities]) if (styled(v.style)) add('style', v.id);
  if (model.accTitle || model.accDescr) add('accessibility');
  const stmts = new Map<string, string[]>();
  statements(ast, stmts);
  const out: AsciiWarning[] = [];
  for (const feature of Object.keys(WHAT) as AsciiDroppedFeature[]) {
    // A statement alone is enough: a `classDef` no entity uses still has no text form.
    for (const kind of STATEMENTS[feature])
      for (const id of stmts.get(kind) ?? []) add(feature, id);
    const ids = found[feature];
    if (!ids) continue;
    out.push(asciiDropped(feature, [...ids], WHAT[feature]));
  }
  return out;
}
