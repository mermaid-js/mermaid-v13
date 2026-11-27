// A subpath of its own, which only the diagrams with a `v12Markdown` label kind load (D557):
// core's index does not re-export it, so it stays outside the core closure (R-PERF-8).
//
// D732: in the default mode, markdown written outside a markdown string is drawn as written. In
// the label kinds where v12 read it, that silently changes a v12 diagram, so the render says so,
// once, and names both ways back.
import type { RenderContext } from '../pipeline/types.ts';
import { emphasisAt } from './label.ts';
import { labelSource } from './label-source.ts';
import type { LabelConfig, LabelSourceOptions } from './label-source.ts';
import { Style } from './measurer.ts';

/** The warning a render gives, once, for markdown in a plain label of a `v12Markdown` kind. */
export const MARKDOWN_NOT_READ = {
  code: 'MARKDOWN_NOT_READ',
  message:
    'Markdown is read only in a markdown string: write "`…`", or set legacyMarkdown: true to draw labels as v12 did.',
} as const;

// The line breaks of an `emphasis` label, as label layout splits it: emphasis stays in its line.
const RE_LINE = /<br\s*\/?>|\r\n?|\n/i;

/** Whether `line`, read as an `emphasis` label, has a pair of marks around text. */
function emphasisPair(line: string): boolean {
  let marked = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] as string;
    if (ch !== '*' && ch !== '_') continue;
    const len = emphasisAt(line, i, ch, marked);
    if (len === 0) continue;
    const bit = len === 2 ? Style.Bold : Style.Italic;
    if ((marked & bit) !== 0) return true;
    marked |= bit;
    i += len - 1;
  }
  return false;
}

/**
 * Whether `label`, as written, is markdown that v12 drew and this render draws as written
 * (D732): the label kind has `options.v12Markdown`, `config` does not set `legacyMarkdown`, the
 * label is no markdown string, and read as v12 read it ({@link labelSource} with
 * `legacyMarkdown`), one of its lines holds a pair of `**`, `__`, `*` or `_` around text.
 * An `_` inside a word, a lone `*`, the marks in a code span and a label that starts with a list
 * marker do not count, as they never drew emphasis.
 */
export function markdownOutside(
  label: string,
  options: LabelSourceOptions = {},
  config: LabelConfig = {}
): boolean {
  if (!options.v12Markdown || config.legacyMarkdown) return false;
  const v12 = labelSource(label, options, { legacyMarkdown: true });
  return v12.markup === 'emphasis' && v12.text.split(RE_LINE).some(emphasisPair);
}

/** The part of a render's context {@link warnMarkdownOutside} reads. */
export type MarkdownWarningContext = Pick<RenderContext, 'config' | 'warn' | 'inline'>;

/**
 * Gives the render's {@link MARKDOWN_NOT_READ} warning when `label` is
 * {@link markdownOutside}. Call it with the arguments of the label's {@link labelSource} call,
 * `ctx` in place of `ctx.config`, for every label of a `v12Markdown` kind. The render gets the
 * warning once however many labels call it: it goes through `ctx.inline.warn`, which the API
 * always sets and which gives a code and message once per render. A context without `inline`
 * (a diagram called without `mermaid`) gets it from every such label.
 */
export function warnMarkdownOutside(
  label: string,
  options: LabelSourceOptions,
  ctx: MarkdownWarningContext
): void {
  if (markdownOutside(label, options, ctx.config))
    (ctx.inline?.warn ?? ctx.warn)(MARKDOWN_NOT_READ);
}
