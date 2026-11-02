// Font family resolution (R-TEXT-9, DESIGN §5.2).

/** v12's default `fontFamily` (P1). The final v13 default is settled before 13.0 (D73). */
export const DEFAULT_FONT_FAMILY = '"trebuchet ms", verdana, arial, sans-serif';

const clean = (stack: string | undefined): string => stack?.trim().replace(/;+$/, '').trim() ?? '';

/**
 * The font family to draw and measure with. The `--mermaid-fontFamily` CSS variable comes
 * first, because the SVG draws with it when the page sets it; then the `fontFamily` config;
 * then v12's default stack.
 */
export function resolveFontFamily(fontFamily?: string, cssVariable?: string): string {
  return clean(cssVariable) || clean(fontFamily) || DEFAULT_FONT_FAMILY;
}

/** Lower-case family names of a CSS font-family stack, without quotes. */
export function familyNames(stack: string): string[] {
  return stack
    .split(',')
    .map((name) =>
      name
        .trim()
        .replace(/;+$/, '')
        .replace(/^(['"])(.*)\1$/, '$2')
        .trim()
        .toLowerCase()
    )
    .filter((name) => name !== '');
}
