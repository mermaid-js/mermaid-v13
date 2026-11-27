// Flowchart's default edge curve (D733), also swimlane's. It lives in code: the config schema
// gives `flowchart.curve` no default, so an unset key is `undefined` and the top-level `curve`
// can apply under it. A spec pins it, and `DEFAULT_CURVE` to it.
import type { CurveKind } from '@mermaid-js/shared/svg/route';

/** The curve a flowchart edge is drawn with when no edge, section or global key sets one. */
export const FLOWCHART_CURVE = 'rounded' satisfies CurveKind;
