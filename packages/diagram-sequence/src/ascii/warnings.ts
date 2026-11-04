// What text output cannot show (D82, R-ASCII-5): one `ASCII_DROPPED` warning per feature kind
// and one `ASCII_SHAPE` warning for the participant symbols drawn as plain boxes. Each names
// the AST ids of what it dropped.
import type { Warning } from '@mermaid-js/core';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import type { ParticipantKind, SequenceModel, SequenceStatement } from '../model.ts';
import { symbolForm } from './symbols.ts';

/** The feature kinds an `ASCII_DROPPED` warning names, in the order they are reported. */
export type AsciiDroppedFeature = 'style' | 'link' | 'accessibility';

/** One feature kind text output dropped (D82). */
export interface AsciiDroppedWarning extends Warning {
  readonly code: 'ASCII_DROPPED';
  readonly feature: AsciiDroppedFeature;
  readonly astIds: readonly string[];
}

/** The participant symbols drawn as plain boxes because they have no text form (D82). */
export interface AsciiShapeWarning extends Warning {
  readonly code: 'ASCII_SHAPE';
  readonly shapes: readonly string[];
  readonly astIds: readonly string[];
}

export type AsciiWarning = AsciiDroppedWarning | AsciiShapeWarning;

const WHAT: Record<AsciiDroppedFeature, string> = {
  style: 'colours (box colours, rect highlighting)',
  link: 'actor menus (links, properties, details)',
  accessibility: 'accTitle and accDescr',
};

function rects(statements: readonly SequenceStatement[], out: string[]): void {
  for (const s of statements) {
    if (s.kind === 'rect') {
      out.push(s.ast);
      rects(s.statements, out);
    } else if (s.kind === 'fragment') for (const sec of s.sections) rects(sec.statements, out);
  }
}

// The statements behind each feature kind, by AST node type.
const STATEMENTS: Record<AsciiDroppedFeature, readonly string[]> = {
  style: [],
  link: ['Links', 'Link', 'Properties', 'Details'],
  accessibility: ['AccTitle', 'AccDescr'],
};

function idsByType(ast: AstNode | undefined, out: Map<string, string[]>): void {
  if (!ast) return;
  const list = out.get(ast.type);
  if (list) list.push(ast.id);
  else out.set(ast.type, [ast.id]);
  for (const child of ast.children ?? []) idsByType(child, out);
}

const hasKeys = (o: Readonly<Record<string, unknown>> | undefined): boolean =>
  o !== undefined && Object.keys(o).length > 0;

/**
 * The warnings for one drawing of `model`; `shown` holds the ids of the participants drawn.
 * `ast` adds the statements' ids (`st:3` for a `link` line, `accTitle`, …).
 */
export function asciiWarnings(
  model: SequenceModel,
  shown: ReadonlySet<string>,
  ast?: AstNode
): AsciiWarning[] {
  const found: Record<AsciiDroppedFeature, string[] | undefined> = {
    style: undefined,
    link: undefined,
    accessibility: undefined,
  };
  const add = (feature: AsciiDroppedFeature, ids: readonly string[]): void => {
    (found[feature] ??= []).push(...ids);
  };
  const coloured = model.boxes.filter((b) => b.color !== undefined).map((b) => b.ast);
  const rectIds: string[] = [];
  rects(model.statements, rectIds);
  if (coloured.length > 0 || rectIds.length > 0) add('style', [...coloured, ...rectIds]);
  const menus = model.participants.filter(
    (p) => shown.has(p.id) && (hasKeys(p.links) || hasKeys(p.properties))
  );
  if (menus.length > 0)
    add(
      'link',
      menus.map((p) => p.ast)
    );
  if (model.accTitle.trim() !== '' || model.accDescr.trim() !== '') add('accessibility', []);
  const stmts = new Map<string, string[]>();
  idsByType(ast, stmts);
  for (const feature of Object.keys(STATEMENTS) as AsciiDroppedFeature[]) {
    const ids = STATEMENTS[feature].flatMap((type) => stmts.get(type) ?? []);
    if (ids.length > 0) add(feature, ids);
  }

  const out: AsciiWarning[] = [];
  for (const feature of Object.keys(WHAT) as AsciiDroppedFeature[]) {
    const ids = found[feature];
    if (!ids) continue;
    out.push({
      code: 'ASCII_DROPPED',
      feature,
      astIds: [...new Set(ids)],
      message: `Text output has no ${WHAT[feature]}; dropped.`,
    });
  }

  const shapes: ParticipantKind[] = [];
  const astIds: string[] = [];
  for (const p of model.participants) {
    if (!shown.has(p.id) || symbolForm(p.kind)) continue;
    if (!shapes.includes(p.kind)) shapes.push(p.kind);
    astIds.push(p.ast);
  }
  if (shapes.length > 0)
    out.push({
      code: 'ASCII_SHAPE',
      shapes,
      astIds,
      message: `Text output draws these participant symbols as plain boxes: ${shapes.join(', ')}.`,
    });
  return out;
}
