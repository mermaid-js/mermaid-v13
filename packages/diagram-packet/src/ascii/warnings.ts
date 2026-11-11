// What packet text output cannot show (D82, R-ASCII-5): one `ASCII_DROPPED` warning per feature
// kind, naming the AST ids of what it dropped.
import type { Warning } from '@mermaid-js/core';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import type { PacketModel } from '../model.ts';
import type { Emphasis } from './draw.ts';
import { asciiDropped } from '@mermaid-js/shared/ascii';

/** The feature kinds an `ASCII_DROPPED` warning names, in the order they are reported. */
export type AsciiDroppedFeature = 'emphasis' | 'accessibility';

/** One feature kind text output dropped (D82). */
export interface AsciiDroppedWarning extends Warning {
  readonly code: 'ASCII_DROPPED';
  readonly feature: AsciiDroppedFeature;
  readonly astIds: readonly string[];
}

const WHAT: Record<AsciiDroppedFeature, string> = {
  emphasis: 'bold and italic text',
  accessibility: 'accTitle and accDescr',
};

/** The AST ids of the statements of `types`, in source order. */
function statementIds(ast: AstNode | undefined, types: readonly string[], out: AstNode[]): void {
  if (!ast) return;
  if (types.includes(ast.type)) out.push(ast);
  for (const child of ast.children ?? []) statementIds(child, types, out);
}

/**
 * The `title` statement the drawn title comes from: the last one, when it is not empty (an
 * empty one leaves the front-matter title, which has no statement).
 */
function titleId(ast: AstNode | undefined): string | undefined {
  const titles: AstNode[] = [];
  statementIds(ast, ['Title'], titles);
  const last = titles.at(-1) as (AstNode & { text?: string }) | undefined;
  return last?.text ? last.id : undefined;
}

/**
 * The warnings for one drawing: `emphasis` says which labels and whether the title are bold or
 * italic; `ast` adds the ids of the `title`, `accTitle` and `accDescr` statements.
 */
export function asciiWarnings(
  model: PacketModel,
  emphasis: Emphasis,
  ast?: AstNode
): AsciiDroppedWarning[] {
  const found: Partial<Record<AsciiDroppedFeature, string[]>> = {};
  if (emphasis.fields.length > 0 || emphasis.title) {
    const title = emphasis.title ? titleId(ast) : undefined;
    found.emphasis = [
      ...emphasis.fields.map((i) => model.fields[i]!.astId),
      ...(title ? [title] : []),
    ];
  }
  const acc: AstNode[] = [];
  statementIds(ast, ['AccTitle', 'AccDescr'], acc);
  if (acc.length > 0 || model.accTitle.trim() !== '' || model.accDescr.trim() !== '')
    found.accessibility = acc.map((n) => n.id);
  return (Object.keys(WHAT) as AsciiDroppedFeature[]).flatMap((feature) => {
    const astIds = found[feature];
    if (!astIds) return [];
    return [asciiDropped(feature, astIds, WHAT[feature])];
  });
}
