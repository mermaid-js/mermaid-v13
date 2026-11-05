/**
 * `@mermaid-js/plugin-icons` (D290): Iconify icon packs drawn as allow-listed SVG nodes.
 *
 * This entry holds the pure parts (I1, D295): the pack lookup and the body converter. The
 * extension itself, its providers and its manifest come with I2 (#322).
 */
export {
  getIcon,
  iconBox,
  type IconBox,
  type IconData,
  type IconifyAlias,
  type IconifyDimensions,
  type IconifyIcon,
  type IconifyJSON,
  type IconifyTransformations,
} from './resolve.ts';
export { convertBody, type ConvertedBody } from './body.ts';
export { buildIcon, type BuiltIcon } from './icon.ts';
