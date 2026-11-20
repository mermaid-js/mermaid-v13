/**
 * A terminal's text in px as the SVG draws it (#774): with its spaces kept, so its box is
 * measured for what is drawn, and a blank one drawn as nothing. A terminal is a literal, so its
 * spaces are part of it; nonterminal and special texts are measured and drawn as before.
 */

/** Tabs and line breaks, which the SVG draws as spaces where it keeps spaces (`xml:space`). */
const XML_BREAKS = /[\t\n\r]/g;
/** One of `XML_BREAKS`, for a test (a global pattern's `test` keeps its place between calls). */
const XML_BREAK = /[\t\n\r]/;

/**
 * A terminal's text as the SVG draws it with its spaces kept (`xml:space="preserve"`, #774):
 * every space, and a space for each tab and line break. It is what the box is measured for.
 */
export const drawnText = (text: string): string => text.replace(XML_BREAKS, ' ');

/**
 * Whether a terminal's text draws nothing: empty, or only spaces, tabs and line breaks (#774).
 * v12 measured such a text as an empty bbox, so its box is the padding alone: a circle
 * `2 × padding` across.
 */
export const isBlankText = (text: string): boolean => /^[ \t\n\r]*$/.test(text);

/**
 * Whether the SVG must keep `text`'s spaces (`xml:space="preserve"`) to draw it as measured: a
 * space at either end, two in a row, or a tab or line break. A blank text draws nothing either
 * way, as it is measured, and any other text draws the same either way.
 */
export const keepsSpaces = (text: string): boolean =>
  !isBlankText(text) &&
  (text.startsWith(' ') || text.endsWith(' ') || text.includes('  ') || XML_BREAK.test(text));
