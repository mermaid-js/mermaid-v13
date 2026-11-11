// What requirement text output cannot show (D82, R-ASCII-5): one `ASCII_DROPPED` warning per
// feature kind, as ER's. Each names the AST ids of what it dropped: the boxes from the views,
// and the statements when the AST is given.
import type { AstNode } from '@mermaid-js/core/parser-kit';
import type { CheckedStyle } from '@mermaid-js/core/svg';
import { Style, type MeasuredLabel } from '@mermaid-js/core/text';
import type { RequirementLayoutWarning } from '../layout/context.ts';
import { requirementCurve, type RequirementPrepared } from '../layout/prepare.ts';
import type { RequirementModel } from '../model.ts';
import { styled } from '@mermaid-js/shared/ascii';
import { statements } from '@mermaid-js/shared/ascii';
import { emphasised } from '@mermaid-js/shared/ascii';
import { asciiDropped } from '@mermaid-js/shared/ascii';

/** The feature kinds an `ASCII_DROPPED` warning names, in the order they are reported. */
export type AsciiDroppedFeature = 'style' | 'curve' | 'emphasis' | 'accessibility';

/** One feature kind text output dropped (D82). */
export interface AsciiDroppedWarning extends RequirementLayoutWarning {
  readonly code: 'ASCII_DROPPED';
  readonly feature: AsciiDroppedFeature;
  readonly astIds: readonly string[];
}

/** Relations the repair router found no free lane for (D78). */
export interface AsciiRouteWarning extends RequirementLayoutWarning {
  readonly code: 'ASCII_ROUTE';
  readonly astIds: readonly string[];
}

export type AsciiWarning = AsciiDroppedWarning | AsciiRouteWarning;

const WHAT: Record<AsciiDroppedFeature, string> = {
  style: 'colours and styles (style, classDef, class)',
  curve: 'edge curves',
  emphasis: 'bold and italic text',
  accessibility: 'accTitle and accDescr',
};

// The statements behind each feature kind (`RequirementSimpleKind`).
const STATEMENTS: Record<AsciiDroppedFeature, readonly string[]> = {
  style: ['Style', 'ClassDef', 'Class'],
  curve: [],
  emphasis: [],
  accessibility: ['AccTitle', 'AccDescr'],
};

/** The curves SVG draws with square corners, as text does. */
const SQUARE = new Set(['step', 'stepBefore', 'stepAfter']);

/**
 * The warnings for one drawing: the features without a text form, one per kind (D82). `ast`
 * adds the statements' ids (`style:1`, `classDef:1`, `accTitle:1`, …). `curve` is the
 * `flowchart.curve` the config sets: text lines are always square (pitfall 22).
 */
export function asciiWarnings(
  model: RequirementModel,
  prepared: RequirementPrepared,
  ast?: AstNode,
  curve?: string
): AsciiWarning[] {
  const found: Partial<Record<AsciiDroppedFeature, Set<string>>> = {};
  const add = (feature: AsciiDroppedFeature, id?: string): void => {
    const ids = (found[feature] ??= new Set());
    if (id) ids.add(id);
  };
  for (const v of prepared.boxes) {
    if (styled(v.style)) add('style', v.id);
    if (v.lines.some((l) => emphasised(l.label))) add('emphasis', v.id);
  }
  for (const r of prepared.relations) if (emphasised(r.label)) add('emphasis', r.id);
  if (curve !== undefined && !SQUARE.has(requirementCurve(curve))) add('curve');
  if (model.accTitle || model.accDescr) add('accessibility');
  const stmts = new Map<string, string[]>();
  statements(ast, stmts);
  const out: AsciiWarning[] = [];
  for (const feature of Object.keys(WHAT) as AsciiDroppedFeature[]) {
    // A statement alone is enough: a `classDef` no box uses still has no text form.
    for (const kind of STATEMENTS[feature])
      for (const id of stmts.get(kind) ?? []) add(feature, id);
    const ids = found[feature];
    if (!ids) continue;
    out.push(asciiDropped(feature, [...ids], WHAT[feature]));
  }
  return out;
}
