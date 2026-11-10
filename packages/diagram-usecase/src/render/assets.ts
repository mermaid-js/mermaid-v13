/**
 * An icon actor's glyph (v12 `usecaseActorIcon.ts`, D293): the 52 px frame, then the glyph an
 * extension has for its `icon` (the context's `icon`, v12's fallback pack `fa`), 42 px square
 * at the frame's centre, painted in the actor's text colour (v12 `.usecase-actor { color }`, the
 * glyph's `currentColor`). Without one the frame is drawn alone: no extension has glyphs, one
 * reported the name unresolved (`null`, and warns), or none has it (`undefined`); a placeholder
 * (`'pending'`, D299) draws the frame alone, quietly.
 */
import { translate, writeFragment, type Attrs, type Paint } from '@mermaid-js/core/svg';
import { ICON_PACK } from '../labels.ts';
import { DRAW } from './metrics.ts';
import type { Scene } from './scene.ts';

const ICON_NOT_RENDERED = 'ICON_NOT_RENDERED';

/** Draws the frame and glyph of `name` about the glyph box's centre. True when it is missed. */
export function drawIconActor(
  { w, ctx }: Scene,
  name: string,
  shape: Attrs,
  paint: Paint
): boolean {
  const half = DRAW.iconFrame / 2;
  w.outline('node', 'rect', {
    class: 'usecase-actor-icon-frame',
    x: -half,
    y: DRAW.iconCentreY - half,
    width: DRAW.iconFrame,
    height: DRAW.iconFrame,
    rx: DRAW.iconRadius,
    ry: DRAW.iconRadius,
    ...shape,
  });
  const found = ctx.icon?.(name, DRAW.iconSize, {
    paint,
    pending: true,
    fallbackPrefix: ICON_PACK,
  });
  if (found === 'pending') return false;
  if (!found) return found === undefined;
  const size = DRAW.iconSize;
  w.open('g', {
    class: 'usecase-actor-icon-symbol',
    'aria-hidden': 'true',
    transform: translate(-size / 2, DRAW.iconCentreY - size / 2),
  });
  writeFragment(w, found);
  w.close();
  return false;
}

/**
 * The render's one `ICON_NOT_RENDERED` for the icon actors no extension drew and none warned
 * about, through the inline providers' deduplicating `warn` when there are any.
 */
export function iconsNotRendered(scene: Scene, names: readonly string[]): void {
  if (names.length === 0) return;
  const { ctx } = scene;
  const listed = names.map((n) => JSON.stringify(n)).join(', ');
  const warning = {
    code: ICON_NOT_RENDERED,
    message: ctx.icon
      ? `Icons not rendered: ${listed}. No icons extension has a glyph for these usecase icon actors, which draw their frame alone.`
      : 'Icons are not rendered without an icons extension: usecase icon actors draw their frame alone.',
  };
  if (ctx.inline) ctx.inline.warn(warning);
  else ctx.warn(warning);
}
