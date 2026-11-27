// Flowchart's default edge curve (D733), also swimlane's. It lives in code: the config schema
// gives `flowchart.curve` no default, so an unset key is `undefined` and the top-level `curve`
// can apply under it. A spec pins it, and `DEFAULT_CURVE` to it.
import type { ResolvedConfig } from '@mermaid-js/core/config';
import type { CurveKind } from '@mermaid-js/shared/svg/route';
import type { FlowModel } from '../parser/index.ts';

/** The curve a flowchart edge is drawn with when no edge, section or global key sets one. */
export const FLOWCHART_CURVE = 'rounded' satisfies CurveKind;

/**
 * The curve the diagram's own config key sets, `undefined` when none does (D761). A
 * `swimlane-beta` diagram's `swimlane.curve` wins whenever it is set, from any config source;
 * only when it is unset does `flowchart.curve` apply. A flowchart drawn with `layout: swimlane`
 * reads only `flowchart.curve`: "swimlane.curve is a diagram-specific configuration, not a
 * layout-specific one." Config does not chain `curve` between the two sections (D761).
 */
export function configCurve(
  model: Pick<FlowModel, 'swimlane'>,
  config: ResolvedConfig
): string | undefined {
  return (model.swimlane ? config.swimlane?.curve : undefined) ?? config.flowchart?.curve;
}
