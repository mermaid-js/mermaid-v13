/**
 * The v13 parse a parity adapter runs: the model, or a throw carrying the first error
 * diagnostic, so the runner compares models only where v13 accepts the text.
 */
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import type { Diagnostic } from '@mermaid-js/core/parser-kit';

/** What a diagram's parser returns: its model and its diagnostics. */
export interface ParseResult<M> {
  model: M;
  diagnostics: readonly Diagnostic[];
}

/**
 * `result.model`, or a throw carrying the first error of `before` (the preprocess's) and then
 * of the result's diagnostics.
 */
export function modelOrThrow<M>(result: ParseResult<M>, before: readonly Diagnostic[] = []): M {
  const error = [...before, ...result.diagnostics].find((d) => d.severity === 'error');
  if (error) throw new Error(`${error.code}: ${error.message}`);
  return result.model;
}

/**
 * `parse` on `text` with core's preprocess result, through {@link modelOrThrow}. With
 * `withoutTitle`, the front-matter title is held back, as the oracle holds it back from v12 (it
 * never passes front matter to v12); the D218 fallback has its own specs in each package.
 */
export function parseForParity<M>(
  text: string,
  parse: (text: string, options: { preprocessed: PreprocessResult }) => ParseResult<M>,
  { withoutTitle = false }: { withoutTitle?: boolean } = {}
): M {
  const pre = preprocess(text);
  const frontMatter = withoutTitle
    ? pre.frontMatter && { ...pre.frontMatter, title: undefined }
    : pre.frontMatter;
  const result = parse(text, { preprocessed: withoutTitle ? { ...pre, frontMatter } : pre });
  return modelOrThrow(result, pre.diagnostics);
}
