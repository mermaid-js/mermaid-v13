/**
 * SvgWriter, escaping and url/style/colour safety (DESIGN §7, §10).
 */
export type {
  AllowedAttr,
  AllowedTag,
  Attrs,
  AttrTypes,
  Brand,
  Length,
  LinkTarget,
  Paint,
  PathData,
  SafeColor,
  SafeLength,
  SafeUrl,
  SafeValue,
  StyleText,
  SvgWarning,
  ThemeRef,
  Transform,
  Warn,
} from './types.ts';
export { ALLOWED_ATTRS, ALLOWED_TAGS, SVG_NS } from './allowlist.ts';
export { esc, num } from './escape.ts';
export { rotate, scale, transforms, translate, type PathBuilder } from './path.ts';
export type { SvgMatch, SvgNode, SvgTree } from './tree.ts';
export {
  streamWriter,
  treeWriter,
  type LabelBox,
  type LabelSpan,
  type StreamSvgWriter,
  type SvgWriter,
  type TreeSvgWriter,
} from './writer.ts';
export {
  checkLinkTarget,
  checkUrl,
  resolveSecurityLevel,
  type SecurityLevel,
  type UrlOptions,
} from './url.ts';
export {
  checkColor,
  checkLength,
  checkStyle,
  px,
  styleText,
  themeRef,
  STYLE_PROPERTIES,
  type CheckedStyle,
} from './style.ts';
export { assertInert, inertProblem, type InertOptions } from './inert.ts';
