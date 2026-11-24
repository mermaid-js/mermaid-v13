// The theme variables the sequence renderer reads, looked up before the root is written so the
// root `style` declares exactly the aliases used (theme.rootStyleText()). Every v12 theme-name
// set, `look === 'neo'` branch and drop-shadow filter is a theme variable here (D152): the
// palette (`borderColorArray`, `bkgColorArray`), the participant corner (`actorRadius`) and the
// shadow (`dropShadow`).
import type { RenderContext } from '@mermaid-js/core';
import { checkCssColor, checkStyle, type Attrs, type SafeValue } from '@mermaid-js/core/svg';
import { paletteSlots, type PaletteTint } from '@mermaid-js/shared/svg/document';
import type { FontKey } from '@mermaid-js/core/text';
import { fontsOf } from '../layout/env.ts';
import type { SequenceLayout } from '../layout/index.ts';

type Theme = RenderContext['theme'];
type Color = ReturnType<Theme['color']>;
type Length = ReturnType<Theme['length']>;
type Shadow = ReturnType<Theme['filter']>;

export interface ActorPaint {
  readonly fill: Color;
  readonly stroke: Color;
  readonly strokeWidth: Length;
  readonly text: Color;
  readonly line: Color;
  /** `actorRadius`: geometry, so a literal number (D152). */
  readonly radius: number;
}

/** Font attributes for the labels of each section; empty where the root's font applies. */
export interface SectionFonts {
  readonly actor: Attrs;
  readonly message: Attrs;
  readonly note: Attrs;
}

export interface Paints {
  readonly actor: ActorPaint;
  readonly signal: { readonly line: Color; readonly text: Color };
  readonly number?: { readonly fill: Color; readonly text: Color };
  readonly note?: { readonly fill: Color; readonly stroke: Color; readonly text: Color };
  readonly frame?: {
    readonly line: Color;
    readonly tabFill: Color;
    readonly tabText: Color;
    readonly title: Color;
  };
  readonly activation?: { readonly fill: Color; readonly stroke: Color; readonly opaque: Color };
  /** Participant boxes (v12 `drawBox`). */
  readonly box?: { readonly stroke: Color; readonly text: Color };
  /** The fill of a `rect` block written without a colour (v12 `rectBkgColor`). */
  readonly rect?: Color;
  readonly title?: Color;
  /**
   * The theme's drop shadow, a CSS filter (v12 neo `url(#…-drop-shadow)`); undefined when the
   * theme has none (the classic themes), so no `filter` attribute is written.
   */
  readonly shadow?: Shadow;
  readonly slotOf: (index: number) => PaletteTint | undefined;
  readonly fonts: SectionFonts;
}

const NORMAL = 400;

// The layout measured each label in `fontsOf`; a font that differs from the root's is written
// on the section's group, so labels are drawn in the font they were measured in.
function fontAttrs(f: FontKey, family: string, size: number): Attrs {
  return {
    'font-family':
      f.family === family
        ? undefined
        : (checkStyle(['font-family:' + f.family]).text['font-family'] as SafeValue | undefined),
    'font-size': f.size === size ? undefined : f.size,
    'font-weight': f.weight === NORMAL ? undefined : (String(f.weight) as SafeValue),
  };
}

/** Every theme variable the body uses; groups the layout has none of are left out. */
export function paints(ctx: Pick<RenderContext, 'theme' | 'config'>, l: SequenceLayout): Paints {
  const { theme } = ctx;
  const family = theme.value('fontFamily');
  const size = theme.number('fontSize');
  const f = fontsOf(ctx);
  const actor: ActorPaint = {
    fill: theme.color('actorBkg'),
    stroke: theme.color('actorBorder'),
    strokeWidth: theme.length('strokeWidth'),
    text: theme.color('actorTextColor'),
    line: theme.color('actorLineColor'),
    radius: theme.number('actorRadius'),
  };
  return {
    actor,
    signal: { line: theme.color('signalColor'), text: theme.color('signalTextColor') },
    number: l.messages.some((m) => m.number)
      ? { fill: theme.color('signalColor'), text: theme.color('sequenceNumberColor') }
      : undefined,
    note:
      l.notes.length > 0
        ? {
            fill: theme.color('noteBkgColor'),
            stroke: theme.color('noteBorderColor'),
            text: theme.color('noteTextColor'),
          }
        : undefined,
    frame:
      l.fragments.length > 0
        ? {
            line: theme.color('labelBoxBorderColor'),
            tabFill: theme.color('labelBoxBkgColor'),
            tabText: theme.color('labelTextColor'),
            title: theme.color('loopTextColor'),
          }
        : undefined,
    activation:
      l.activations.length > 0
        ? {
            fill: theme.color('activationBkgColor'),
            stroke: theme.color('activationBorderColor'),
            opaque: theme.color('mainBkg'),
          }
        : undefined,
    box:
      l.boxes.length > 0
        ? { stroke: theme.color('nodeBorder'), text: theme.color('textColor') }
        : undefined,
    // Looked up only when a `rect` takes it: one with no colour, or a refused one.
    rect: l.rects.some((r) => r.color.trim() === '' || !checkCssColor(r.color))
      ? theme.color('rectBkgColor')
      : undefined,
    title: l.title ? theme.color('textColor') : undefined,
    shadow: theme.value('dropShadow') === 'none' ? undefined : theme.filter('dropShadow'),
    slotOf: paletteSlots(theme),
    fonts: {
      actor: fontAttrs(f.actor, family, size),
      message: fontAttrs(f.message, family, size),
      note: fontAttrs(f.note, family, size),
    },
  };
}
