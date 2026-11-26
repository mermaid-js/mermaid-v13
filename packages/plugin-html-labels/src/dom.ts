/**
 * The DOM side of HTML labels: measuring a label while the diagram is laid out, and swapping
 * the placeholders of a mounted diagram for the HTML (D697). Only `index.ts` decides whether
 * there is a DOM to use.
 */
import type { FontKey } from '@mermaid-js/core/text';
import type { Sanitize } from './sanitize.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The class of a label's placeholder `<g>` in the svg, and of its HTML wrapper once mounted. */
export const PLACEHOLDER_CLASS = 'mermaid-html-label';
export const LABEL_CLASS = 'html-label';

/** A measured label: its size in px and the HTML to mount, wrapper included. */
export interface Measured {
  readonly width: number;
  readonly height: number;
  readonly html: string;
}

/**
 * Lays `content` (label HTML, not yet safe) out in `document` as the mounted label will be: in a
 * wrapper with the label's font, centred, wrapped at `maxWidth`, with a word wider than that
 * kept whole as v12's HTML labels kept it (#649). The wrapper's own HTML is what is mounted.
 */
export function measure(
  document: Document,
  sanitize: Sanitize,
  content: string,
  font: FontKey,
  maxWidth: number
): Measured {
  const wrapper = document.createElement('div');
  wrapper.className = LABEL_CLASS;
  const { style } = wrapper;
  style.display = 'inline-block';
  style.boxSizing = 'border-box';
  style.textAlign = 'center';
  style.lineHeight = '1.5';
  style.whiteSpace = 'normal';
  style.fontFamily = font.family;
  style.fontSize = `${font.size}px`;
  style.fontWeight = String(font.weight);
  if (Number.isFinite(maxWidth)) style.maxWidth = `${maxWidth}px`;
  wrapper.append(sanitize(content));
  // Out of flow and unseen, but laid out: `display: none` would measure nothing.
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden;width:max-content';
  host.append(wrapper);
  document.body.append(host);
  try {
    const box = wrapper.getBoundingClientRect();
    return {
      // A word wider than `maxWidth` overflows the wrapper: the label is as wide as the word.
      width: Math.ceil(Math.max(box.width, wrapper.scrollWidth)),
      height: Math.ceil(box.height),
      html: wrapper.outerHTML,
    };
  } finally {
    host.remove();
  }
}

/** The colour a label's text takes: the fill its placeholder inherits, when that is a colour. */
function textColor(view: Window, g: Element): string | undefined {
  const fill = view.getComputedStyle(g).fill;
  return fill && fill !== 'none' && !fill.startsWith('url(') ? fill : undefined;
}

/**
 * Swaps every label placeholder under `root` for its HTML, sanitized again, in a
 * `<foreignObject>` of the placeholder's size. A placeholder already swapped is left alone, so
 * mounting twice changes nothing. Returns how many it swapped.
 */
export function mountLabels(root: Element, sanitize: Sanitize): number {
  const document = root.ownerDocument;
  const view = document.defaultView;
  if (!view) return 0;
  let mounted = 0;
  for (const g of root.querySelectorAll(`g.${PLACEHOLDER_CLASS}`)) {
    const rect = g.querySelector(':scope > rect');
    const desc = g.querySelector(':scope > desc');
    if (!rect || !desc) continue;
    const content = sanitize(desc.textContent);
    const wrapper = content.firstElementChild as HTMLElement | null;
    const color = textColor(view, g);
    if (wrapper && color !== undefined) wrapper.style.color = color;
    const holder = document.createElementNS(SVG_NS, 'foreignObject');
    holder.setAttribute('width', rect.getAttribute('width') ?? '0');
    holder.setAttribute('height', rect.getAttribute('height') ?? '0');
    holder.append(content);
    g.replaceChildren(holder);
    mounted++;
  }
  return mounted;
}
