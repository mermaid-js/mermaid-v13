/**
 * The gitGraph custom layout (spec #292 T3, `layoutKind: 'custom'`): `GitModel` in, `GitLayout`
 * out, without the graph engine. Branch names, ids and tags are measured first, as plain text in
 * the font they are drawn in (D268, pitfall 16); then v12's positioning places lanes, commits,
 * labels, tags and arrows. Every length comes from the metrics table (pitfall 13).
 */
import type { GitModel } from '../model.ts';
import { arrowsOf } from './arrows.ts';
import { apply, atBaseline, Bounds, envOf, type Env, type GitLayoutContext } from './env.ts';
import { commitLabel, lanesOf, tagsOf } from './labels.ts';
import { place } from './place.ts';
import type { GitArrow, GitCommitLayout, GitLane, GitLayout, GitText } from './types.ts';

/** Lays out a git graph in its direction. */
export function layoutGitGraph(model: GitModel, ctx: GitLayoutContext): GitLayout {
  const env = envOf(ctx);
  const p = place(env, model);
  const lanes: GitLane[] = lanesOf(env, model, p);
  const commits: GitCommitLayout[] = model.commits.map((c, i) => {
    const at = p.points[i]!;
    const raw = p.raw[i]!;
    const label = commitLabel(env, model, c, at, raw);
    return {
      id: c.id,
      ast: c.astId,
      seq: c.seq,
      branch: c.branch,
      lane: p.laneOf[i]!,
      ...at,
      symbol: c.customType ?? c.type,
      radius: env.g.commitRadius,
      ...(label ? { label } : {}),
      tags: tagsOf(env, model, c, at, raw),
    };
  });
  const arrows = arrowsOf(env, model, p);
  const drawn = drawnBounds(env, lanes, commits, arrows);
  const title = titleOf(env, model.title, drawn);
  if (title) drawn.rect(title);
  return {
    direction: model.direction,
    lanes,
    commits,
    arrows,
    arrowWidth: env.g.arrowWidth,
    lineWidth: env.lineWidth,
    ...(title ? { title } : {}),
    bounds: drawn.box(env.diagramPadding),
  };
}

/**
 * What is drawn (D224): branch lines with their stroke, label boxes and text, bullets, commit
 * labels and tags at every corner their transform moves, and the arrows' vertices with half
 * their stroke (their corners are quarter circles between vertices, so inside them).
 */
function drawnBounds(
  env: Env,
  lanes: readonly GitLane[],
  commits: readonly GitCommitLayout[],
  arrows: readonly GitArrow[]
): Bounds {
  const b = new Bounds();
  for (const lane of lanes) {
    if (lane.line) {
      const half = env.lineWidth / 2;
      b.point({ x: lane.line.x1, y: lane.line.y1 }, half).point(
        { x: lane.line.x2, y: lane.line.y2 },
        half
      );
    }
    if (lane.label) b.rect(lane.label.box).rect(lane.label.text);
  }
  for (const c of commits) {
    b.point(c, c.radius);
    if (c.label) b.rect(c.label.box, c.label.transform).rect(c.label.text, c.label.transform);
    for (const t of c.tags) {
      for (const pt of t.points) b.rect({ ...pt, width: 0, height: 0 }, t.transform);
      b.point(apply(t.transform, t.hole), t.hole.r);
      b.rect(t.text, t.textTransform);
    }
  }
  const half = env.g.arrowWidth / 2;
  for (const a of arrows) for (const cmd of a.path) b.point(cmd, half);
  return b;
}

/** The title (D265): centred over the drawing, its baseline `titleTopMargin` above 0. */
function titleOf(env: Env, title: string | undefined, drawn: Bounds): GitText | undefined {
  if (title === undefined || title.trim() === '') return undefined;
  const t = env.text([title], env.fonts.title);
  const box = drawn.box();
  return atBaseline(t, box.x + box.width / 2 - t.width / 2, -env.titleTopMargin);
}
