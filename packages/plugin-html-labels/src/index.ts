/**
 * `@mermaid-js/plugin-html-labels`: labels as HTML in the mounted diagram, as v12's
 * `htmlLabels: true` drew them (D694). Register the extension:
 *
 * ```ts
 * import { htmlLabels } from '@mermaid-js/plugin-html-labels';
 * await mermaid.registerExternalDiagrams([htmlLabels]);
 * ```
 *
 * Its whole-label provider (D695) measures each label as sanitized HTML in the browser and gives
 * core a box of that size. The box's node is a placeholder on the allow-list: a `<g>` with a
 * `<rect>` of the box's size and a `<desc>` holding the HTML as text. So what `render()` returns
 * stays inert (R-SEC-1, R-SEC-2). `afterMount` (reached through `RenderResult.bindFunctions`,
 * `run()` or `mount()`) sanitizes that text again and swaps in a `<foreignObject>`.
 *
 * Its config fragment owns `html.labels` (on by default) and aliases v12's `htmlLabels` keys
 * (D696). The provider declines, and core draws the SVG label, when the key is false, there is
 * no DOM, the render is deterministic, or the label holds math or an icon (D697). Text output
 * never asks it.
 *
 * The label's wrapper carries v12's `nodeLabel` or `edgeLabel` class where the diagram says what
 * the label names (D699).
 */
import type { ExtensionPlugin } from '@mermaid-js/core';
import { measure, mountLabels } from './dom.ts';
import { extensionWith } from './extension.ts';
import { createSanitizer, type LinkRules } from './sanitize.ts';

export { LABEL_CLASS, PLACEHOLDER_CLASS } from './dom.ts';
export { ALLOWED_TAGS, labelHtml } from './html.ts';
export type { LinkRules } from './sanitize.ts';

type View = Window & typeof globalThis;

/** The HTML labels extension: register it with `registerExternalDiagrams([htmlLabels])`. */
export const htmlLabels: ExtensionPlugin<Element, unknown> = extensionWith({
  document() {
    const d = (globalThis as { document?: Document }).document;
    return d?.body && d.defaultView ? d : undefined;
  },
  sanitizer: (document, links) => createSanitizer(document.defaultView as View, links),
  measure,
  mount: mountLabels,
});

export default htmlLabels;

/**
 * Swaps the label placeholders under `element` for their HTML: for a host that inserted an svg
 * string itself and has no `RenderResult` to call `bindFunctions` on (a cached string). `links`
 * are the link rules to sanitize with; the defaults are core's (http, https, mailto, relative).
 * Returns how many labels it swapped.
 */
export function mountHtmlLabels(element: Element, links: LinkRules = {}): number {
  const view = element.ownerDocument.defaultView;
  return view ? mountLabels(element, createSanitizer(view, links)) : 0;
}
