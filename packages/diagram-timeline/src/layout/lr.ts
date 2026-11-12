/**
 * The LR layout, after v12's `timelineRenderer.ts`: one row of section boxes, one row of
 * periods below it, each period's events stacked under it, a dashed connector down each column
 * and the axis across under the periods.
 *
 * Changes from v12, each decided: periods are grouped by section position (D251); events start
 * no higher than `eventAxisGap` below the axis (D252); the axis reaches at least the right edge
 * of the last column (v12's `width + 3 × leftMargin` fell short below a `leftMargin` of 25); a
 * column whose period, event or section holds a word wider than the wrap width is that much
 * wider, and the columns after it move along (D558, #649).
 */
import type { TimelineModel } from '../model.ts';
import type { MeasuredLabel } from '@mermaid-js/core/text';
import {
  Bounds,
  groupsOf,
  line,
  overflow,
  slotOf,
  titleAt,
  titleBlock,
  type Env,
  type Group,
} from './env.ts';
import { finish } from './finish.ts';
import type {
  TimelineBox,
  TimelineConnector,
  TimelineLayout,
  TimelinePeriodLayout,
  TimelineSectionLayout,
} from './types.ts';

/** A section's box across its columns, with its label. */
interface SectionBox {
  readonly s: number;
  readonly x: number;
  /** Its columns' pitches together. */
  readonly span: number;
  readonly periods: readonly number[];
  readonly label: MeasuredLabel;
}

/**
 * Where each column starts and what it adds to `pitch` and to its boxes' width (D558): as much
 * as a word kept whole in its period or an event passes the wrap width, plus an even share of
 * what its section's word passes the section's. A section with no periods still takes one
 * column. Without long words every column is `pitch` apart, as in v12.
 */
function columnsOf(
  env: Env,
  model: TimelineModel,
  groups: readonly Group[],
  periodLabels: readonly MeasuredLabel[],
  eventLabels: readonly (readonly MeasuredLabel[])[],
  left: number
): { extra: number[]; columnX: Map<number, number>; sectionBoxes: SectionBox[] } {
  const { lr } = env.m;
  const extra = model.periods.map((_, i) => {
    let w = overflow(periodLabels[i]!, lr.wrap);
    for (const label of eventLabels[i]!) w = Math.max(w, overflow(label, lr.wrap));
    return w;
  });
  const emptyExtra = new Map<number, number>();
  const sectionText = new Map<number, MeasuredLabel>();
  for (const g of groups) {
    if (g.section === undefined) continue;
    const columns = Math.max(g.periods.length, 1);
    let wrap = lr.pitch * columns - lr.sectionTrim;
    for (const i of g.periods) wrap += extra[i]!;
    const label = env.measure(model.sections[g.section]!.text, wrap);
    sectionText.set(g.section, label);
    const share = overflow(label, wrap) / columns;
    if (share === 0) continue;
    if (g.periods.length === 0) emptyExtra.set(g.section, share);
    for (const i of g.periods) extra[i] = extra[i]! + share;
  }
  const sectionBoxes: SectionBox[] = [];
  const columnX = new Map<number, number>();
  let x = left;
  for (const g of groups) {
    const start = x;
    if (g.periods.length === 0) x += lr.pitch + (emptyExtra.get(g.section ?? -1) ?? 0);
    for (const i of g.periods) {
      columnX.set(i, x);
      x += lr.pitch + extra[i]!;
    }
    if (g.section !== undefined)
      sectionBoxes.push({
        s: g.section,
        x: start,
        span: x - start,
        periods: g.periods,
        label: sectionText.get(g.section)!,
      });
  }
  return { extra, columnX, sectionBoxes };
}

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

  const { extra, columnX, sectionBoxes } = columnsOf(
    env,
    model,
    groups,
    periodLabels,
    eventLabels,
    left
  );
  const sectionLabels = sectionBoxes.map((b) => b.label);
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
  model.periods.forEach((p, i) => {
    const px = columnX.get(i)!;
    const width = boxWidth + extra[i]!;
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
        width,
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
      width,
      height: taskHeight,
      events,
    });
    const cx = px + width / 2;
    connectors.push({
      ...line(env, cx, periodBottom, cx, connectorEnd, env.connectorWidth),
      period: i,
      slot,
    });
  });

  const sections: TimelineSectionLayout[] = sectionBoxes.map(
    ({ s, x: sx, span, periods: own }, k) => {
      const label = sectionLabels[k]!;
      const box = {
        x: sx,
        y: top,
        width: span - lr.sectionTrim + 2 * lr.padding,
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
