/**
 * Architecture's icons (D505, D506): the seven built-ins drawn by the package (`builtins.ts`),
 * every other name through the extensions' glyphs (`RenderContext.icon`, D293) resolved as v12
 * resolved it, v12's `?` square where nothing draws it, and text icons laid out in the `blank`
 * square.
 *
 * v12 looked a name up with `getIconSVG(name, { fallbackPrefix: 'mermaid-architecture' })`:
 * Iconify's `stringToIcon`, so `logos:aws` and the dash form `logos-aws` are the `logos` pack's
 * `aws`, `a:b:c` is `b:c`, and a bare name is its own pack's (checked against 12.2.0's
 * `@iconify/utils` 3.1.7). The icons extension splits names the same way (`plugin-icons`
 * `iconName`, parity-tested against v12), so a name is handed to it as written, with that
 * fallback pack, and never split here.
 */
import type { Point } from '@mermaid-js/core/layout';
import { scale, transforms, translate, writeFragment, type SvgWriter } from '@mermaid-js/core/svg';
import {
  layoutLabel,
  type BoxRun,
  type FontKey,
  type MeasuredLabel,
  type Run,
  type SvgFragment,
} from '@mermaid-js/core/text';
import { WARNING_NAMES } from '../codes.ts';
import { readArchitectureLabel } from '../label.ts';
import type { ArchitectureSizes } from '../layout/metrics.ts';
import { ART_SIZE, BUILTIN_PACK, WHITE, builtinIcons } from './builtins.ts';
import type { ArchitectureRenderContext } from './context.ts';

export { BUILTIN_PACK } from './builtins.ts';

export const ICON_NOT_RENDERED = 'ICON_NOT_RENDERED';

const ELLIPSIS = '…';

const { listed: LISTED, longest: LONGEST } = WARNING_NAMES;

/** The built-in `name` names, written bare or with v12's own pack; undefined for any other. */
function builtin(name: string): SvgFragment | undefined {
  const icons = builtinIcons();
  const bare = name.startsWith(`${BUILTIN_PACK}:`) ? name.slice(BUILTIN_PACK.length + 1) : name;
  return icons.get(bare);
}

/** Whether `name` is one of the seven built-ins (D505): no extension is asked for it. */
export function isBuiltinIcon(name: string): boolean {
  return builtin(name) !== undefined;
}

/** Writes `icon` (drawn in v12's square) in a `size` square with its corner at `at`. */
function drawArt(w: SvgWriter, icon: SvgFragment, size: number, at: Point): void {
  const k = size / ART_SIZE;
  const parts = [];
  if (at.x !== 0 || at.y !== 0) parts.push(translate(at.x, at.y));
  if (k !== 1) parts.push(scale(k));
  // The icon's own `g` (v12's `wrapIcon`) carries the placement.
  writeFragment(
    w,
    parts.length === 0
      ? icon
      : { ...icon, attrs: { ...icon.attrs, transform: transforms(...parts) } }
  );
}

const drawNamed = (w: SvgWriter, name: 'unknown' | 'blank', size: number, at: Point): void =>
  drawArt(w, builtinIcons().get(name)!, size, at);

/**
 * Draws the icon `name` in a `size` square with its corner at `at`: a built-in, the extension's
 * glyph, nothing while its pack loads (D299), or v12's `?` square. True when it drew the `?` for
 * a name no extension warned about (the render's one `ICON_NOT_RENDERED` lists it).
 */
export function drawIcon(
  w: SvgWriter,
  ctx: ArchitectureRenderContext,
  name: string,
  size: number,
  at: Point
): boolean {
  const own = builtin(name);
  if (own) {
    drawArt(w, own, size, at);
    return false;
  }
  const glyph = ctx.icon?.(name, size, { fallbackPrefix: BUILTIN_PACK, pending: true });
  if (glyph === 'pending') return false;
  if (glyph) {
    w.open('g', { transform: translate(at.x, at.y) });
    writeFragment(w, glyph);
    w.close();
    return false;
  }
  drawNamed(w, 'unknown', size, at);
  return glyph !== null;
}

/**
 * `names` for a warning (`WARNING_NAMES`): the first few quoted, each cut to its longest, then
 * "and n more".
 */
export function listNames(names: readonly string[]): string {
  const quoted = names
    .slice(0, LISTED)
    .map((n) => JSON.stringify(n.slice(0, LONGEST)))
    .join(', ');
  return names.length > LISTED ? `${quoted} and ${String(names.length - LISTED)} more` : quoted;
}

/**
 * The render's one `ICON_NOT_RENDERED` (D291, D505) for the names drawn as v12's `?` that no
 * extension warned about, each once, through the inline providers' deduplicating `warn` when
 * there are any.
 */
