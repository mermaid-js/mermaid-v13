/**
 * The font-family check of the diagrams that let config set a family per kind of text (c4,
 * sequence, journey) and draw a label in a family other than the root's (kanban too): what the
 * style check allows, and the warning a refused config value raises.
 */
import type { Warning } from '@mermaid-js/core';
import { checkStyle, type Attrs } from '@mermaid-js/core/svg';

/** `family` as the style check allows it for `font-family`, else undefined. */
export const checkFontFamily = (family: string): Attrs['font-family'] =>
  checkStyle(['font-family:' + family]).text['font-family'];

/**
 * The family `section[key]` sets, checked; undefined when it is unset, blank or not a string,
 * or when the check refuses it, which warns `STYLE_VALUE_DROPPED` at `<name>.<key>`.
 */
export function configFontFamily(
  section: Readonly<Record<string, unknown>>,
  name: string,
  key: string,
  warn?: (w: Warning) => void
): string | undefined {
  const f = section[key];
  if (typeof f !== 'string' || f.trim() === '') return undefined;
  const safe = checkFontFamily(f);
  if (safe === undefined)
    warn?.({
      code: 'STYLE_VALUE_DROPPED',
      message: `Dropped ${name}.${key} ${JSON.stringify(f)}: it is not a font family Mermaid allows`,
      path: `${name}.${key}`,
    });
  return safe;
}
