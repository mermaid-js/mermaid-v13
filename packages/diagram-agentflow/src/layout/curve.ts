// Agentflow's default edge curve (D687, D733). It lives in code: the config schema gives
// `agentflow.curve` no default, so an unset key is `undefined` and the top-level `curve` can
// apply under it. A spec pins it.
import type { CurveKind } from '@mermaid-js/shared/svg/route';

/** The curve an agentflow edge is drawn with when no `linkStyle`, `agentflow.curve` or `curve` sets one. */
export const AGENTFLOW_CURVE = 'rounded' satisfies CurveKind;
