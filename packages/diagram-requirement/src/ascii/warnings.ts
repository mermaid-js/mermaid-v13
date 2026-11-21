// What requirement text output cannot show (D82, R-ASCII-5): one `ASCII_DROPPED` warning per
// feature kind, as ER's. Each names the AST ids of what it dropped: the boxes from the views,
// and the statements when the AST is given.
import type { AstNode } from '@mermaid-js/core/parser-kit';
import { requirementCurve, type RequirementPrepared } from '../layout/prepare.ts';
import type { RequirementModel } from '../model.ts';
import { droppedFeatures, emphasised, styled } from '@mermaid-js/shared/ascii';
import type {
  AsciiDroppedWarning as SharedAsciiDroppedWarning,
  AsciiRouteWarning,
} from '@mermaid-js/shared/ascii';

/** The feature kinds an `ASCII_DROPPED` warning names, in the order they are reported. */
export type AsciiDroppedFeature = 'style' | 'curve' | 'emphasis' | 'accessibility';

/** One feature kind text output dropped (D82). */
export type AsciiDroppedWarning = SharedAsciiDroppedWarning<AsciiDroppedFeature>;

export type { AsciiRouteWarning };

export type AsciiWarning = AsciiDroppedWarning | AsciiRouteWarning;

const WHAT: Record<AsciiDroppedFeature, string> = {
  style: 'colours and styles (style, classDef, class)',
  curve: 'edge curves',
  emphasis: 'bold and italic text',
  accessibility: 'accTitle and accDescr',
};

// The statements behind each feature kind (`RequirementSimpleKind`).
const STATEMENTS: Partial<Record<AsciiDroppedFeature, readonly string[]>> = {
  style: ['Style', 'ClassDef', 'Class'],
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
  const dropped = droppedFeatures(WHAT, STATEMENTS);
  const { add } = dropped;
  for (const v of prepared.boxes) {
    if (styled(v.style)) add('style', v.id);
    if (v.lines.some((l) => emphasised(l.label))) add('emphasis', v.id);
  }
  for (const r of prepared.relations) if (emphasised(r.label)) add('emphasis', r.id);
  if (curve !== undefined && !SQUARE.has(requirementCurve(curve))) add('curve');
  if (model.accTitle || model.accDescr) add('accessibility');
  return dropped.warnings(ast);
}
