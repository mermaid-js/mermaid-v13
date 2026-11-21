/**
 * The nodes (v12's shapes at fa796a943): actors (`usecaseActor*.ts`), use cases as ovals
 * (`usecaseEllipse.ts`, `usecaseBusiness.ts`) or boxes (`squareRect`), notes (`note.ts`) and
 * JSON tables (`usecaseJsonTable.ts`). Each is one group with v12's classes, `data-id`,
 * `data-ast`, `role="img"` and its accessible name (D475), centred on its laid-out box; every
 * outline goes through `w.outline` (`node`, a table's cells `part`, D302). Actors and use cases
 * take their palette slot under `colorScheme: rotate` (`paint.ts`); an author's `classDef` /
 * `style` wins.
 */
import { translate, type Attrs, type Paint } from '@mermaid-js/core/svg';
import type { MeasuredLabel } from '@mermaid-js/core/text';
import type { ActorView, JsonTableView, NoteView, UseCaseView } from '../layout/prepare.ts';
import type { UsecaseActor } from '../model.ts';
import { drawIconActor, iconsNotRendered } from './assets.ts';
import {
  AWESOME_SILHOUETTE,
  BUSINESS_MARK,
  GLYPH_CLASS,
  glyphPath,
  HOLLOW_BODY,
  HOLLOW_HEAD,
  STICK_FIGURE,
} from './glyphs.ts';
import { DRAW } from './metrics.ts';
import { actorName, jsonName, noteName, useCaseName } from './accessible-names.ts';
import type { PaletteTint } from '@mermaid-js/shared/svg/document';
import { need, type Fill } from './paint.ts';
import { cls, type Scene } from './scene.ts';
import { PX } from '../layout/metrics.ts';

export function drawNodes(scene: Scene): void {
  const { w, p } = scene;
  if (p.nodes.size === 0) return;
  w.open('g', { class: 'nodes' });
  // Actors then use cases share one slot counter, in graph order (v12 `colorIndex`).
  let counted = 0;
  const missed: string[] = [];
  for (const view of p.nodes.values()) {
    switch (view.kind) {
      case 'actor':
        if (drawActor(scene, view, scene.paint.slotOf(counted++))) missed.push(view.actor.icon!);
        break;
      case 'usecase':
        drawUseCase(scene, view, scene.paint.slotOf(counted++));
        break;
      case 'note':
        drawNote(scene, view);
        break;
      case 'json':
        drawJson(scene, view);
        break;
    }
  }
  w.close();
  iconsNotRendered(scene, missed);
}

/** The outline's fill and stroke: the slot's under `rotate`, else the role's; style wins. */
function shapeOf(scene: Scene, role: Fill, slot: PaletteTint | undefined, style: Attrs): Attrs {
  const tint = scene.paint.rotate ? slot : undefined;
  return {
    fill: tint?.fill ?? role.fill,
    stroke: tint?.stroke ?? role.stroke,
    'stroke-width': DRAW.shapeStroke,
    ...style,
  };
}

/** A label's text attributes: its class, its `data-id`, its ink and font, the style's text. */
function textAttrs(
  scene: Scene,
  view: { font: ActorView['font']; style: ActorView['style'] },
  className: string,
  id: string,
  ink: Paint
): Attrs {
  return {
    class: className,
    'data-id': id,
    fill: ink,
    ...scene.fontOf(view.font),
    ...view.style.text,
  };
}

/** A node's group: its layout id, classes, model and AST ids, accessible name and slot. */
interface NodeGroup {
  readonly layoutId: string;
  readonly classes: string;
  readonly id: string;
  readonly ast: string;
  readonly name: string;
  readonly slot?: PaletteTint;
}

/** Opens the group a node is drawn in, centred on its box; its box, or undefined when unplaced. */
function openNode(scene: Scene, g: NodeGroup): { width: number; height: number } | undefined {
  const box = scene.layout.nodes.get(g.layoutId);
  if (!box) return undefined;
  scene.w.open('g', {
    class: g.classes,
    'data-id': g.id,
    'data-ast': g.ast,
    'data-color-id': g.slot?.id,
    role: 'img',
    'aria-label': g.name,
    transform: translate(box.x, box.y),
  });
  return box;
}

const actorClasses = (a: UsecaseActor): string =>
  `node default usecase-actor usecase-actor-${a.type}${a.business ? ' usecase-business' : ''}${cls(a.classes)}`;

