/**
 * The LR layout, after v12's `timelineRenderer.ts`: one row of section boxes, one row of
 * periods below it, each period's events stacked under it, a dashed connector down each column
 * and the axis across under the periods.
 *
 * Changes from v12, each decided: periods are grouped by section position (D251); events start
 * no higher than `eventAxisGap` below the axis (D252); the axis reaches at least the right edge
 * of the last column (v12's `width + 3 × leftMargin` fell short below a `leftMargin` of 25).
 */
import type { TimelineModel } from '../model.ts';
import { Bounds, groupsOf, line, slotOf, titleAt, titleBlock, type Env } from './env.ts';
import { finish } from './finish.ts';
import type {
  TimelineBox,
  TimelineConnector,
  TimelineLayout,
  TimelinePeriodLayout,
  TimelineSectionLayout,
} from './types.ts';

export function layoutLR(env: Env, model: TimelineModel): TimelineLayout {
  const { lr, common } = env.m;
  const boxWidth = lr.wrap + 2 * lr.padding;
  const left = common.originX + env.leftMargin;
  // A title taller than v12's one-line box moves everything below it down.
  const heading = titleBlock(env, model.title);
  const top = common.originY + heading.shift;
  const groups = groupsOf(model);

  const periodLabels = model.periods.map((p) => env.measure(p.text, lr.wrap));
  const eventLabels = model.periods.map((p) => p.events.map((e) => env.measure(e.text, lr.wrap)));
  // v12 takes the maxima of the virtual heights at 150 px, plus `floorExtra`.
  let taskHeight = 0;
  for (const label of periodLabels)
    taskHeight = Math.max(taskHeight, env.boxHeight(label, lr.padding) + lr.floorExtra);
  let sectionFloor = 0;
  for (const s of model.sections)
    sectionFloor = Math.max(
      sectionFloor,
      env.boxHeight(env.measure(s.text, lr.wrap), lr.padding) + lr.floorExtra
    );
  // One connector length for every column: the longest stack of virtual event heights (no
  // `eventMinHeight` floor), with the gaps between.
  let stackLength = 0;
  for (const labels of eventLabels) {
    let sum = 0;
    for (const label of labels) sum += env.boxHeight(label, lr.padding);
    if (labels.length > 0) sum += (labels.length - 1) * lr.eventGap;
    stackLength = Math.max(stackLength, sum);
  }

  // Section boxes, drawn `pitch × columns − sectionTrim` wide and at least `sectionFloor` tall.
  const sectionBoxes: { s: number; x: number; columns: number; periods: readonly number[] }[] = [];
  let x = left;
  for (const g of groups) {
    const columns = Math.max(g.periods.length, 1);
    if (g.section !== undefined)
      sectionBoxes.push({ s: g.section, x, columns, periods: g.periods });
    x += lr.pitch * columns;
  }
  const sectionLabels = sectionBoxes.map(({ s, columns }) =>
    env.measure(model.sections[s]!.text, lr.pitch * columns - lr.sectionTrim)
  );
  let sectionRow = 0;
  const sectionHeights = sectionLabels.map((label) => {
    const h = Math.max(env.boxHeight(label, lr.padding), sectionFloor);
    sectionRow = Math.max(sectionRow, h);
    return h;
  });

  const periodTop = model.sections.length > 0 ? top + sectionRow + lr.sectionGap : top;
  const periodBottom = periodTop + taskHeight;
  const axisY = periodBottom + lr.axisGap;
  const eventsTop = Math.max(periodTop + lr.eventLead, axisY + lr.eventAxisGap);
  const connectorEnd = periodBottom + (eventsTop - periodTop) + stackLength;

  const periods: TimelinePeriodLayout[] = [];
  const connectors: TimelineConnector[] = [];
  const columnX = new Map<number, number>();
  x = left;
  for (const g of groups) {
    g.periods.forEach((i, j) => columnX.set(i, x + j * lr.pitch));
    x += lr.pitch * Math.max(g.periods.length, 1);
  }
  model.periods.forEach((p, i) => {
    const px = columnX.get(i)!;
    const slot = slotOf(env, model, p, i);
    let y = eventsTop;
    const events = p.events.map((e, k): TimelineBox => {
      const label = eventLabels[i]![k]!;
      const height = Math.max(env.boxHeight(label, lr.padding), lr.eventMinHeight);
      const box = {
        ast: e.ast,
        slot,
        label,
        padding: lr.padding,
        x: px,
        y,
        width: boxWidth,
        height,
      };
      y += height + lr.eventGap;
      return box;
    });
    periods.push({
      ast: p.ast,
      period: i,
      ...(p.section !== undefined ? { section: p.section } : {}),
      slot,
      label: periodLabels[i]!,
      padding: lr.padding,
      x: px,
      y: periodTop,
      width: boxWidth,
      height: taskHeight,
      events,
    });
    const cx = px + boxWidth / 2;
    connectors.push({
      ...line(env, cx, periodBottom, cx, connectorEnd, env.connectorWidth),
      period: i,
      slot,
    });
  });

  const sections: TimelineSectionLayout[] = sectionBoxes.map(
    ({ s, x: sx, columns, periods: own }, k) => {
      const label = sectionLabels[k]!;
      const box = {
        x: sx,
        y: top,
        width: lr.pitch * columns - lr.sectionTrim + 2 * lr.padding,
        height: sectionHeights[k]!,
      };
      const band = new Bounds().rect(box);
      for (const i of own) {
        const p = periods[i]!;
        band.rect(p);
        for (const e of p.events) band.rect(e);
        band.segment(connectors[i]!);
      }
      return {
        ast: model.sections[s]!.ast,
        section: s,
        slot: s,
        label,
        padding: lr.padding,
        ...box,
        band: band.box(box),
      };
    }
  );

  // v12's `getBBox` before the title and the axis: what the title and axis are placed from.
  const content = new Bounds();
  for (const s of sections) content.rect(s);
  for (const p of periods) {
    content.rect(p);
    for (const e of p.events) content.rect(e);
  }
  for (const c of connectors) content.segment(c);
  const box = content.box({ x: left, y: top });
  const title = titleAt(env, heading, box.width / 2 - env.leftMargin);
  const axisEnd = Math.max(box.width + lr.axisEndMargins * env.leftMargin, box.x + box.width);
  const axis = line(env, env.leftMargin, axisY, axisEnd, axisY, env.axisWidth);
  return finish(env, {
    direction: 'LR',
    sections,
    periods,
    connectors,
    axis,
    ...(title ? { title } : {}),
  });
}
