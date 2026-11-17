/**
 * Temporary (spec #855, X5): the allow-list internals the differential spec's frozen copy of the
 * old `inertProblem` needs. Removed with that copy.
 */
export {
  BLANK_REL,
  GRADIENT_ATTRS,
  GRADIENT_FIXED,
  GRADIENT_TAGS,
  HREF_TAGS,
  LINK_TARGETS,
  NUMERIC_ATTRS,
  RE_GRADIENT_ID,
  RE_USER_GRADIENT_ID,
} from '../allowlist.ts';
export { RE_INVALID_XML } from '../escape.ts';
export {
  BLEND,
  BLEND_MODES,
  RE_UNSAFE_STYLE,
  STYLE_TEXT_PROPERTIES,
  checkColor,
  checkFilter,
  styleSheetProblem,
} from '../style.ts';
export { isImageDataUrl } from '../url.ts';
