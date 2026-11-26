/**
 * The DOM side of HTML labels: measuring a label while the diagram is laid out, and swapping
 * the placeholders of a mounted diagram for the HTML (D697). Only `index.ts` decides whether
 * there is a DOM to use.
 */
import { PLACEHOLDER, type FontKey, type InlineBox } from '@mermaid-js/core/text';
import type { Sanitize } from './sanitize.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The class of a label's placeholder `<g>` in the svg, and of its HTML wrapper once mounted. */
export const PLACEHOLDER_CLASS = 'mermaid-html-label';
export const LABEL_CLASS = 'html-label';
/** The class of the room an HTML label leaves for an inline box (math, an icon; D698). */
export const BOX_CLASS = 'html-label-box';

/** A label to measure: its HTML, how it is set, and the inline boxes it leaves room for. */
export interface LabelSource {
  /** The label as HTML, not yet safe. Box `i` is the character `PLACEHOLDER + i` in its text. */
  readonly html: string;
  readonly font: FontKey;
  /** The width the label wraps at, in px; `Infinity` for none. */
  readonly maxWidth: number;
  /** The wrapper's classes: `html-label`, and v12's class for the label's role (D699). */
  readonly className: string;
  /** The label's inline boxes (D698), by index. */
  readonly boxes: readonly InlineBox[];
}

/** Where an inline box goes in its label: its top-left corner, in px from the label's. */
export interface Placed {
  readonly x: number;
  readonly y: number;
}

/** A measured label: its size in px, the HTML to mount (wrapper included) and where its boxes go. */
export interface Measured {
  readonly width: number;
  readonly height: number;
  readonly html: string;
  /** By box index. `undefined` for a box whose placeholder is not in the label's text. */
  readonly at: readonly (Placed | undefined)[];
}

// One placeholder character (U+FDD0 to U+FDEF, `core/src/text/inline.ts`), captured so that
// `split` keeps it.
const RE_BOX = /([\ufdd0-\ufdef])/;
const SHOW_TEXT = 4;

/** An empty inline block of `box`'s size with its baseline where the box has it. */
function roomFor(document: Document, box: InlineBox): HTMLElement {
  const room = document.createElement('span');
  room.className = BOX_CLASS;
  const { style } = room;
  style.display = 'inline-block';
  style.width = `${box.width}px`;
  style.height = `${box.height}px`;
  // An empty inline block sits with its bottom edge on the baseline: lower it by its descent.
  style.verticalAlign = `${box.baseline - box.height}px`;
  return room;
}

/**
 * Replaces each placeholder character in the text under `root` with the room for its box, and
 * returns the rooms by box index. The elements are made here, after sanitizing, so nothing a
 * label holds can pass for one. A placeholder outside the text (in an attribute) gets none.
 */
function makeRoom(
  document: Document,
  root: Node,
  boxes: readonly InlineBox[]
): (HTMLElement | undefined)[] {
  const rooms: (HTMLElement | undefined)[] = boxes.map(() => undefined);
  if (boxes.length === 0) return rooms;
  const walker = document.createTreeWalker(root, SHOW_TEXT);
  const texts: Text[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode as Text);
  for (const text of texts) {
    const parts = text.data.split(RE_BOX);
    if (parts.length === 1) continue;
    text.replaceWith(
      ...parts.map((part) => {
        const index = RE_BOX.test(part) ? part.charCodeAt(0) - PLACEHOLDER : -1;
        const box = boxes[index];
        // A placeholder with no box, or met a second time, stands for nothing.
        if (!box || rooms[index]) return index < 0 ? part : '';
        return (rooms[index] = roomFor(document, box));
      })
    );
  }
  return rooms;
}

/**
 * Lays `label` out in `document` as the mounted label will be: in a wrapper with the label's
 * font, centred, wrapped at its `maxWidth`, with a word wider than that kept whole as v12's HTML
 * labels kept it (#649), and with room for each inline box where its span was written. The
 * wrapper's own HTML is what is mounted.
 */
export function measure(document: Document, sanitize: Sanitize, label: LabelSource): Measured {
  const { font, maxWidth } = label;
  const wrapper = document.createElement('div');
  wrapper.className = label.className;
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
  wrapper.append(sanitize(label.html));
  const rooms = makeRoom(document, wrapper, label.boxes);
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
      at: rooms.map((room) => {
        const r = room?.getBoundingClientRect();
        return r && { x: r.left - box.left, y: r.top - box.top };
      }),
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
 * Swaps the `<rect>` and `<desc>` of every label placeholder under `root` for the label's HTML,
 * sanitized again, in a `<foreignObject>` of the placeholder's size. The label's inline boxes
 * (D698) stay, drawn over the room the HTML leaves for them. A placeholder already swapped is
 * left alone, so mounting twice changes nothing. Returns how many it swapped.
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
    desc.remove();
    rect.replaceWith(holder);
    mounted++;
  }
  return mounted;
}
