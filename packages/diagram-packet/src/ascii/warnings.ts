// What packet text output cannot show (D82, R-ASCII-5): one `ASCII_DROPPED` warning per feature
// kind, naming the AST ids of what it dropped.
import type { Warning } from '@mermaid-js/core';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import type { PacketModel } from '../model.ts';

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

function accessibilityIds(ast: AstNode | undefined, out: string[]): void {
  if (!ast) return;
  if (ast.type === 'AccTitle' || ast.type === 'AccDescr') out.push(ast.id);
  for (const child of ast.children ?? []) accessibilityIds(child, out);
}

/**
 * The warnings for one drawing: `emphasis` holds the indices of the fields with bold or italic
 * labels; `ast` adds the `accTitle` and `accDescr` statements' ids.
 */
export function asciiWarnings(
  model: PacketModel,
  emphasis: readonly number[],
  ast?: AstNode
): AsciiDroppedWarning[] {
  const found: Partial<Record<AsciiDroppedFeature, string[]>> = {};
  if (emphasis.length > 0) found.emphasis = emphasis.map((i) => model.fields[i]!.astId);
  const acc: string[] = [];
  accessibilityIds(ast, acc);
  if (acc.length > 0 || model.accTitle.trim() !== '' || model.accDescr.trim() !== '')
    found.accessibility = acc;
  return (Object.keys(WHAT) as AsciiDroppedFeature[]).flatMap((feature) => {
    const astIds = found[feature];
    if (!astIds) return [];
    return [
      {
        code: 'ASCII_DROPPED' as const,
        feature,
        astIds,
        message: `Text output has no ${WHAT[feature]}; dropped.`,
      },
    ];
  });
}
