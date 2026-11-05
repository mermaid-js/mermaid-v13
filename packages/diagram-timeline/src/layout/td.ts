/**
 * The TD layout, after v12's `timelineRendererVertical.ts`: the axis runs down, periods sit
 * right-aligned `taskAxisGap` left of it, each period's events stack `eventAxisGap` right of it
 * with a dashed connector from the axis to each, and sections are full rows above their
 * periods. Every row has one height: the tallest period or event stack.
 *
 * Changes from v12, each decided: periods are grouped by section position (D251); arrowheads
 * are drawn (D253); a section never starts over the previous one's last row (GAPS #337: v12
 * subtracted `2 × rowGap` from the section's height, so the next section began 30 px above the
 * end of a full last row), it starts at least `rowGap` below what that row holds; the axis
 * starts below a title it would cross (GAPS #337).
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

export function layoutTD(env: Env, model: TimelineModel): TimelineLayout {
  const { td, common } = env.m;
  const pad2 = 2 * td.padding;
  const periodWidth = td.periodWrap + pad2;
  const eventWidth = td.eventWrap + pad2;
  const left = common.originX + env.leftMargin;
  // A title taller than v12's one-line box moves everything below it down.
  const heading = titleBlock(env, model.title);
  const top = common.originY + heading.shift;
  const leftWidth = periodWidth + td.taskAxisGap;
  const rightWidth = eventWidth + td.eventAxisGap;
  const axisX = left + leftWidth;
  const eventX = axisX + td.eventAxisGap;
  const sectionWrap = Math.max(td.sectionMinWrap, leftWidth + rightWidth - pad2);

  const periodLabels = model.periods.map((p) => env.measure(p.text, td.periodWrap));
  const eventLabels = model.periods.map((p) =>
    p.events.map((e) => env.measure(e.text, td.eventWrap))
  );
  const sectionLabels = model.sections.map((s) => env.measure(s.text, sectionWrap));
  let taskHeight = 0;
  for (const label of periodLabels)
    taskHeight = Math.max(taskHeight, env.boxHeight(label, td.padding));
  let sectionHeight = 0;
  for (const label of sectionLabels)
    sectionHeight = Math.max(sectionHeight, env.boxHeight(label, td.padding));
  let stackHeight = 0;
  for (const labels of eventLabels) {
    let sum = 0;
    for (const label of labels) sum += env.boxHeight(label, td.padding);
    if (labels.length > 0) sum += (labels.length - 1) * td.eventGap;
    stackHeight = Math.max(stackHeight, sum);
  }
  const pitch = Math.max(taskHeight, stackHeight) + td.rowGap;

  const periods: TimelinePeriodLayout[] = new Array<TimelinePeriodLayout>(model.periods.length);
  const connectors: TimelineConnector[] = [];
  const sections: TimelineSectionLayout[] = [];
  let y = top;
  for (const g of groupsOf(model)) {
    const band = new Bounds();
    let rowsTop = y;
    let header: { x: number; y: number; width: number; height: number } | undefined;
    if (g.section !== undefined) {
      const height = Math.max(env.boxHeight(sectionLabels[g.section]!, td.padding), sectionHeight);
      header = { x: axisX - leftWidth, y, width: sectionWrap + pad2, height };
      band.rect(header);
      rowsTop = y + height + td.sectionTaskGap;
    }
    g.periods.forEach((i, j) => {
      const p = model.periods[i]!;
      const rowTop = rowsTop + j * pitch;
      const slot = slotOf(env, model, p, i);
      let ey = rowTop;
      const events = p.events.map((e, k): TimelineBox => {
        const label = eventLabels[i]![k]!;
        const height = env.boxHeight(label, td.padding);
        const box = {
          ast: e.ast,
          slot,
          label,
          padding: td.padding,
          x: eventX,
          y: ey,
          width: eventWidth,
          height,
        };
        const cy = ey + height / 2;
        connectors.push({
          ...line(env, axisX, cy, eventX, cy, env.connectorWidth),
          period: i,
          event: k,
          slot,
        });
        band.rect(box);
        ey += height + td.eventGap;
        return box;
      });
      const period: TimelinePeriodLayout = {
        ast: p.ast,
        period: i,
        ...(p.section !== undefined ? { section: p.section } : {}),
        slot,
        label: periodLabels[i]!,
        padding: td.padding,
        x: axisX - td.taskAxisGap - periodWidth,
        y: rowTop,
        width: periodWidth,
        height: taskHeight,
        events,
      };
      band.rect(period);
      periods[i] = period;
    });
    const n = g.periods.length;
    // v12's advance, then no higher than `rowGap` below what the group holds.
    const v12Next = rowsTop + pitch * Math.max(n, 1) - (n > 0 ? 2 * td.rowGap : 0);
    const held = band.box({ x: left, y });
    y = Math.max(v12Next, held.y + held.height + td.rowGap);
    if (header && g.section !== undefined)
      sections.push({
        ast: model.sections[g.section]!.ast,
        section: g.section,
        slot: g.section,
        label: sectionLabels[g.section]!,
        padding: td.padding,
        ...header,
        band: band.box(header),
      });
  }

  // v12's `getBBox` before the title, then with it: the axis ends below all of it.
  const content = new Bounds();
  for (const s of sections) content.rect(s);
  for (const p of periods) {
    content.rect(p);
    for (const e of p.events) content.rect(e);
  }
  for (const c of connectors) content.segment(c);
  const box = content.box({ x: left, y: top });
  const title = titleAt(env, heading, box.width / 2 - env.leftMargin);
  if (title) content.rect(title);
  const all = content.box({ x: left, y: top });
  // v12 starts the axis 2 font sizes above the content, through a title wider than half the
  // content; it starts below the title instead.
  let axisTop = top - td.axisTopEm * env.fontSize;
  if (title && title.x < axisX && title.x + title.width > axisX)
    axisTop = Math.max(axisTop, title.y + title.height);
  const axis = line(
    env,
    axisX,
    axisTop,
    axisX,
    all.y + all.height + td.axisBottomEm * env.fontSize + td.axisBottomPad,
    env.axisWidth
  );
  return finish(env, {
    direction: 'TD',
    sections,
    periods,
    connectors,
    axis,
    ...(title ? { title } : {}),
  });
}