export function iconsNotRendered(ctx: ArchitectureRenderContext, drawn: readonly string[]): void {
  const names = [...new Set(drawn)];
  const warning = {
    code: ICON_NOT_RENDERED,
    message: `Icons not rendered: ${listNames(names)}. Architecture draws database, server, disk, internet, cloud, blank and unknown itself; any other icon needs an icons extension with its pack (logos:aws or logos-aws). Each is drawn as a "?" square.`,
  };
  if (ctx.inline) ctx.inline.warn(warning);
  else ctx.warn(warning);
}

/**
 * Where each line of `label` ends, down from its top: `lineHeight` apart, or as far as an inline
 * box grew a line (core's `grownBaselines`: a line is as tall as its tallest box above and below
 * the baseline).
 */
function lineBottoms(label: MeasuredLabel): number[] {
  const { baselines, baseline, lineHeight } = label;
  return label.lines.map((line, i) => {
    if (!baselines) return (i + 1) * lineHeight;
    let below = lineHeight - baseline;
    for (const r of line)
      if (r.kind === 'box') below = Math.max(below, (r as BoxRun).height - (r as BoxRun).baseline);
    return baselines[i]! + below;
  });
}

/**
 * A text icon's text (D506): laid out as a label wrapped to the square less v12's 1 px margin,
 * cut to the lines whose real height fits (v12's `-webkit-line-clamp`) and to the width, the last
 * kept line ending in an ellipsis where anything was cut. Undefined when not one line fits.
 */
export function fitTextIcon(
  text: string,
  markdown: true | undefined,
  sizes: ArchitectureSizes,
  font: FontKey,
  ctx: ArchitectureRenderContext
): MeasuredLabel | undefined {
  const room = sizes.iconSize - 2 * sizes.iconTextMargin;
  if (!(room > 0)) return undefined;
  // Read by core's label handler (#1368), as every other architecture label.
  const source = readArchitectureLabel(text, markdown, ctx);
  const label = layoutLabel(source.text, font, room, ctx.measurer, {
    ...source,
    inline: ctx.inline,
  });
  const bottoms = lineBottoms(label);
  let most = 0;
  while (most < bottoms.length && bottoms[most]! <= room) most++;
  if (most < 1) return undefined;
  const cut = label.lines.length > most;
  if (!cut && label.width <= room) return label;
  const lines: Run[][] = [];
  const widths: number[] = [];
  const indents: number[] = [];
  for (let i = 0; i < most; i++) {
    let runs = label.lines[i]!;
    let width = label.widths[i]!;
    if (width > room || (cut && i === most - 1))
      [runs, width] = withEllipsis(runs, room, font, ctx);
    lines.push(runs);
    widths.push(width);
    indents.push(label.indents[i] ?? 0);
  }
  return {
    ...label,
    lines,
    widths,
    indents,
    width: Math.max(0, ...widths),
    height: bottoms[most - 1]!,
    ...(label.baselines ? { baselines: label.baselines.slice(0, most) } : {}),
  };
}

/** `runs` cut from the end until it and an ellipsis fit in `room`, and its width. */
function withEllipsis(
  runs: readonly Run[],
  room: number,
  font: FontKey,
  ctx: ArchitectureRenderContext
): [Run[], number] {
  const out = [...runs];
  let width = out.reduce((s, r) => s + r.width, 0);
  for (;;) {
    const last = out.pop();
    if (last === undefined) {
      const dots = ctx.measurer.width(ELLIPSIS, font, 0);
      return [[{ text: ELLIPSIS, style: 0, width: dots }], dots];
    }
    const rest = width - last.width;
    const dots = ctx.measurer.width(ELLIPSIS, font, last.style);
    if (last.kind !== 'box' && rest + dots <= room) {
      // The longest head of this run that fits with the ellipsis (whole code points), found by
      // halving: a head's width grows with its length.
      const chars = [...last.text];
      const textOf = (n: number): string => chars.slice(0, n).join('').trimEnd() + ELLIPSIS;
      const widthOf = (n: number): number => ctx.measurer.width(textOf(n), font, last.style);
      let lo = 0;
      let hi = chars.length;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (rest + widthOf(mid) <= room) lo = mid;
        else hi = mid - 1;
      }
      const run: Run = { ...last, text: textOf(lo), width: widthOf(lo) };
      out.push(run);
      return [out, rest + run.width];
    }
    width = rest;
  }
}

/** Writes a text icon: the `blank` square with the fitted text centred in it, in white. */
export function drawTextIcon(
  w: SvgWriter,
  label: MeasuredLabel | undefined,
  size: number,
  at: Point
): void {
  drawNamed(w, 'blank', size, at);
  if (label)
    w.label(label, at.x + size / 2, at.y + size / 2, { class: 'node-icon-text', fill: WHITE });
}
