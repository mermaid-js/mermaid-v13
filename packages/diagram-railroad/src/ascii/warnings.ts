// What railroad text output cannot show (D82, R-ASCII-5, pitfall 22): one `ASCII_DROPPED`
// warning per feature kind. `accTitle` and `accDescr` name their statements; the `railroad`
// colours and font, and the px lengths set to anything but their defaults, are config, with no
// statement to name. The title is drawn by neither output (D218), so it is not named.
import type { AstNode } from '@mermaid-js/core/parser-kit';
import { configLength, RAILROAD_COLOUR_KEYS, RAILROAD_LAYOUT_DEFAULTS } from '../config.ts';
import type { RailroadModel } from '../model.ts';
import type { AsciiDroppedWarning as SharedAsciiDroppedWarning } from '@mermaid-js/shared/ascii';

/** The feature kinds an `ASCII_DROPPED` warning names, in the order they are reported. */
export type AsciiDroppedFeature = 'style' | 'lengths' | 'accessibility';

/** One feature kind text output dropped (D82). */
export type AsciiDroppedWarning = SharedAsciiDroppedWarning<AsciiDroppedFeature>;

const WHAT: Record<AsciiDroppedFeature, string> = {
  style: 'colours or fonts',
  lengths: 'px lengths (text has its own)',
  accessibility: 'accTitle and accDescr',
};

/** The AST ids of the statements of `types`, in source order. */
function statementIds(ast: AstNode | undefined, types: readonly string[], out: string[]): void {
  if (!ast) return;
  if (types.includes(ast.type)) out.push(ast.id);
  for (const child of ast.children ?? []) statementIds(child, types, out);
}

/** The `railroad` keys `section` sets that text cannot draw, by feature, in key order. */
function configKeys(
  section: Readonly<Record<string, unknown>>
): Record<'style' | 'lengths', string[]> {
  const style = [...Object.keys(RAILROAD_COLOUR_KEYS), 'fontFamily', 'fontSize'].filter(
    (key) => section[key] !== undefined
  );
  // The resolved section carries the generated defaults: only a length read as another value
  // is the author's (an unusable one included, which SVG draws as the default).
  const lengths = (
    Object.keys(RAILROAD_LAYOUT_DEFAULTS) as (keyof typeof RAILROAD_LAYOUT_DEFAULTS)[]
  ).filter(
    (key) =>
      section[key] !== undefined && configLength(section[key]) !== RAILROAD_LAYOUT_DEFAULTS[key]
  );
  return { style, lengths };
}

/** The warnings for one drawing of `model` with the resolved `railroad` `section`. */
export function asciiWarnings(
  model: RailroadModel,
  section: Readonly<Record<string, unknown>>,
  ast?: AstNode
): AsciiDroppedWarning[] {
  const keys = configKeys(section);
  const acc: string[] = [];
  statementIds(ast, ['AccTitle', 'AccDescr'], acc);
  const out: AsciiDroppedWarning[] = [];
  for (const feature of ['style', 'lengths'] as const) {
    if (keys[feature].length === 0) continue;
    const named = keys[feature].map((k) => `railroad.${k}`).join(', ');
    out.push({
      code: 'ASCII_DROPPED',
      feature,
      astIds: [],
      message: `Text output has no ${WHAT[feature]}; ${named} dropped.`,
    });
  }
  if (acc.length > 0 || model.accTitle.trim() !== '' || model.accDescr.trim() !== '')
    out.push({
      code: 'ASCII_DROPPED',
      feature: 'accessibility',
      astIds: acc,
      message: `Text output has no ${WHAT.accessibility}; dropped.`,
    });
  return out;
}
