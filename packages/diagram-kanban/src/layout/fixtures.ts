// cspell:words knsv Pneumonoultramicroscopicsilicovolcanoconiosis
/**
 * Layout inputs for the layout specs (spec #424 T3), produced by the v13 parser (T2 #453) and
 * the model adapter, as the plugin will produce them. The corpus files themselves are swept by
 * conformance's `src/kanban/layout-corpus.spec.ts` (a diagram package reads no files); here are
 * the few cases no corpus file has, and a measurer with round numbers.
 */
import { preprocess } from '@mermaid-js/core/preprocess';
import type { Measurer } from '@mermaid-js/core/text';
import { parseKanban } from '../parser/index.ts';
import { kanbanLayoutInput } from './adapter.ts';
import type { KanbanLayoutInput } from './input.ts';

/** The layout input for `src` as the plugin builds it, and the source's `kanban` config. */
export function parsed(src: string): {
  input: KanbanLayoutInput;
  config: Readonly<Record<string, unknown>>;
} {
  const pre = preprocess(src);
  const { model } = parseKanban(src, { preprocessed: pre });
  const config = (pre.frontMatter?.config?.kanban ?? {}) as Readonly<Record<string, unknown>>;
  return { input: kanbanLayoutInput(model), config };
}

/** A board from its lines after the `kanban` header. */
export const kanban = (...lines: string[]): string => ['kanban', ...lines].join('\n');

/**
 * A measurer with round numbers, for geometry specs: every character is 8 px wide and a line is
 * 24 px high, the line height v12's default HTML labels measured (16 px trebuchet).
 */
export const gridMeasurer: Measurer = {
  id: 'kanban-grid',
  width: (text) => [...text].length * 8,
  metrics: () => ({ ascent: 18, descent: 6, lineHeight: 24 }),
};

/**
 * Sources for what no corpus file draws (`e2e/diagrams/kanban/**` and the cases file cover the
 * empty board and column, 15 columns, deep and misplaced indents and wrapping titles).
 */
export const EDGE_CASES: Readonly<Record<string, string>> = {
  'a word wider than the column': kanban(
    '  a[Supercalifragilisticexpialidocious-and-then-some]',
    '    x[Pneumonoultramicroscopicsilicovolcanoconiosis]'
  ),
  // v12 wraps both at W − 25 too; past 40 px high they stick out of the card's bottom.
  'a ticket and an assignee on several lines': kanban(
    '  a[Todo]',
    "    x[Card]@{ ticket: 'MC-1<br>MC-2<br>MC-3', assigned: 'a very long assignee name' }"
  ),
  'a title on three lines as the title row': kanban(
    '  a[one<br>two<br>three]',
    '    x[Card]',
    '  b[Short]',
    '  c[Empty]'
  ),
};
