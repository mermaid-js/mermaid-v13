// Class's default edge curve (D733). It lives in code: the config schema gives `class.curve` no
// default, so an unset key is `undefined` and the top-level `curve` can apply under it. A spec
// pins it.
import type { CurveKind } from '@mermaid-js/shared/svg/route';

/** The curve a class edge is drawn with when neither `class.curve` nor `curve` sets one. */
export const CLASS_CURVE = 'rounded' satisfies CurveKind;
