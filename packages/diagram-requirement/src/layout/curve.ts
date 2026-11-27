// Requirement's default edge curve (D733). It lives in code: the config schema gives
// `requirement.curve` no default, so an unset key is `undefined` and the top-level `curve` can
// apply under it. A spec pins it.
import type { CurveKind } from '@mermaid-js/shared/svg/route';

/** The curve a relation is drawn with when neither `requirement.curve` nor `curve` sets one. */
export const REQUIREMENT_CURVE = 'rounded' satisfies CurveKind;