/** An actor: the glyph, the stereotype and the name under it. True when its icon was missed. */
function drawActor(scene: Scene, view: ActorView, slot: PaletteTint | undefined): boolean {
  const { w, paint } = scene;
  const a = view.actor;
  const box = openNode(scene, {
    layoutId: view.id,
    classes: actorClasses(a),
    id: a.id,
    ast: a.astId,
    name: actorName(view),
    slot,
  });
  if (!box) return false;
  const role = need(paint.actor, 'actor');
  const shape = shapeOf(scene, role, slot, view.style.shape);
  const top = -box.height / 2;
  w.open('g', {
    class: `usecase-actor-glyph ${GLYPH_CLASS[a.type]}`,
    'data-id': a.id,
    transform: translate(0, top + view.glyphTop + PX.actor.glyphHeight / 2),
  });
  const missed = drawGlyph(scene, a, shape, role.text);
  if (a.business) {
    const [x1, y1, x2, y2] = BUSINESS_MARK[a.type] as [number, number, number, number];
    w.leaf('path', {
      class: 'usecase-business-marker usecase-actor-business-marker',
      d: w.path().moveTo(x1, y1).lineTo(x2, y2).done(),
      fill: 'none',
      stroke: shape.stroke,
      'stroke-width': shape['stroke-width'],
    });
  }
  w.close();
  const ink = role.text;
  if (view.stereotype)
    label(
      scene,
      view.stereotype,
      top + view.stereotypeTop,
      textAttrs(scene, view, 'usecase-stereotype', a.id, ink)
    );
  label(
    scene,
    view.label,
    top + view.labelTop,
    textAttrs(scene, view, 'actor-label usecase-actor-label', a.id, ink)
  );
  w.close();
  return missed;
}

/** A label whose top is at `top`, centred across. */
function label(scene: Scene, box: MeasuredLabel, top: number, attrs: Attrs): void {
  scene.w.label(box, 0, top + box.height / 2, attrs);
}

/** The glyph of `a`'s kind about (0, 0). True when an icon actor's icon was missed. */
function drawGlyph(scene: Scene, a: UsecaseActor, shape: Attrs, ink: Paint): boolean {
  const { w } = scene;
  switch (a.type) {
    case 'normal':
      w.outline('node', 'path', {
        class: 'usecase-actor-stick',
        d: glyphPath(w.path(), STICK_FIGURE),
        ...shape,
      });
      return false;
    case 'hollow':
      w.outline('node', 'circle', {
        class: 'usecase-actor-hollow-head',
        cx: 0,
        cy: HOLLOW_HEAD.cy,
        r: HOLLOW_HEAD.r,
        ...shape,
        fill: 'none',
      });
      w.outline('node', 'path', {
        class: 'usecase-actor-hollow-body',
        d: glyphPath(w.path(), HOLLOW_BODY),
        ...shape,
        fill: 'none',
      });
      return false;
    case 'awesome':
      w.outline('node', 'path', {
        class: 'usecase-actor-awesome-silhouette',
        d: glyphPath(w.path(), AWESOME_SILHOUETTE),
        ...shape,
      });
      return false;
    case 'icon':
      return drawIconActor(scene, a.icon ?? '', shape, ink);
  }
}

const useCaseClasses = (v: UseCaseView): string => {
  const u = v.useCase;
  return `node default usecase-element usecase-${u.shape}${u.business ? ' usecase-business' : ''}${cls(u.classes)}`;
};

/** A use case: the oval or box, a business oval's mark, the stereotype over the label. */
function drawUseCase(scene: Scene, view: UseCaseView, slot: PaletteTint | undefined): void {
  const { w, paint } = scene;
  const u = view.useCase;
  const box = openNode(scene, {
    layoutId: view.id,
    classes: useCaseClasses(view),
    id: u.id,
    ast: u.astId,
    name: useCaseName(view),
    slot,
  });
  if (!box) return;
  const role = need(paint.usecase, 'use case');
  const shape = shapeOf(scene, role, slot, view.style.shape);
  const business = view.shape === 'ellipse' && u.business;
  const rx = box.width / 2;
  const ry = box.height / 2;
  if (view.shape === 'ellipse') {
    w.outline('node', 'ellipse', {
      class: business ? 'basic label-container usecase-business-ellipse' : 'basic label-container',
      cx: 0,
      cy: 0,
      rx,
      ry,
      ...shape,
    });
  } else {
    w.outline('node', 'rect', {
      class: 'basic label-container',
      x: -rx,
      y: -ry,
      width: box.width,
      height: box.height,
      ...shape,
    });
  }
  if (business) businessMark(scene, view, rx, ry, shape);
  const ink = role.text;
  const top = -view.block.height / 2;
  if (view.stereotype)
    label(scene, view.stereotype, top, textAttrs(scene, view, 'usecase-stereotype', u.id, ink));
  const labelTop = top + (view.stereotype ? view.stereotype.height + view.stereotypeGap : 0);
  label(scene, view.label, labelTop, textAttrs(scene, view, 'usecase-label', u.id, ink));
  w.close();
}

