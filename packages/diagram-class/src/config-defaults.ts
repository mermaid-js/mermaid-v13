import { classConfigDefaults } from './generated/config-defaults.ts';

/**
 * The `class` section's defaults, less `padding` (D125): its documented default, 12, is what
 * v12 padded class boxes with, but v12 padded namespaces 16 and notes 6 when the key was unset
 * (`padding ?? 16`, `?? 6`). Left out, the layout still sees "unset" and draws all three as v12
 * did; an author's `padding` pads all three, as in v12.
 */
const { padding: _documented, ...withoutPadding } = classConfigDefaults;
export const configDefaults = withoutPadding;
