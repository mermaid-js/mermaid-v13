/**
 * v12's `unknownIcon` (`rendering-util/icons.ts`): the glyph v12 drew for an icon it could not
 * resolve, a `#087ebf` square with a white `?`, the same in every theme (D152). Architecture
 * draws it for an unresolved icon (D505) and treeView in the icon slot of one (D702).
 *
 * It is drawn in v12's 80 px square (`UNKNOWN_ICON_SIZE`), its `style` written as presentation
 * attributes and its `translate(21.16 64.67)` as the text's position; the caller scales it to
 * its icon size.
 */
import { checkColor, checkStyle } from '@mermaid-js/core/svg';
import type { SvgFragment } from '@mermaid-js/core/text';

/** The side of the square the glyph is drawn in (v12's `unknownIcon`: 80 × 80). */
export const UNKNOWN_ICON_SIZE = 80;

/** v12's unknown-icon glyph: a `g` holding the blue square and the white `?`. */
export function unknownIcon(): SvgFragment {
  const white = checkColor('#fff')!;
  const question = {
    fill: white,
    ...checkStyle(['font-family: ArialMT, Arial', 'font-size: 67.75px']).text,
  };
  return {
    tag: 'g',
    attrs: {},
    children: [
      {
        tag: 'rect',
        attrs: {
          width: UNKNOWN_ICON_SIZE,
          height: UNKNOWN_ICON_SIZE,
          fill: checkColor('#087ebf')!,
          'stroke-width': 0,
        },
      },
      { tag: 'text', attrs: { x: 21.16, y: 64.67, ...question }, children: ['?'] },
    ],
  };
}
