// What ER text output cannot show (D82, R-ASCII-5): one `ASCII_DROPPED` warning per feature
// kind. Each names the AST ids of what it dropped: the elements from the model, and the
// statements when the AST is given.
import type { AstNode } from '@mermaid-js/core/parser-kit';
import type { ErModel } from '../parser/index.ts';
import type { ErPrepared } from '../layout/prepare.ts';
import { droppedFeatures, styled } from '@mermaid-js/shared/ascii';
import type {
  AsciiDroppedWarning as SharedAsciiDroppedWarning,
  AsciiRouteWarning,
} from '@mermaid-js/shared/ascii';

/** The feature kinds an `ASCII_DROPPED` warning names, in the order they are reported. */
export type AsciiDroppedFeature = 'style' | 'accessibility';

/** One feature kind text output dropped (D82). */
export type AsciiDroppedWarning = SharedAsciiDroppedWarning<AsciiDroppedFeature>;

export type { AsciiRouteWarning };

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
  const dropped = droppedFeatures(WHAT, STATEMENTS);
  for (const v of [...er.groups, ...er.entities]) if (styled(v.style)) dropped.add('style', v.id);
  if (model.accTitle || model.accDescr) dropped.add('accessibility');
  return dropped.warnings(ast);
}
