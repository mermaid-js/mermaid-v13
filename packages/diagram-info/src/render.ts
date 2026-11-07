// Draws the info diagram through the SvgWriter (#420, DESIGN §7): one `<text class="version">`,
// v12's class name, with `v<version>` in it. It carries the header's `data-ast` (`info`), so a
// preview maps it to the source line; `title` is drawn nowhere, as in v12 (D218), and
// `accTitle` and `accDescr` name the SVG (D133). Its colour is the shared `textColor`, which
// v12's root style gave the text; info has no theme variable of its own.
import type { RenderContext } from '@mermaid-js/core';
import { px, styleScope, styleText, themeStyleSheet } from '@mermaid-js/core/svg';
import type { SvgWriter } from '@mermaid-js/core/svg';
import type { InfoLayout } from './layout.ts';
import type { InfoModel } from './model.ts';

/** What the renderer reads from the render context. */
export type InfoRenderContext = Pick<RenderContext, 'theme' | 'idPrefix' | 'version'>;

/** Writes the whole `<svg>` document for the info diagram. */
export function renderInfo(
  model: InfoModel,
  layout: InfoLayout,
  ctx: InfoRenderContext,
  w: SvgWriter
): void {
  // Read before the root style is written, so it declares its alias.
  const fill = ctx.theme.color('textColor');
  openRoot(model, layout, ctx, w);
  w.open('text', {
    class: 'version',
    'data-ast': 'info',
    x: layout.x,
    y: layout.y,
    'font-size': layout.fontSize,
    'text-anchor': 'middle',
    fill,
  });
  w.text(layout.text);
  w.close();
  w.close();
}

/** The `<svg>` root with its title and description (R-A11Y-1, D133). */
function openRoot(
  model: InfoModel,
  layout: InfoLayout,
  ctx: InfoRenderContext,
  w: SvgWriter
): void {
  const { theme } = ctx;
  const prefix = ctx.idPrefix;
  const { x, y } = layout.bounds;
  const width = Math.ceil(layout.bounds.width);
  const height = Math.ceil(layout.bounds.height);
  const title = model.accTitle.trim();
  const desc = model.accDescr.trim();
  const font = theme.font();
  const auto = theme.autoDeclarations();
  // v12's `configureSvgSize(svg, 100, 400, true)`: always the full width, up to the canvas.
  w.open('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    class: 'mermaid mermaid-info',
    viewBox: [x, y, width, height],
    width: '100%',
    role: 'img',
    'aria-roledescription': 'info',
    'aria-labelledby': title ? `${prefix}-title` : undefined,
    'aria-describedby': desc ? `${prefix}-desc` : undefined,
    'data-mermaid-version': ctx.version,
    'data-p': auto ? styleScope(prefix) : undefined,
    style: styleText({ 'max-width': px(width) }, theme.rootStyleText()),
    'font-family': font,
  });
  if (auto) w.styleSheet(themeStyleSheet(styleScope(prefix), auto.light, auto.dark));
  if (title) textElement(w, 'title', title, `${prefix}-title`);
  if (desc) textElement(w, 'desc', desc, `${prefix}-desc`);
}

function textElement(w: SvgWriter, tag: 'title' | 'desc', text: string, id: string): void {
  w.open(tag, { id });
  w.text(text);
  w.close();
}
