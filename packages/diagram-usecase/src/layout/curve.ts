// Usecase's default line curve (D733): S-curves, what usecase drew before `usecase.curve`. It
// lives in code: the schema gives `usecase.curve` no default, so an unset key is `undefined` and
// the top-level `curve` can apply under it. A spec pins it.
import type { CurveKind } from '@mermaid-js/shared/svg/route';

/** The curve a relationship or note line is drawn with when neither curve key is set. */
export const USECASE_CURVE = 'curved' satisfies CurveKind;
