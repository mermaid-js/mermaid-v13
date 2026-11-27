// What usecase text output cannot show (D82, D478, R-ASCII-5): one `ASCII_DROPPED` warning per
// feature kind. Business slashes, icons and the hollow and awesome figures are one kind (D478:
// "one `ASCII_DROPPED`"). Each warning names the AST ids of what it dropped: the elements from
// the views, and the statements when the AST is given. A `usecase` option text output cannot
// honour is one more kind (pitfall 22): fonts, colours and the SVG's width and margin.
import type { ResolvedConfig } from '@mermaid-js/core/config';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import type { MeasuredLabel } from '@mermaid-js/core/text';
import type { UsecaseConfigKey, UsecaseLayoutConfig } from '../config.ts';
import type { UsecaseModel } from '../model.ts';
import type { UsecaseNodeView, UsecasePrepared } from '../layout/prepare.ts';
import { droppedFeatures, emphasised, styled } from '@mermaid-js/shared/ascii';
import type {
  AsciiDroppedWarning as SharedAsciiDroppedWarning,
  AsciiRouteWarning,
} from '@mermaid-js/shared/ascii';

/** The feature kinds an `ASCII_DROPPED` warning names, in the order they are reported. */
export type AsciiDroppedFeature =
  | 'style'
  | 'emphasis'
  | 'glyph'
  | 'animation'
  | 'curve'
  | 'config'
  | 'accessibility';

/** One feature kind text output dropped (D82). */
export type AsciiDroppedWarning = SharedAsciiDroppedWarning<AsciiDroppedFeature>;

export type { AsciiRouteWarning };

export type AsciiWarning = AsciiDroppedWarning | AsciiRouteWarning;

/** What each feature kind is, as the warning names it. */
const FEATURE_TEXT: Record<AsciiDroppedFeature, string> = {
  style: 'colours and styles (style, classDef, class)',
  emphasis: 'bold and italic text',
  glyph: 'business marks, icons and the hollow and awesome actor figures',
  animation: 'edge animation',
  curve: 'edge curves',
  config: 'usecase fonts, colorScheme, useMaxWidth or diagramPadding',
  accessibility: 'accTitle and accDescr',
};

// The statements behind each feature kind (`UsecaseSimpleKind`).
const STATEMENTS: Partial<Record<AsciiDroppedFeature, readonly string[]>> = {
  style: ['Style', 'ClassDef', 'Class'],
  accessibility: ['AccTitle', 'AccDescr'],
};

/** `usecase` keys with no text form: drawn the same whatever they are set to. */
const UNDRAWN: readonly UsecaseConfigKey[] = [
  'actorFontSize',
  'actorFontWeight',
  'actorFontFamily',
  'usecaseFontSize',
  'usecaseFontWeight',
  'usecaseFontFamily',
  'colorScheme',
  'useMaxWidth',
  'diagramPadding',
];

/**
 * The `usecase` keys the author set (`UsecaseLayoutConfig.set`: taken, and off their default)
 * that text output draws the same either way.
 */
export function undrawnConfig(config: UsecaseLayoutConfig): UsecaseConfigKey[] {
  return UNDRAWN.filter((key) => config.set.has(key));
}

type Add = (feature: AsciiDroppedFeature, id?: string) => void;

/** The labels a node draws. */
const labelsOf = (v: UsecaseNodeView): (MeasuredLabel | undefined)[] =>
  v.kind === 'json'
    ? [v.title, ...v.rows.flatMap((r) => [r.key, r.value])]
    : [v.label, 'stereotype' in v ? v.stereotype : undefined];

/** D478: a business mark, an icon or a hollow or awesome figure is drawn as neither. */
function glyphDropped(v: UsecaseNodeView): boolean {
  if (v.kind === 'actor') return v.actor.business || v.actor.type !== 'normal';
  return v.kind === 'usecase' && v.useCase.business;
}

/** The features the nodes use that text output drops. */
function nodeFeatures(prepared: UsecasePrepared, add: Add): void {
  for (const v of prepared.nodes.values()) {
    if (styled(v.style)) add('style', v.id);
    if (labelsOf(v).some(emphasised)) add('emphasis', v.id);
    if (glyphDropped(v)) add('glyph', v.id);
  }
}

/**
 * The warnings for one drawing: the features without a text form, one per kind (D82). `ast`
 * adds the statements' ids (`style:1`, `classDef:1`, `accTitle:1`, …); the config is the one
 * the layout resolved (`prepared.config`), whose rejected values already warned. `curve` is
 * the `usecase.curve` or `curve` the config sets: text lines are always square (D760).
 */
export function asciiWarnings(
  model: UsecaseModel,
  prepared: UsecasePrepared,
  ast?: AstNode,
  config?: ResolvedConfig
): AsciiWarning[] {
  const dropped = droppedFeatures(FEATURE_TEXT, STATEMENTS);
  const { add } = dropped;
  nodeFeatures(prepared, add);
  for (const b of prepared.boundaries) {
    if (styled(b.style)) add('style', b.id);
    if (emphasised(b.label)) add('emphasis', b.id);
  }
  for (const e of prepared.edges) {
    if (e.kind !== 'relation') continue;
    if (styled(e.style)) add('style', e.id);
    if (emphasised(e.label)) add('emphasis', e.id);
    if (e.relationship.animate || e.relationship.animation) add('animation', e.id);
  }
  if ((config?.usecase?.curve ?? config?.curve) !== undefined) add('curve');
  const undrawn = undrawnConfig(prepared.config);
  if (undrawn.length > 0) add('config');
  if (model.accTitle || model.accDescr) add('accessibility');
  return dropped.warnings(ast, { config: ` (${undrawn.join(', ')})` });
}
