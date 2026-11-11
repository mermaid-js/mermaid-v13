// Folding an embedded diagram block (ADR-15, #670): `id@{ view: collapsed }`. State diagrams
// take `@{ … }` for this alone, and only on a block id; anything else is an error. The fold
// may come before or after its block, so the target is checked once the whole text is read.
import type { EmbeddedBlock, Range } from '@mermaid-js/core/parser-kit';
import { isYamlMap, parseYaml } from '@mermaid-js/core/preprocess';

/** One `id@{ … }` statement: the id, where it is, and whether its data is `view: collapsed`. */
export interface Fold {
  readonly id: string;
  readonly range: Range;
}

type Report = (code: string, message: string, range: Range) => void;

/** Whether `data` (`@{ … }` as written) is exactly `view: collapsed`; reports it when not. */
export function foldData(data: string, range: Range, error: Report): boolean {
  if (!data.endsWith('}')) {
    error('UNCLOSED', 'Unclosed `@{`: add `}` at the end of the line to close it.', range);
    return false;
  }
  const { value, diagnostics } = parseYaml(data.slice(1));
  const ok =
    !diagnostics.some((d) => d.severity === 'error') &&
    isYamlMap(value) &&
    Object.keys(value).length === 1 &&
    value.view === 'collapsed';
  if (!ok)
    error(
      'STATE_DATA',
      '`@{ … }` in a state diagram takes only `view: collapsed`, which folds a `mermaid` block.',
      range
    );
  return ok;
}

/**
 * `embeds` with the folded ones marked, and each block's model record (`marks`, by id) too;
 * a fold whose id is not a block is an error.
 */
export function applyFolds(
  folds: readonly Fold[],
  embeds: EmbeddedBlock[],
  marks: ReadonlyMap<string, { folded?: boolean }>,
  error: Report
): void {
  for (const { id, range } of folds) {
    const i = embeds.findIndex((b) => b.id === id);
    if (i < 0) {
      error(
        'STATE_DATA',
        `\`@{ view: collapsed }\` folds a \`mermaid\` block, and \`${id}\` is not one. Folding other states is not supported.`,
        range
      );
      continue;
    }
    embeds[i] = { ...embeds[i]!, folded: true };
    marks.get(id)!.folded = true;
  }
}
