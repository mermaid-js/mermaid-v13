/**
 * The shared edge-path step for line hops (D537): every edge-drawing diagram draws its edge lines
 * through `SvgWriter.outline('edge', 'path', …)` (D302), so hops are found there, for every
 * diagram, on either writer backing. A hop on an early edge can depend on a later one, so the
 * step writes everything through at once and only notes each edge line's path data; `finish`
 * then puts the hopped path data in the finished markup, in place of the lines that give way.
 * Hops never need the tree writer: a render without hops never gets here.
 */
import type { StreamSvgWriter, TreeSvgWriter } from '../../svg/writer.ts';
import { hopPaths, type HopStyle } from './hops.ts';

/** One edge line: its path data as written, and its coordinate frame. */
interface Line {
  readonly d: string;
  readonly frame: number;
}

/**
 * Wraps `w` so edge lines drawn in one coordinate frame hop over each other in `style`. A frame
 * is the space under the nearest element with a `transform` (or the root): only lines in the
 * same frame are compared, since their numbers are in the same space. Every call goes straight
 * through to `w`; `finish` returns `w`'s markup with the hopped lines' new path data. A line an
 * outline drawer redraws (hand-drawn) is not in the markup as written, so it keeps its own
 * drawing. On the tree backing, `postRender` hooks see the lines before their hops.
 */
export function hopWriter<W extends StreamSvgWriter | TreeSvgWriter>(w: W, style: HopStyle): W {
  const lines: Line[] = [];
  const frames = [0];
  let next = 0;
  const top = (): number => frames[frames.length - 1]!;
  const done = (svg: string): string => {
    if (lines.length < 2) return svg;
    const hopped = new Map<Line, string>();
    const byFrame = new Map<number, Line[]>();
    for (const line of lines) {
      const list = byFrame.get(line.frame) ?? [];
      byFrame.set(line.frame, list);
      list.push(line);
    }
    for (const list of byFrame.values())
      hopPaths(
        list.map((l) => l.d),
        style
      ).forEach((d, i) => {
        if (d !== undefined) hopped.set(list[i]!, d);
      });
    if (hopped.size === 0) return svg;
    // The lines are in the markup in drawing order: each is looked for after the one before.
    // (A path elsewhere with the very same data, drawn before its edge line, would be taken
    // for it; edge lines start and end on node borders, so none does in practice.)
    let out = '';
    let at = 0;
    for (const line of lines) {
      const written = ` d="${line.d}"`;
      const i = svg.indexOf(written, at);
      if (i < 0) continue;
      const d = hopped.get(line);
      out += svg.slice(at, i) + (d === undefined ? written : ` d="${d}"`);
      at = i + written.length;
    }
    return out + svg.slice(at);
  };
  const writer: StreamSvgWriter & Partial<TreeSvgWriter> = {
    open(tag, attrs) {
      frames.push(attrs?.transform === undefined ? top() : ++next);
      w.open(tag, attrs);
    },
    close() {
      frames.pop();
      w.close();
    },
    leaf: (tag, attrs) => w.leaf(tag, attrs),
    outline(role, tag, attrs) {
      if (role === 'edge' && tag === 'path' && typeof attrs?.d === 'string')
        lines.push({ d: attrs.d, frame: attrs.transform === undefined ? top() : ++next });
      w.outline(role, tag, attrs);
    },
    text: (content) => w.text(content),
    label: (box, x, y, attrs) => w.label(box, x, y, attrs),
    path: () => w.path(),
    styleSheet: (css) => w.styleSheet(css),
    linearGradient: (g) => w.linearGradient(g),
    embed: (svg) => w.embed(svg),
    finish: () => done(w.finish()),
    get tree() {
      return (w as Partial<TreeSvgWriter>).tree!;
    },
  };
  return writer as W;
}
