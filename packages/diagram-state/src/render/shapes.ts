// The node shapes (v12 `stateStart`, `stateEnd`, `choice`, `forkJoin`, `rect`, `rectWithTitle`,
// `note`), drawn centred on the node's origin from the builder's measured size (#144). Every
// colour and stroke comes from the caller's paint, so the theme decides them (D152). Each goes
// through `w.outline` (D302): states and notes as `node`, the pseudo-states as `mark`.
import type { Attrs, SvgWriter } from '@mermaid-js/core/svg';
import type { StateMetrics, StateNodeView } from '../layout/index.ts';

// v12's state corner radius: `.statediagram-state rect.basic { rx: 5px }` wins over the shape's
// `rx` in every look, so the redux and classic families draw the same value (a constant, D152).
const STATE_RADIUS = 5;
// v12 `stateEnd`: the ring and the dot are drawn 2 wide in every look; the dot's diameter is
// 5/14 of the ring's.
const END_STROKE = 2;
const END_DOT = 5 / 14;

/** What a shape is painted with. */
export interface ShapePaint {
  /** Outline and fill of a box, diamond, ring or note. */
  readonly shape: Attrs;
  /** The filled pseudo-states (start, fork, join): fill and stroke. */
  readonly solid: Attrs;
  /** The end state's ring stroke. */
  readonly ring: Attrs['stroke'];
  /** A described state's divider line; its stroke also fills the end state's dot. */
  readonly line: Attrs;
}

/** Draws a node's shape (not its labels) centred on (0, 0). */
export function drawShape(w: SvgWriter, view: StateNodeView, paint: ShapePaint): void {
  const { w: width, h: height } = view;
  const x = -width / 2;
  const y = -height / 2;
  switch (view.shape) {
    case 'start':
      w.outline('mark', 'circle', {
        class: 'state-start',
        cx: 0,
        cy: 0,
        r: width / 2,
        ...paint.solid,
        filter: paint.shape.filter,
      });
      return;
    case 'end':
      w.outline('mark', 'circle', {
        class: 'state-end',
        cx: 0,
        cy: 0,
        r: width / 2,
        ...paint.shape,
        stroke: paint.ring,
        'stroke-width': END_STROKE,
      });
      w.outline('mark', 'circle', {
        class: 'end-state-inner',
        cx: 0,
        cy: 0,
        r: (width * END_DOT) / 2,
        fill: paint.line.stroke,
        stroke: paint.shape.stroke,
        'stroke-width': END_STROKE,
      });
      return;
    case 'choice': {
      const s = width / 2;
      w.outline('mark', 'polygon', { points: [0, -s, s, 0, 0, s, -s, 0], ...paint.shape });
      return;
    }
    case 'fork':
    case 'join':
      w.outline('mark', 'rect', { class: 'fork-join', x, y, width, height, ...paint.solid });
      return;
    case 'note':
      w.outline('node', 'rect', { x, y, width, height, ...paint.shape });
      return;
    case 'state':
    case 'described':
      w.outline('node', 'rect', { x, y, width, height, rx: STATE_RADIUS, ...paint.shape });
  }
}

/**
 * A described state's labels: its title (the id) at the top, a divider, and the description
 * lines below, as v12 `rectWithTitle` stacks them.
 */
export function drawDescribed(
  w: SvgWriter,
  view: StateNodeView,
  sm: StateMetrics,
  paint: ShapePaint,
  text: Attrs
): void {
  const top = -view.h / 2 + sm.statePad.y;
  const rule = top + view.label.height + sm.descGap / 2;
  w.label(view.label, 0, top + view.label.height / 2, { class: 'state-title', ...text });
  w.outline('divider', 'line', {
    class: 'divider',
    x1: -view.w / 2,
    y1: rule,
    x2: view.w / 2,
    y2: rule,
    ...paint.line,
  });
  const rows = view.rows!;
  w.label(rows, 0, rule + sm.descGap / 2 + rows.height / 2, {
    class: 'state-description',
    ...text,
  });
}
