// What text output cannot show (D82, R-ASCII-5): one `ASCII_DROPPED` warning per feature kind
// and one `ASCII_SHAPE` warning for the participant symbols drawn as plain boxes. Each names
// the AST ids of what it dropped.
import type { Warning } from '@mermaid-js/core';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import { Style, type MeasuredLabel } from '@mermaid-js/core/text';
import type { SequenceLayout } from '../layout/index.ts';
import type { ParticipantKind, SequenceModel, SequenceStatement } from '../model.ts';
import { symbolForm } from './symbols.ts';

/** The feature kinds an `ASCII_DROPPED` warning names, in the order they are reported. */
export type AsciiDroppedFeature = 'style' | 'emphasis' | 'link' | 'accessibility';

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
  emphasis: 'bold and italic text',
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
  emphasis: [],
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

const emphasised = (label: MeasuredLabel | undefined): boolean =>
  label?.lines.some((line) =>
    line.some((run) => (run.style & (Style.Bold | Style.Italic)) !== 0)
  ) ?? false;

// `sequence.*FontWeight` set bold, which text cannot show either.
const WEIGHTS = ['actorFontWeight', 'messageFontWeight', 'noteFontWeight'] as const;
const bold = (v: unknown): boolean => v === 'bold' || v === 'bolder' || Number(v) >= 600;

/** The AST ids of the drawn elements whose text is bold or italic. */
function emphasisIds(layout: SequenceLayout): string[] {
  const out: string[] = [];
  for (const p of layout.participants) if (emphasised(p.label)) out.push(p.ast);
  for (const m of layout.messages) if (emphasised(m.label?.text)) out.push(m.ast);
  for (const n of layout.notes) if (emphasised(n.label.text)) out.push(n.ast);
  for (const f of layout.fragments)
    if (emphasised(f.title?.text) || f.sections.some((s) => emphasised(s.label?.text)))
      out.push(f.ast);
  for (const b of layout.boxes) if (emphasised(b.label?.text)) out.push(b.ast);
  return out;
}

const hasKeys = (o: Readonly<Record<string, unknown>> | undefined): boolean =>
  o !== undefined && Object.keys(o).length > 0;

/**
 * The warnings for one drawing of `model`; `shown` holds the ids of the participants drawn.
 * `ast` adds the statements' ids (`st:3` for a `link` line, `accTitle`, …).
 */
export function asciiWarnings(
  model: SequenceModel,
  layout: SequenceLayout,
  options: {
    readonly ast?: AstNode;
    readonly charset: 'unicode' | 'ascii';
    readonly config: Readonly<Record<string, unknown>>;
  }
): AsciiWarning[] {
  const shown = new Set(layout.participants.map((p) => p.id));
  const { ast } = options;
  const found: Record<AsciiDroppedFeature, string[] | undefined> = {
    style: undefined,
    emphasis: undefined,
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
  const emphasis = emphasisIds(layout);
  if (emphasis.length > 0 || WEIGHTS.some((k) => bold(options.config[k])))
    add('emphasis', emphasis);
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

  const shapes: (ParticipantKind | 'half-arrowhead')[] = [];
  const astIds: string[] = [];
  for (const p of model.participants) {
    if (!shown.has(p.id) || symbolForm(p.kind)) continue;
    if (!shapes.includes(p.kind)) shapes.push(p.kind);
    astIds.push(p.ast);
  }
  // ASCII has no half arrowheads: `-|\` and friends are drawn as `>` and `<`.
  const half = layout.messages.filter((m) => /_(?:top|bottom)/u.test(m.arrow)).map((m) => m.ast);
  if (options.charset === 'ascii' && half.length > 0) {
    shapes.push('half-arrowhead');
    astIds.push(...half);
  }
  if (shapes.length > 0)
    out.push({
      code: 'ASCII_SHAPE',
      shapes,
      astIds,
      message: `Text output draws these as plain boxes or full heads: ${shapes.join(', ')}.`,
    });
  return out;
}
