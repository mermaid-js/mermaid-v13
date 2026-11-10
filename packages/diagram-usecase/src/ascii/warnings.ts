// What usecase text output cannot show (D82, D478, R-ASCII-5): one `ASCII_DROPPED` warning per
// feature kind. Business slashes, icons and the hollow and awesome figures are one kind (D478:
// "one `ASCII_DROPPED`"). Each warning names the AST ids of what it dropped: the elements from
// the views, and the statements when the AST is given. A `usecase` option text output cannot
// honour is one more kind (pitfall 22): fonts, colours and the SVG's width and margin.
import type { Warning } from '@mermaid-js/core';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import type { CheckedStyle } from '@mermaid-js/core/svg';
import { Style, type MeasuredLabel } from '@mermaid-js/core/text';
import { USECASE_CONFIG_DEFAULTS } from '../config.ts';
import type { UsecaseModel } from '../model.ts';
import type { UsecaseNodeView, UsecasePrepared } from '../layout/prepare.ts';

/** The feature kinds an `ASCII_DROPPED` warning names, in the order they are reported. */
export type AsciiDroppedFeature =
  | 'style'
  | 'emphasis'
  | 'glyph'
  | 'animation'
  | 'config'
  | 'accessibility';

/** One feature kind text output dropped (D82). */
export interface AsciiDroppedWarning extends Warning {
  readonly code: 'ASCII_DROPPED';
  readonly feature: AsciiDroppedFeature;
  readonly astIds: readonly string[];
}

/** Relationships the repair router found no free lane for (D78). */
export interface AsciiRouteWarning extends Warning {
  readonly code: 'ASCII_ROUTE';
  readonly astIds: readonly string[];
}

export type AsciiWarning = AsciiDroppedWarning | AsciiRouteWarning;

const WHAT: Record<AsciiDroppedFeature, string> = {
  style: 'colours and styles (style, classDef, class)',
  emphasis: 'bold and italic text',
  glyph: 'business marks, icons and the hollow and awesome actor figures',
  animation: 'edge animation',
  config: 'usecase fonts, colorScheme, useMaxWidth or diagramPadding',
  accessibility: 'accTitle and accDescr',
};

// The statements behind each feature kind (`UsecaseSimpleKind`).
const STATEMENTS: Partial<Record<AsciiDroppedFeature, readonly string[]>> = {
  style: ['Style', 'ClassDef', 'Class'],
  accessibility: ['AccTitle', 'AccDescr'],
};

/** `usecase` keys with no text form: drawn the same whatever they are set to. */
const UNDRAWN = [
  'actorFontSize',
  'actorFontWeight',
  'actorFontFamily',
  'usecaseFontSize',
  'usecaseFontWeight',
  'usecaseFontFamily',
  'colorScheme',
  'useMaxWidth',
  'diagramPadding',
] as const;

const styled = (s: CheckedStyle): boolean =>
  Object.keys(s.shape).length > 0 || Object.keys(s.text).length > 0;

const emphasised = (label: MeasuredLabel | undefined): boolean =>
  label?.lines.some((line) =>
    line.some((run) => (run.style & (Style.Bold | Style.Italic)) !== 0)
  ) ?? false;

function statements(ast: AstNode | undefined, out: Map<string, string[]>): void {
  if (!ast) return;
  const list = out.get(ast.type);
  if (list) list.push(ast.id);
  else out.set(ast.type, [ast.id]);
  for (const child of ast.children ?? []) statements(child, out);
}

/**
 * The `usecase` keys set to something other than their default that text output draws the
 * same either way. The resolved section carries the defaults, so a value equal to one counts
 * as not set (as ER's sizes, D124); the families have no default (D132), so any one counts.
 */
export function undrawnConfig(section: Readonly<Record<string, unknown>> | undefined): string[] {
  const given = section ?? {};
  const defaults: Readonly<Record<string, unknown>> = USECASE_CONFIG_DEFAULTS;
  return UNDRAWN.filter((key) => given[key] !== undefined && given[key] !== defaults[key]);
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
 * adds the statements' ids (`style:1`, `classDef:1`, `accTitle:1`, …); `section` is the
 * resolved `usecase` config.
 */
export function asciiWarnings(
  model: UsecaseModel,
  prepared: UsecasePrepared,
  ast?: AstNode,
  section?: Readonly<Record<string, unknown>>
): AsciiWarning[] {
  const found: Partial<Record<AsciiDroppedFeature, Set<string>>> = {};
  const add: Add = (feature, id) => {
    const ids = (found[feature] ??= new Set());
    if (id) ids.add(id);
  };
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
  if (undrawnConfig(section).length > 0) add('config');
  if (model.accTitle || model.accDescr) add('accessibility');
  const stmts = new Map<string, string[]>();
  statements(ast, stmts);
  const out: AsciiWarning[] = [];
  for (const feature of Object.keys(WHAT) as AsciiDroppedFeature[]) {
    // A statement alone is enough: a `classDef` nothing uses still has no text form.
    for (const kind of STATEMENTS[feature] ?? [])
      for (const id of stmts.get(kind) ?? []) add(feature, id);
    const ids = found[feature];
    if (!ids) continue;
    const keys = feature === 'config' ? ` (${undrawnConfig(section).join(', ')})` : '';
    out.push({
      code: 'ASCII_DROPPED',
      feature,
      astIds: [...ids],
      message: `Text output has no ${WHAT[feature]}${keys}; dropped.`,
    });
  }
  return out;
}
