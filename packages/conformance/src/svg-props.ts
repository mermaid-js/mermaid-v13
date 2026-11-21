// cspell:words nums MLCQAZ
/**
 * Render-property helpers (DESIGN §13.2, §13.4) for the per-type render specs: well-formed
 * XML, the coordinates an SVG draws at, and the AST index the `data-ast` round-trip checks.
 */
import { SaxesParser } from 'saxes';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import type { SvgElement, SvgView } from './svg-tree.ts';

/** The first XML error in `svg`, if any. */
export function wellFormed(svg: string): string | undefined {
  const parser = new SaxesParser({ xmlns: true });
  let problem: string | undefined;
  parser.on('error', (e) => (problem ??= e.message));
  parser.write(svg).close();
  return problem;
}

/** Every coordinate an element draws at, in root user units (translate() only, as written). */
export function extents(tree: SvgView): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const nums = (s: string | undefined): number[] =>
    s === undefined ? [] : (s.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/g) ?? []).map(Number);
  const walk = (node: SvgElement, x0: number, y0: number): void => {
    const tag = tree.tag(node);
    if (tag === undefined && node !== tree.root) return;
    const at = (name: string): number => Number(tree.getAttr(node, name) ?? 0);
    const t = tree.getAttr(node, 'transform');
    const m = t ? /^translate\((-?[\d.]+),(-?[\d.]+)\)/.exec(t) : null;
    const dx = m ? x0 + Number(m[1]) : x0;
    const dy = m ? y0 + Number(m[2]) : y0;
    const put = (x: number, y: number): void => void out.push({ x: x + dx, y: y + dy });
    if (tag === 'rect') {
      put(at('x'), at('y'));
      put(at('x') + at('width'), at('y') + at('height'));
    } else if (tag === 'circle') {
      put(at('cx') - at('r'), at('cy') - at('r'));
      put(at('cx') + at('r'), at('cy') + at('r'));
    } else if (tag === 'path') {
      // Absolute commands only (PathBuilder writes no others); arcs keep their end points.
      const d = tree.getAttr(node, 'd') ?? '';
      for (const seg of d.match(/[MLCQAZ][^MLCQAZ]*/g) ?? []) {
        const p = nums(seg.slice(1));
        if (seg.startsWith('A')) put(p[5]!, p[6]!);
        else for (let i = 0; i + 1 < p.length; i += 2) put(p[i]!, p[i + 1]!);
      }
    } else if ((tag === 'text' || tag === 'tspan') && tree.getAttr(node, 'x') !== undefined)
      put(at('x'), at('y'));
    for (const c of tree.children(node)) walk(c, dx, dy);
  };
  walk(tree.root, 0, 0);
  return out;
}

/** AST id → node, over the whole tree. */
export function astIndex(ast: AstNode): Map<string, AstNode> {
  const index = new Map<string, AstNode>();
  const visit = (n: AstNode): void => {
    index.set(n.id, n);
    for (const c of n.children ?? []) visit(c);
  };
  visit(ast);
  return index;
}

/**
 * {@link extents} for graph drawings: also `polygon`, `polyline`, `ellipse` and `image`, whose
 * coordinates flowchart shapes write (`translate()` accumulated down the tree, as written). An
 * embedded diagram's `<svg>` (ADR-15) is skipped: the host's box for it is what counts.
 */
export function drawnExtents(tree: SvgView): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const walk = (node: SvgElement, x0: number, y0: number): void => {
    const tag = tree.tag(node);
    if (tag === undefined && node !== tree.root) return;
    // An embedded diagram (ADR-15) has its own viewBox: its box is what the host drew.
    if (tag === 'svg' && node.parent?.tag !== undefined) return;
    const t = tree.getAttr(node, 'transform');
    const m = t ? /^translate\((-?[\d.]+),(-?[\d.]+)\)/.exec(t) : null;
    const dx = m ? x0 + Number(m[1]) : x0;
    const dy = m ? y0 + Number(m[2]) : y0;
    drawnPoints(tree, node, (x, y) => void out.push({ x: x + dx, y: y + dy }));
    for (const c of tree.children(node)) walk(c, dx, dy);
  };
  walk(tree.root, 0, 0);
  return out;
}

type Put = (x: number, y: number) => void;

const numbers = (s: string | undefined): number[] =>
  s === undefined ? [] : (s.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/g) ?? []).map(Number);

/** Each `x y` pair of a number list. */
function pairs(p: number[], put: Put): void {
  for (let i = 0; i + 1 < p.length; i += 2) put(p[i]!, p[i + 1]!);
}

/** A path's points: each segment's pairs, an arc's end point only. */
function pathPoints(d: string, put: Put): void {
  for (const seg of d.match(/[MLCQAZ][^MLCQAZ]*/g) ?? []) {
    const p = numbers(seg.slice(1));
    if (seg.startsWith('A')) put(p[5]!, p[6]!);
    else pairs(p, put);
  }
}

/** The points one element of {@link drawnExtents} draws at, in its own user units. */
function drawnPoints(tree: SvgView, node: SvgElement, put: Put): void {
  const tag = tree.tag(node);
  const at = (name: string): number => Number(tree.getAttr(node, name) ?? 0);
  if (tag === 'rect' || tag === 'image') {
    put(at('x'), at('y'));
    put(at('x') + at('width'), at('y') + at('height'));
  } else if (tag === 'circle' || tag === 'ellipse') {
    const [rx, ry] = tag === 'circle' ? [at('r'), at('r')] : [at('rx'), at('ry')];
    put(at('cx') - rx, at('cy') - ry);
    put(at('cx') + rx, at('cy') + ry);
  } else if (tag === 'polygon' || tag === 'polyline')
    pairs(numbers(tree.getAttr(node, 'points')), put);
  else if (tag === 'path') pathPoints(tree.getAttr(node, 'd') ?? '', put);
  else if ((tag === 'text' || tag === 'tspan') && tree.getAttr(node, 'x') !== undefined)
    put(at('x'), at('y'));
}
