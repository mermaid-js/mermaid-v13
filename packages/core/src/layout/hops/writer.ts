/**
 * The shared edge-path step for line hops (D537): every edge-drawing diagram draws its edge lines
 * through `SvgWriter.outline('edge', 'path', …)` (D302), so hops are applied there, for every
 * diagram, on either writer backing. A hop on an early edge can depend on a later one, so the
 * render's writes are kept in order until the drawing is done; then each edge line gets its
 * hops and everything is written, in the same order, into the real writer. Hops never need the
 * tree writer: a render without hops never gets here and keeps the stream writer.
 */
import type { DiagramPlugin } from '../../pipeline/types.ts';
import { pathBuilder } from '../../svg/path.ts';
import type { Attrs, PathData } from '../../svg/types.ts';
import type { SvgWriter } from '../../svg/writer.ts';
import { lineHops, type HopStyle } from './hops.ts';

/** A writer that draws line hops, and the step that writes the kept drawing out. */
export interface HopWriter {
  readonly writer: SvgWriter;
  /** Writes everything drawn so far into the wrapped writer, edge lines hopped. Once. */
  done(): void;
}

/** One edge line: its attributes (`d` replaced once hopped) and its coordinate frame. */
interface Line {
  attrs: Attrs;
  readonly frame: number;
}

/**
 * Wraps `w` so edge lines drawn in one coordinate frame hop over each other in `style`. A frame
 * is the space under the nearest element with a `transform` (or the root): only lines in the same
 * frame are compared, since their numbers are in the same space.
 */
export function hopWriter(w: SvgWriter, style: HopStyle): HopWriter {
  const tape: (() => void)[] = [];
  const lines: Line[] = [];
  const frames = [0];
  let next = 0;
  const top = (): number => frames[frames.length - 1]!;
  const writer: SvgWriter = {
    open(tag, attrs) {
      frames.push(attrs?.transform === undefined ? top() : ++next);
      tape.push(() => w.open(tag, attrs));
    },
    close() {
      frames.pop();
      tape.push(() => w.close());
    },
    leaf(tag, attrs) {
      tape.push(() => w.leaf(tag, attrs));
    },
    outline(role, tag, attrs) {
      if (role === 'edge' && tag === 'path' && typeof attrs?.d === 'string') {
        const line: Line = { attrs, frame: attrs.transform === undefined ? top() : ++next };
        lines.push(line);
        tape.push(() => w.outline(role, tag, line.attrs));
      } else tape.push(() => w.outline(role, tag, attrs));
    },
    text(content) {
      tape.push(() => w.text(content));
    },
    label(box, x, y, attrs) {
      tape.push(() => w.label(box, x, y, attrs));
    },
    path: pathBuilder,
    styleSheet(css) {
      tape.push(() => w.styleSheet(css));
    },
    // Asked for at once: the reference is returned now, and the order of the gradients kept.
    linearGradient: (g) => w.linearGradient(g),
  };
  let written = false;
  return {
    writer,
    done() {
      if (written) return;
      written = true;
      const byFrame = new Map<number, Line[]>();
      for (const line of lines) {
        const list = byFrame.get(line.frame) ?? [];
        byFrame.set(line.frame, list);
        list.push(line);
      }
      for (const list of byFrame.values()) {
        if (list.length < 2) continue;
        const hopped = lineHops(
          list.map((l) => l.attrs.d as string),
          style
        );
        hopped.forEach((d: PathData | undefined, i) => {
          if (d !== undefined) list[i]!.attrs = { ...list[i]!.attrs, d };
        });
      }
      for (const write of tape) write();
    },
  };
}

/**
 * `plugin`, drawing its edge lines with hops in `style` (D537): its `render` draws into a
 * {@link hopWriter} over the writer it is given, whichever backing that is. `mermaid` draws a
 * render with it only when the render's resolved `lineHops` is not `false`.
 */
export function hopPlugin<M, L>(plugin: DiagramPlugin<M, L>, style: HopStyle): DiagramPlugin<M, L> {
  return {
    ...plugin,
    render(model, layout, ctx, w) {
      const hops = hopWriter(w, style);
      plugin.render(model, layout, ctx, hops.writer);
      hops.done();
    },
  };
}
