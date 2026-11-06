/**
 * Branch labels and lines (v12 `drawBranches`), commit labels (`drawCommitLabel`) and tags
 * (`drawCommitTags`).
 */
import type { GitCommit, GitModel } from '../model.ts';
import { atBaseline, type Env } from './env.ts';
import type { Placed } from './place.ts';
import type { GitCommitLabel, GitLane, GitTagLayout, GitText, Point, Rect } from './types.ts';

/** Where a branch label's box starts across the lanes, relative to the lane, and its size. */
export function labelSpan(
  env: Env,
  dir: GitModel['direction'],
  name: GitText
): { start: number; size: number } {
  const bl = env.m.branchLabel;
  if (dir === 'LR') {
    const size = name.height + bl.boxExtraY + env.g.branchLabelPaddingY;
    return { start: env.g.laneOffset - size / 2, size };
  }
  return {
    start: -name.width / 2 - bl.sideBox + env.g.branchLabelOffsetX,
    size: name.width + bl.boxExtraX + env.g.branchLabelPaddingX,
  };
}

/** The lanes, with their lines and labels when `showBranches` is on. */
export function lanesOf(env: Env, model: GitModel, p: Placed): GitLane[] {
  const { axis, branchLabel: bl } = env.m;
  const g = env.g;
  const dir = model.direction;
  return model.branches.map((b, i): GitLane => {
    const pos = p.lanes[i]!;
    const lane = { branch: b.name, index: i, pos };
    if (!env.showBranches) return lane;
    const name = p.names[i]!;
    const spine = dir === 'LR' ? pos + g.laneOffset : pos;
    const width = name.width + bl.boxExtraX + g.branchLabelPaddingX;
    const height = name.height + bl.boxExtraY + g.branchLabelPaddingY;
    const span = labelSpan(env, dir, name);
    let box: Rect;
    let textX: number;
    if (dir === 'LR') {
      const rotated = env.rotateCommitLabel ? bl.rotatedShift : 0;
      box = {
        x: -name.width - bl.boxLeft - rotated + bl.shiftX,
        y: pos + span.start,
        width,
        height,
      };
      textX = box.x + (width - name.width) / 2;
    } else {
      const y = dir === 'TB' ? 0 - g.branchLabelOffsetY : p.maxPos + g.branchLabelOffsetY;
      box = { x: pos + span.start, y, width, height };
      textX = pos - name.width / 2 - bl.sideText;
    }
    // v12's label group: centred in the box, `textRise` higher; its first baseline 1em down.
    const top = box.y + (height - name.height) / 2 - bl.textRise;
    const text = atBaseline(name, textX, top + name.font.size);
    // TB runs from the start down to maxPos, BT the other way, LR from 0 across.
    const [from, to] = dir === 'BT' ? [p.maxPos, axis.start] : [axis.start, p.maxPos];
    const line =
      dir === 'LR'
        ? { x1: 0, y1: spine, x2: p.maxPos, y2: spine }
        : { x1: pos, y1: from, x2: pos, y2: to };
    return { ...lane, line, label: { box, radius: g.branchLabelRadius, text } };
  });
}

/** Whether v12 draws the id: never on a cherry-pick, on a merge only with `id:`. */
const labelled = (c: GitCommit): boolean =>
  c.type !== 'CHERRY_PICK' && (c.type !== 'MERGE' || c.customId);

/** The id label at `at`; `raw` is v12's `pos` (the commit's place before the offset). */
export function commitLabel(
  env: Env,
  model: GitModel,
  c: GitCommit,
  at: Point,
  raw: number
): GitCommitLabel | undefined {
  if (!env.showCommitLabel || !labelled(c)) return undefined;
  const cl = env.m.commitLabel;
  const t = env.text([c.id], env.fonts.commit);
  const w = t.width;
  const h = t.height;
  const size = { width: w + 2 * cl.pad, height: h + 2 * cl.pad };
  if (model.direction === 'LR') {
    const box = { x: at.x - w / 2 - cl.pad, y: at.y + cl.boxTop, ...size };
    const text = atBaseline(t, at.x - w / 2, at.y + cl.baseline);
    if (!env.rotateCommitLabel) return { box, text };
    const transform = {
      dx: cl.shiftX - ((w + cl.shiftXPad) / cl.shiftUnit) * cl.shiftXRate,
      dy: cl.shiftY + (w / cl.shiftUnit) * cl.shiftYRate,
      angle: cl.angle,
      cx: raw,
      cy: at.y,
    };
    return { box, text, transform };
  }
  const box = { x: at.x - (w + cl.sideText + cl.sideBox), y: at.y - cl.sideTop, ...size };
  const text = atBaseline(t, at.x - (w + cl.sideText), at.y + h - cl.sideTop);
  if (!env.rotateCommitLabel) return { box, text };
  return { box, text, transform: { dx: 0, dy: 0, angle: cl.angle, cx: at.x, cy: at.y } };
}

/** The tags, in source order; v12 stacks them from the last, which is nearest the commit. */
export function tagsOf(
  env: Env,
  model: GitModel,
  c: GitCommit,
  at: Point,
  raw: number
): GitTagLayout[] {
  if (c.tags.length === 0) return [];
  const tm = env.m.tag;
  const texts = c.tags.map((tag) => env.text([tag], env.fonts.tag));
  let maxW = 0;
  let maxH = 0;
  for (const t of texts) {
    maxW = Math.max(maxW, t.width);
    maxH = Math.max(maxH, t.height);
  }
  const h2 = maxH / 2;
  const n = c.tags.length;
  return c.tags.map((tag, i): GitTagLayout => {
    const t = texts[i]!;
    const yOffset = (n - 1 - i) * tm.step;
    if (model.direction === 'LR') {
      const ly = at.y - tm.middle - yOffset;
      const left = at.x - maxW / 2 - tm.padX;
      const right = at.x + maxW / 2 + tm.padX;
      const tail = raw - maxW / 2 - tm.padX / 2;
      return {
        tag,
        points: [
          { x: tail, y: ly + tm.padY },
          { x: tail, y: ly - tm.padY },
          { x: left, y: ly - h2 - tm.padY },
          { x: right, y: ly - h2 - tm.padY },
          { x: right, y: ly + h2 + tm.padY },
          { x: left, y: ly + h2 + tm.padY },
        ],
        hole: { x: raw - maxW / 2 + tm.padX / 2, y: ly, r: tm.hole },
        text: atBaseline(t, at.x - t.width / 2, at.y - tm.baseline - yOffset),
      };
    }
    const yo = raw + yOffset;
    const body = at.x + tm.sideBody;
    const end = body + maxW + tm.padX;
    const rotate = { angle: tm.angle, cx: at.x, cy: raw };
    return {
      tag,
      points: [
        { x: at.x, y: yo + tm.padY },
        { x: at.x, y: yo - tm.padY },
        { x: body, y: yo - h2 - tm.padY },
        { x: end, y: yo - h2 - tm.padY },
        { x: end, y: yo + h2 + tm.padY },
        { x: body, y: yo + h2 + tm.padY },
      ],
      hole: { x: at.x + tm.padX / 2, y: yo, r: tm.hole },
      text: atBaseline(t, at.x + tm.sideTextX, yo + tm.sideTextBaseline),
      transform: { dx: tm.sideShift, dy: tm.sideShift, ...rotate },
      textTransform: { dx: tm.sideTextShift, dy: tm.sideTextShift, ...rotate },
    };
  });
}
