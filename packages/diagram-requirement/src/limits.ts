/**
 * The style-copy cap's error (D433, R-SEC-5), shaped as gantt's step limit (D542): the parse
 * stops copying styles at `MAX_STYLE_COPIES` and records the overflow in the model; the layout
 * calls {@link checkStyleCopies} first, so the render ends in the pipeline's `LIMIT` error with
 * the limit, its value and the count found. The cap is fixed (Pele's limit), not the
 * integrator's `maxLayoutWork`, whose name it reports.
 */
import { LimitError } from '@mermaid-js/core/limits';
import type { RequirementModel } from './model.ts';

/** Throw the cap's `LimitError` when the parse passed it; else nothing. */
export function checkStyleCopies(model: Pick<RequirementModel, 'styleCopies'>): void {
  const over = model.styleCopies;
  if (!over) return;
  throw new LimitError(
    'maxLayoutWork',
    over.max,
    over.found,
    `The requirement diagram's \`style\`, \`class\` and \`classDef\` statements copy more than ${over.max} styles and classes onto its boxes (${over.found} when it stopped): each name in a \`class\` or \`style\` list copies every style of every class named. Shorten the repeated name lists, or the \`classDef\` style lists they apply.`
  );
}
