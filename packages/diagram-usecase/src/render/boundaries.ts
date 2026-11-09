/**
 * System boundaries (v12 `clusters.js` `usecaseSystemBoundary`): a `rect` frame, or a `package`
 * frame with its tab at the top left and the title centred in the tab, each through
 * `w.outline('group', …)` (D302). The frame takes the boundary's palette slot under both colour
 * schemes, else the role colours; an author's `classDef` / `style` wins over both.
 */
import type { Attrs } from '@mermaid-js/core/svg';
import type { BoundaryView } from '../layout/prepare.ts';
import { DRAW } from './metrics.ts';
import { boundaryName } from './names.ts';
import { need } from './paint.ts';
import { cls, type Scene } from './scene.ts';

export function drawBoundaries(scene: Scene): void {
  const { w, p } = scene;
  if (p.boundaries.length === 0) return;
  w.open('g', { class: 'clusters' });
  p.boundaries.forEach((view, order) => drawBoundary(scene, view, order));
  w.close();
}

function drawBoundary(
  { w, layout, paint, fontOf }: Scene,
  view: BoundaryView,
  order: number
): void {
  const box = layout.groups.get(view.id);
  if (!box) return;
  const b = view.boundary;
  const role = need(paint.boundary, 'boundary');
  const slot = paint.slotOf(order);
  w.open('g', {
    class: `cluster usecase-system-boundary usecase-system-boundary-${b.type} default system-boundary system-boundary-${b.type}${cls(b.classes)}`,
    'data-id': b.id,
    'data-ast': b.astId,
    'data-color-id': slot?.id,
    role: 'img',
    'aria-label': boundaryName(view),
  });
  const shape: Attrs = {
    fill: slot?.fill ?? role.fill,
    stroke: slot?.stroke ?? role.stroke,
    'stroke-width': DRAW.boundaryStroke,
    ...view.style.shape,
  };
  const x = box.x - box.width / 2;
  const y = box.y - box.height / 2;
  const tab = view.tab;
  const top = tab ? tab.height : 0;
  w.outline('group', 'rect', {
    class: 'boundary-body label-container',
    'data-id': b.id,
    x,
    y: y + top,
    width: box.width,
    height: box.height - top,
    ...shape,
  });
  if (tab) {
    w.outline('group', 'rect', {
      class: 'boundary-tab system-boundary-package-tab label-container',
      'data-id': b.id,
      x,
      y,
      width: Math.min(box.width, tab.width),
      height: tab.height,
      ...shape,
    });
  }
  const at = tab ? { x: x + Math.min(box.width, tab.width) / 2, y: y + tab.height / 2 } : box.title;
  w.open('g', { class: 'cluster-label system-boundary-title' });
  w.label(view.label, at.x, at.y, {
    'data-id': b.id,
    fill: role.title,
    ...fontOf(view.font),
    ...view.style.text,
  });
  w.close();
  w.close();
}
