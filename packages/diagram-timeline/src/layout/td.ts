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
 * starts below a title it would cross (GAPS #337). A box whose label holds a word wider than
 * its wrap width is that much wider (D558, #649): a period to the left, so it still ends
 * `taskAxisGap` before the axis, an event and a section to the right; a section spans its
 * periods and events. The axis and every other box stay where they were.
 */
import type { TimelineModel } from '../model.ts';
import { Bounds, groupsOf, line, overflow, slotOf, titleAt, titleBlock, type Env } from './env.ts';
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
      const label = sectionLabels[g.section]!;
      const height = Math.max(env.boxHeight(label, td.padding), sectionHeight);
      const width = sectionWrap + overflow(label, sectionWrap) + pad2;
      header = { x: axisX - leftWidth, y, width, height };
      band.add(header);
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
          width: eventWidth + overflow(label, td.eventWrap),
          height,
        };
        const cy = ey + height / 2;
        connectors.push({
          ...line(env, axisX, cy, eventX, cy, env.connectorWidth),
          period: i,
          event: k,
          slot,
        });
        band.add(box);
        ey += height + td.eventGap;
        return box;
      });
      const width = periodWidth + overflow(periodLabels[i]!, td.periodWrap);
      const period: TimelinePeriodLayout = {
        ast: p.ast,
        period: i,
        ...(p.section !== undefined ? { section: p.section } : {}),
        slot,
        label: periodLabels[i]!,
        padding: td.padding,
        x: axisX - td.taskAxisGap - width,
        y: rowTop,
        width,
        height: taskHeight,
        events,
      };
      band.add(period);
      periods[i] = period;
      if (header) {
        // The section spans a period or an event widened past it (D558).
        const x1 = Math.min(header.x, period.x);
        let x2 = header.x + header.width;
        for (const e of events) x2 = Math.max(x2, e.x + e.width);
        header = { ...header, x: x1, width: x2 - x1 };
      }
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
  for (const s of sections) content.add(s);
  for (const p of periods) {
    content.add(p);
    for (const e of p.events) content.add(e);
  }
  for (const c of connectors) content.segment(c);
  const box = content.box({ x: left, y: top });
  const title = titleAt(env, heading, box.width / 2 - env.leftMargin);
  if (title) content.add(title);
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
