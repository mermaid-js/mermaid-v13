/**
 * The sanitizer of HTML labels (D694): DOMPurify with a fixed allow-list, always on. Everything
 * that enters the DOM goes through it, when a label is measured and again when it is mounted,
 * so a stored svg string is never trusted.
 *
 * Beyond DOMPurify's own checks:
 * - `href` and `src` pass core's URL check with the integrator's `linkSchemes` (relative links
 *   and, by default, http, https and mailto), or the attribute goes.
 * - A `style` attribute is read through the browser's CSS parser, and a declaration goes when it
 *   positions the element or loads something (`url(…)`): a label must not cover the page or
 *   fetch from it.
 * - A link that opens a new window gets `rel="noopener noreferrer"`.
 */
import { checkUrl, type UrlOptions } from '@mermaid-js/core/svg';
import createDOMPurify from 'dompurify';
import { ALLOWED_TAGS } from './html.ts';

const ALLOWED_ATTR = [
  'align',
  'alt',
  'bgcolor',
  'border',
  'cellpadding',
  'cellspacing',
  'class',
  'color',
  'colspan',
  'face',
  'height',
  'href',
  'rel',
  'rowspan',
  'size',
  'src',
  'style',
  'target',
  'title',
  'valign',
  'width',
];

/** Properties that take an element out of its label. */
const POSITIONING = new Set(['position', 'z-index', 'inset', 'top', 'right', 'bottom', 'left']);
// A value that loads something or runs something. The CSS parser has already resolved escapes.
const RE_LOADS = /url\(|image-set\(|image\(|expression\(|element\(/i;

/** Sanitizes label HTML into a fragment of `window`'s document. */
export type Sanitize = (html: string) => DocumentFragment;

/** Drops the declarations of `el`'s `style` attribute that position it or load something. */
function tidyStyle(el: Element): void {
  const style = (el as HTMLElement).style as CSSStyleDeclaration | undefined;
  if (!style) return el.removeAttribute('style');
  for (const name of [...style]) {
    if (POSITIONING.has(name) || RE_LOADS.test(style.getPropertyValue(name)))
      style.removeProperty(name);
  }
  if (style.length === 0) el.removeAttribute('style');
}

/** What decides which links a label keeps: the render's, as core reads them for its own links. */
export type LinkRules = Pick<UrlOptions, 'linkSchemes' | 'securityLevel'>;

/**
 * A sanitizer of its own for `window` (hooks are per instance, so the page's DOMPurify is not
 * changed), with the link rules of the render.
 */
export function createSanitizer(
  window: Window & typeof globalThis,
  links: LinkRules = {}
): Sanitize {
  const purify = createDOMPurify(window);
  purify.addHook('afterSanitizeAttributes', (node) => {
    for (const name of ['href', 'src']) {
      const url = node.getAttribute(name);
      if (url !== null && checkUrl(url, links) === undefined) node.removeAttribute(name);
    }
    if (node.hasAttribute('style')) tidyStyle(node);
    if (node.hasAttribute('target')) node.setAttribute('rel', 'noopener noreferrer');
  });
  return (html) =>
    purify.sanitize(html, {
      ALLOWED_TAGS: [...ALLOWED_TAGS],
      ALLOWED_ATTR,
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: true,
      // Only what `checkUrl` then allows gets through; this keeps DOMPurify from dropping a
      // scheme the integrator listed.
      ALLOW_UNKNOWN_PROTOCOLS: true,
      RETURN_DOM_FRAGMENT: true,
    });
}