/**
 * A business use case's mark (v12 `usecaseBusiness.ts`): a line from just past the label block,
 * low on the oval's right, to just inside the oval, high on it.
 */
function businessMark(scene: Scene, view: UseCaseView, rx: number, ry: number, shape: Attrs): void {
  const inset = DRAW.businessInset;
  const sx = view.block.width / 2 + inset;
  const ex = rx - inset;
  const onOval = (x: number): number => ry * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2));
  scene.w.leaf('path', {
    class: 'usecase-business-marker',
    d: scene.w.path().moveTo(sx, onOval(sx)).lineTo(ex, -onOval(ex)).done(),
    fill: 'none',
    stroke: shape.stroke,
    // v12 gave the oval's mark no width of its own (1) unless styled; an actor's inherits its glyph's.
    'stroke-width': view.style.shape['stroke-width'] ?? DRAW.businessStroke,
    opacity: shape.opacity,
  });
}

function drawNote(scene: Scene, view: NoteView): void {
  const { w, paint } = scene;
  const n = view.note;
  const target = scene.spokenOf.get(n.target) ?? n.target;
  const box = openNode(scene, {
    layoutId: view.id,
    classes: 'node default usecase-note',
    id: n.id,
    ast: n.astId,
    name: noteName(view, target),
  });
  if (!box) return;
  const note = need(paint.note, 'note');
  w.outline('node', 'rect', {
    class: 'basic label-container outer-path',
    x: -box.width / 2,
    y: -box.height / 2,
    width: box.width,
    height: box.height,
    fill: note.fill,
    stroke: note.stroke,
    'stroke-width': DRAW.noteStroke,
    ...view.style.shape,
  });
  w.label(view.label, 0, 0, textAttrs(scene, view, 'noteLabel', n.id, note.text));
  w.close();
}

/** A JSON table: the border, the title cell, then a key and a value cell per row. */
function drawJson(scene: Scene, view: JsonTableView): void {
  const { w, paint } = scene;
  const t = view.table;
  const box = openNode(scene, {
    layoutId: view.id,
    classes: `node default usecase-json-table${cls(t.classes)}`,
    id: t.id,
    ast: t.astId,
    name: jsonName(view),
  });
  if (!box) return;
  const json = need(paint.json, 'JSON table');
  const shape: Attrs = {
    fill: json.fill,
    stroke: json.stroke,
    'stroke-width': DRAW.jsonStroke,
    ...view.style.shape,
  };
  const left = -box.width / 2;
  const top = -box.height / 2;
  w.outline('node', 'rect', {
    class: 'label-container usecase-json-border',
    x: left,
    y: top,
    width: box.width,
    height: box.height,
    ...shape,
  });
  const inner = box.width - 2 * view.border;
  const x0 = left + view.border;
  const ink = (c: string): Attrs => textAttrs(scene, view, c, t.id, json.text);
  w.open('g', { class: 'usecase-json-table-grid' });
  cell(
    scene,
    'usecase-json-cell usecase-json-title-cell',
    { x: x0, y: top + view.border, width: inner, height: view.titleHeight },
    shape
  );
  w.label(view.title, 0, top + view.border + view.titleHeight / 2, ink('usecase-json-title'));
  for (const row of view.rows) {
    const y = top + row.top;
    const cy = y + row.height / 2;
    w.open('g', { class: 'usecase-json-row' });
    cell(
      scene,
      'usecase-json-cell usecase-json-key-cell',
      { x: x0, y, width: view.keyWidth, height: row.height },
      shape
    );
    cell(
      scene,
      'usecase-json-cell usecase-json-value-cell',
      { x: x0 + view.keyWidth, y, width: view.valueWidth, height: row.height },
      shape
    );
    w.label(row.key, x0 + view.keyWidth / 2, cy, ink('usecase-json-key'));
    w.label(row.value, x0 + view.keyWidth + view.valueWidth / 2, cy, ink('usecase-json-value'));
    w.close();
  }
  w.close();
  w.close();
}

/** A JSON cell, through `w.outline('part', …)`. */
function cell(scene: Scene, c: string, box: Box, shape: Attrs): void {
  scene.w.outline('part', 'rect', { class: c, ...box, ...shape });
}

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
