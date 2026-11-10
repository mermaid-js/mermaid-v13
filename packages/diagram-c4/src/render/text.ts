/**
 * C4 text: a laid-out label (`PlacedLabel`) drawn in the font it was measured in (pitfall 16),
 * centred in its box as v12 centred every line, with core's label writer (`<br>` breaks and
 * entities are the layout's). The family is the theme's variable when the label was measured
 * in the theme font, else the checked config family as written.
 */
import { checkStyle, type Attrs, type Paint, type SafeValue } from '@mermaid-js/core/svg';
import { FONT_WEIGHT } from '../layout/metrics.ts';
import type { PlacedLabel } from '../layout/types.ts';
import type { Scene } from './context.ts';

/** What a text is drawn from. */
export interface TextParts {
  readonly label: PlacedLabel;
  /** Its class: `c4-name`, `c4-rel-label`, … */
  readonly cls: string;
  readonly fill: Paint;
  /** The user's id of what it labels; text never carries `data-ast` (pitfall 12). */
  readonly dataId?: string;
}

/** The font attributes of `label`, beside the root's family. */
function fontAttrs(scene: Scene, label: PlacedLabel): Attrs {
  const { font } = label;
  const family =
    font.family === scene.family
      ? undefined
      : (checkStyle(['font-family:' + font.family]).text['font-family'] as SafeValue | undefined);
  let weight: Attrs['font-weight'];
  if (font.weight >= FONT_WEIGHT.bold) weight = 'bold';
  else if (font.weight !== FONT_WEIGHT.normal) weight = String(font.weight) as SafeValue;
  return { 'font-family': family, 'font-size': font.size, 'font-weight': weight };
}

/** A label as a `<text>`, centred in its box. */
export function drawText(scene: Scene, { label, cls, fill, dataId }: TextParts): void {
  scene.w.label(label.text, label.x + label.width / 2, label.y + label.height / 2, {
    class: cls,
    'data-id': dataId,
    fill,
    ...fontAttrs(scene, label),
  });
}
