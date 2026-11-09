// Ported from v12 `swimlanes/postProcessing.ts` at upstream `c9b12739f` (D532), the direction
// transforms only. The route clean-up passes (`direction/*.ts`) and `validateSwimlanesLayout`
// come with the router (T0b, #595), which runs before this on TB coordinates.
import type { LayoutData } from './layoutData.ts';
import { applyBtDirectionTransform, applyLrDirectionTransform } from './direction/lrTransform.ts';

/** Applies direction transforms and post-routing cleanup to a swimlane layout. */
export function postProcessSwimlaneLayout(layout: LayoutData, direction?: string): void {
  const contentNodes = layout.nodes.filter((n) => !n.isGroup);

  // TB is the canonical orientation. LR/RL rotate rank progression onto X;
  // BT mirrors the canonical Y progression. Cleanup passes below operate in
  // whichever coordinate system this step leaves behind.
  if (
    (direction === 'LR' || direction === 'RL') &&
    contentNodes.length > 0 &&
    !applyLrDirectionTransform(layout, direction)
  ) {
    return;
  }

  if (direction === 'BT' && contentNodes.length > 0) {
    applyBtDirectionTransform(layout);
  }
}
