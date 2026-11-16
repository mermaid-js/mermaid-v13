/**
 * The `<svg>` document root and its `<title>` and `<desc>`, as every diagram writes them. A
 * subpath of its own, so that only diagram chunks load it (DESIGN §2).
 */
import { px, styleScope, styleText, themeStyleSheet } from './style.ts';
import type { Attrs, StyleText, ThemeRef } from './types.ts';
import type { SvgWriter } from './writer.ts';

/** The part of a render context the root reads. `idPrefix` is read only when an id is written. */
export interface RootContext {
  readonly theme: {
    rootStyleText(): StyleText;
    autoDeclarations():
      | {
          readonly light: Readonly<Record<string, ThemeRef>>;
          readonly dark: Readonly<Record<string, ThemeRef>>;
        }
      | undefined;
  };
  readonly idPrefix?: string | undefined;
  readonly version?: string | undefined;
}

export interface RootOptions {
  /** The class after `mermaid mermaid-`: the diagram's name, then any v12 class it keeps. */
  readonly name: string;
  /** `aria-roledescription`; the first word of `name` when omitted. */
  readonly roleDescription?: string;
  /** `[x, y, width, height]`, already rounded. */
  readonly viewBox: readonly [number, number, number, number];
  /**
   * The diagram's `useMaxWidth` as set: anything but `false` fills the width up to the
   * drawing's, `false` keeps the drawing's own size.
   */
  readonly maxWidth: unknown;
  /** The accessible title and description, trimmed; an empty one is not written. */
  readonly title?: string | undefined;
  readonly desc?: string | undefined;
  /** Attributes the drawing inherits (font, fill…), written after `style`. */
  readonly attrs?: Attrs;
}

/** A `<title>` or `<desc>` holding `text`. */
export function textElement(w: SvgWriter, tag: 'title' | 'desc', text: string, id?: string): void {
  w.open(tag, id === undefined ? undefined : { id });
  w.text(text);
  w.close();
}

/**
 * Opens the `<svg>` root: its size, its accessible name, the theme's aliases and, for
 * `theme: 'auto'`, their style sheet. The theme values the drawing inherits must be read before
 * the call, so that the root declares their aliases.
 */
export function openSvgRoot(w: SvgWriter, ctx: RootContext, o: RootOptions): void {
  const { theme } = ctx;
  const prefix = (): string => ctx.idPrefix ?? 'mermaid';
  const width = o.viewBox[2];
  const auto = theme.autoDeclarations();
  const { title, desc } = o;
  const maxWidth = o.maxWidth !== false;
  const space = o.name.indexOf(' ');
  w.open('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    class: `mermaid mermaid-${o.name}`,
    viewBox: o.viewBox,
    width: maxWidth ? '100%' : width,
    height: maxWidth ? undefined : o.viewBox[3],
    role: 'img',
    'aria-roledescription': o.roleDescription ?? (space < 0 ? o.name : o.name.slice(0, space)),
    'aria-labelledby': title ? `${prefix()}-title` : undefined,
    'aria-describedby': desc ? `${prefix()}-desc` : undefined,
    'data-mermaid-version': ctx.version ?? '13',
    'data-p': auto ? styleScope(prefix()) : undefined,
    style: styleText(maxWidth ? { 'max-width': px(width) } : {}, theme.rootStyleText()),
    ...o.attrs,
  });
  if (auto) w.styleSheet(themeStyleSheet(styleScope(prefix()), auto.light, auto.dark));
  if (title) textElement(w, 'title', title, `${prefix()}-title`);
  if (desc) textElement(w, 'desc', desc, `${prefix()}-desc`);
}
