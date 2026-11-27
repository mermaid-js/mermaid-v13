// A subpath of its own (D557): core's index does not re-export it, so it stays outside the core
// closure (R-PERF-8) and only the diagrams load it.
//
// D732: in the default mode, markdown outside a markdown string is drawn as written. A label
// that holds some says so, once per render, and names both ways back.
import type { RenderContext } from '../pipeline/types.ts';
import { labelSource } from './label-source.ts';
import type { LabelConfig, LabelSource, LabelSourceOptions } from './label-source.ts';

/** The warning a render gives, once, for markdown in a label that is no markdown string. */
export const MARKDOWN_NOT_READ = {
  code: 'MARKDOWN_NOT_READ',
  message:
    'Markdown is read only in a markdown string: write "`…`", or set markdownAlwaysOn: true.',
} as const;

// Math and code spans, passed over; or a pair of `**`, `__`, `*` or `_` around text in one line
// (group 1): the opening mark not after a letter, digit or `_`, the closing one not before them
// or a file extension, and neither next to a blank or another mark. So `snake_case`, `my_file_name.ts`,
// `__init__.py`, `2*3*4`, `a * b * c`, `[*]` and a lone `*` are text.
const RE_PAIR =
  /\$\$[\s\S]*?\$\$|`[^`\n]*`|(?<!\w)(\*\*?|__?)(?=[^\s*_])[^\n]*?[^\s*_]\1(?!\.?\w)/g;

const hasPair = (text: string): boolean => [...text.matchAll(RE_PAIR)].some((m) => m[1]);

/**
 * Whether `label`, read by {@link labelSource} with `options` and `config`, is plain and holds a
 * pair of emphasis marks around text: markdown the render draws as written (D732). A markdown
 * string, quoted or marked by the parser, and every label under `markdownAlwaysOn` are read as
 * markdown, so they never count.
 */
export const markdownOutside = (
  label: string,
  options?: LabelSourceOptions,
  config?: LabelConfig
): boolean => {
  const source = labelSource(label, options, config);
  return source.markup === 'plain' && hasPair(source.text);
};

/** The part of a render's context {@link readLabel} reads. */
export type MarkdownWarningContext = Pick<RenderContext, 'config' | 'warn' | 'inline'>;

/**
 * {@link labelSource} of `label` with `options` and `ctx.config`, giving the render its
 * {@link MARKDOWN_NOT_READ} warning when the label is plain and holds an emphasis pair. Call it
 * for every label, in place of `labelSource`. The render gets the warning once however many
 * labels hold markdown: it goes through `ctx.inline.warn`, which the API always sets and which
 * gives a code and message once per render. A context without `inline` (a diagram called
 * without `mermaid`) gets it from every such label.
 */
export function readLabel(
  label: string,
  options: LabelSourceOptions | undefined,
  ctx: MarkdownWarningContext
): LabelSource {
  const source = labelSource(label, options, ctx.config);
  if (source.markup === 'plain' && hasPair(source.text))
    (ctx.inline?.warn ?? ctx.warn)(MARKDOWN_NOT_READ);
  return source;
}

/** {@link readLabel} for a caller that has its `labelSource` already: warns, returns nothing. */
export const warnMarkdownOutside = (
  label: string,
  options: LabelSourceOptions | undefined,
  ctx: MarkdownWarningContext
): void => void readLabel(label, options, ctx);
