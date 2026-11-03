/**
 * The security allow-list (R-SEC-2). The writer, the `SvgTree` view and `assertInert`
 * all read these tables, so what can be written and what is accepted stay the same list.
 * A new diagram type that needs another element or attribute adds it here and in
 * `types.ts`, with care.
 */
import type { AllowedAttr, AllowedTag } from './types.ts';

const TAG_TABLE: Record<AllowedTag, true> = {
  svg: true,
  g: true,
  path: true,
  rect: true,
  circle: true,
  ellipse: true,
  polygon: true,
  polyline: true,
  line: true,
  text: true,
  tspan: true,
  a: true,
  title: true,
  desc: true,
  image: true,
};

const ATTR_TABLE: Record<AllowedAttr, true> = {
  xmlns: true,
  viewBox: true,
  width: true,
  height: true,
  preserveAspectRatio: true,
  class: true,
  id: true,
  role: true,
  'aria-roledescription': true,
  'aria-labelledby': true,
  'aria-describedby': true,
  'aria-label': true,
  'aria-hidden': true,
  'data-id': true,
  'data-ast': true,
  'data-mermaid-version': true,
  'data-p': true,
  style: true,
  transform: true,
  'pointer-events': true,
  x: true,
  y: true,
  x1: true,
  y1: true,
  x2: true,
  y2: true,
  cx: true,
  cy: true,
  r: true,
  rx: true,
  ry: true,
  dx: true,
  dy: true,
  d: true,
  points: true,
  fill: true,
  'fill-opacity': true,
  stroke: true,
  'stroke-width': true,
  'stroke-dasharray': true,
  'stroke-dashoffset': true,
  'stroke-linecap': true,
  'stroke-linejoin': true,
  'stroke-miterlimit': true,
  'stroke-opacity': true,
  opacity: true,
  filter: true,
  color: true,
  'font-family': true,
  'font-size': true,
  'font-weight': true,
  'font-style': true,
  'text-anchor': true,
  'dominant-baseline': true,
  'text-decoration': true,
  'letter-spacing': true,
  'xml:space': true,
  href: true,
  target: true,
  rel: true,
};

/** Every element the writer may emit. */
export const ALLOWED_TAGS: ReadonlySet<string> = new Set(Object.keys(TAG_TABLE));
/** Every attribute the writer may emit. */
export const ALLOWED_ATTRS: ReadonlySet<string> = new Set(Object.keys(ATTR_TABLE));
/** Elements that may hold character data. */
export const TEXT_HOLDERS: ReadonlySet<string> = new Set(['text', 'tspan', 'title', 'desc']);
/** Attributes whose value must be a number. */
export const NUMERIC_ATTRS: ReadonlySet<string> = new Set([
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'dx',
  'dy',
  'stroke-miterlimit',
]);
/** Elements that may carry `href`. */
export const HREF_TAGS: ReadonlySet<string> = new Set(['a', 'image']);
/** Link targets that are kept (D62). */
export const LINK_TARGETS: ReadonlySet<string> = new Set(['_self', '_blank', '_parent', '_top']);
/** The value of `rel` written on every `_blank` link. */
export const BLANK_REL = 'noopener noreferrer';
export const SVG_NS = 'http://www.w3.org/2000/svg';

export function isAllowedTag(tag: string): tag is AllowedTag {
  return ALLOWED_TAGS.has(tag);
}

export function isAllowedAttr(name: string): name is AllowedAttr {
  return ALLOWED_ATTRS.has(name);
}
