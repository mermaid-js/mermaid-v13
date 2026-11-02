/**
 * The error image (R-ERR-3, D49): an SVG drawn through the same writer as diagrams, so it is
 * themed and inside the allow-list. The message is escaped text, one `<tspan>` per line.
 */
import type { SafeValue } from '../svg/types.ts';
import { streamWriter } from '../svg/writer.ts';
import { px, styleText } from '../svg/style.ts';
import { createTheme, type Theme } from '../theme/theme.ts';
import { loadedTheme } from '../theme/registry.ts';
import type { MermaidError } from './errors.ts';

export interface ErrorSvgContext {
  /** The render's theme; the built-in default theme when absent. */
  readonly theme?: Theme;
  /** Written as `data-mermaid-version`. */
  readonly version?: string;
}

const MAX_LINES = 16;
const LINE = 18;
const PAD = 16;
// A monospace advance estimate; the image does not need measuring precision.
const CHAR = 7.8;

export function renderErrorSvg(error: MermaidError, ctx: ErrorSvgContext = {}): string {
  const theme = ctx.theme ?? createTheme(loadedTheme('redux')!);
  const fill = theme.color('errorBkgColor');
  const ink = theme.color('errorTextColor');
  const all = [`Syntax error in text (${error.code})`, ...error.message.split('\n')];
  const lines = all.length > MAX_LINES ? [...all.slice(0, MAX_LINES - 1), '…'] : all;
  const width = Math.ceil(
    Math.max(320, Math.min(1200, PAD * 2 + Math.max(...lines.map((l) => l.length)) * CHAR))
  );
  const height = PAD * 2 + lines.length * LINE;
  const w = streamWriter();
  w.open('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    class: 'mermaid mermaid-error',
    viewBox: [0, 0, width, height],
    width: '100%',
    role: 'img',
    'aria-roledescription': 'error',
    'data-mermaid-version': ctx.version ?? '13',
    style: styleText({ 'max-width': px(width), ...theme.rootStyle() }),
  });
  w.leaf('rect', { class: 'error-frame', x: 0, y: 0, width, height, fill });
  w.open('text', {
    class: 'error-text',
    fill: ink,
    'font-family': 'monospace' as SafeValue,
    'font-size': 13,
    'xml:space': 'preserve',
  });
  lines.forEach((line, i) => {
    w.open('tspan', { x: PAD, y: PAD + (i + 1) * LINE - 5 });
    w.text(line);
    w.close();
  });
  w.close();
  w.close();
  return w.finish();
}
