// State's default edge curve (D733). It lives in code: the config schema gives `state.curve` and
// the global `curve` no default, so an unset key is `undefined` and the global one can apply
// under it. A spec pins it. Not flowchart's `rounded`: an unset key keeps today's state look.
import type { CurveKind } from '@mermaid-js/shared/svg/route';

/** The curve a state transition is drawn with when neither `state.curve` nor `curve` is set. */
export const STATE_CURVE = 'curved' satisfies CurveKind;
