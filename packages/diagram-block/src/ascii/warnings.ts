// What block text output cannot show (D82, R-ASCII-5, pitfall 22): one `ASCII_DROPPED` warning
// per feature kind, one `ASCII_SHAPE` for the shapes drawn as plain boxes and one `ASCII_ROUTE`
// for the edges no free route was found for, each naming AST ids. The composites' palette and
// every other theme colour are dropped silently (text has no colour, as kanban's columns);
// `block.padding` is px geometry, ignored with no warning (D449).
import type { Warning } from '@mermaid-js/core';
import type { AstId, AstNode } from '@mermaid-js/core/parser-kit';
import type { Block, BlockModel } from '../model.ts';
import { hasTextForm } from './draw.ts';
import type { BlockText } from './grid.ts';
import { textLabel } from './grid.ts';
import type { InlineSpans } from '@mermaid-js/core/text';

/** The feature kinds an `ASCII_DROPPED` warning names, in the order they are reported. */
export type AsciiDroppedFeature = 'style' | 'emphasis';

/** One feature kind text output dropped (D82). */
export interface AsciiDroppedWarning extends Warning {
  readonly code: 'ASCII_DROPPED';
  readonly feature: AsciiDroppedFeature;
  readonly astIds: readonly string[];
}

/** The blocks drawn as plain boxes because their shape has no text form (D82). */
export interface AsciiShapeWarning extends Warning {
  readonly code: 'ASCII_SHAPE';
  readonly shapes: readonly string[];
  readonly astIds: readonly string[];
}

/** Edges no free route was found for: drawn across what is there (D78's code). */
export interface AsciiRouteWarning extends Warning {
  readonly code: 'ASCII_ROUTE';
  readonly astIds: readonly string[];
}

export type AsciiWarning = AsciiDroppedWarning | AsciiShapeWarning | AsciiRouteWarning;

const WHAT: Record<AsciiDroppedFeature, string> = {
  style: 'colours and styles (style, classDef, class)',
  emphasis: 'bold and italic text',
};

function statementIds(ast: AstNode | undefined, types: readonly string[], out: string[]): void {
  if (!ast) return;
  const stack = [ast];
  while (stack.length > 0) {
    const n = stack.pop()!;
    if (types.includes(n.type)) out.push(n.id);
    const kids = n.children ?? [];
    for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]!);
  }
}

function blocks(model: BlockModel): Block[] {
  const out: Block[] = [];
  const stack = [...model.blocks].reverse();
  while (stack.length > 0) {
    const b = stack.pop()!;
    out.push(b);
    for (let i = b.children.length - 1; i >= 0; i--) stack.push(b.children[i]!);
  }
  return out;
}

/** The warnings for one drawing. */
export function asciiWarnings(
  model: BlockModel,
  grid: BlockText,
  forced: readonly AstId[],
  ast: AstNode | undefined,
  inline: InlineSpans | undefined
): AsciiWarning[] {
  const out: AsciiWarning[] = [];
  const dropped = (feature: AsciiDroppedFeature, astIds: string[]): void =>
    void out.push({
      code: 'ASCII_DROPPED',
      feature,
      astIds,
      message: `Text output has no ${WHAT[feature]}; dropped.`,
    });
  const all = blocks(model);
  const styled = all.filter((b) => b.classes.length > 0 || b.styles.length > 0).map((b) => b.ast);
  if (styled.length > 0) {
    statementIds(ast, ['ClassDef', 'Class', 'Style'], styled);
    dropped('style', styled);
  }
  const emphasis = grid.boxes.filter((b) => b.emphasis).map((b) => b.ast);
  for (const e of model.edges)
    if (e.label !== '' && textLabel(e.label, inline).emphasis) emphasis.push(e.ast);
  if (emphasis.length > 0) dropped('emphasis', emphasis);
  const shapes: string[] = [];
  const shaped: string[] = [];
  for (const b of grid.boxes) {
    if (b.frame || hasTextForm(b.type)) continue;
    if (!shapes.includes(b.type)) shapes.push(b.type);
    shaped.push(b.ast);
  }
  if (shapes.length > 0)
    out.push({
      code: 'ASCII_SHAPE',
      shapes,
      astIds: shaped,
      message: `Text output draws these shapes as plain boxes: ${shapes.join(', ')}.`,
    });
  if (forced.length > 0)
    out.push({
      code: 'ASCII_ROUTE',
      astIds: forced,
      message: `No free route for edges ${forced.join(', ')}; their lines cross other lines or boxes.`,
    });
  return out;
}
