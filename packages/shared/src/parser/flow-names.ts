/**
 * The flow family's check of a new class name or edge id (rename, D92): the name is written
 * into a probe text of the dialect and must read back as exactly that symbol.
 */
import type { ParseResult } from '@mermaid-js/core/parser-kit';
import { readsBack, shapeReason } from './facet.ts';

/**
 * Why `name` cannot be a class name or an edge id (`kind`) in the dialect whose texts start
 * with `header` (its header line, line break included) and are read by `parse`, or `undefined`
 * when it can.
 */
export function flowNameReason(
  name: string,
  kind: 'class' | 'edge',
  header: string,
  parse: (text: string) => Pick<ParseResult<unknown>, 'diagnostics' | 'symbols'>
): string | undefined {
  const before = kind === 'class' ? 'classDef ' : 'A ';
  const text =
    kind === 'class' ? `${header}classDef ${name} fill:#000\n` : `${header}A ${name}@--> B\n`;
  return (
    shapeReason(name, 'An id') ??
    (readsBack(parse(text), header.length + before.length, name, kind)
      ? undefined
      : `'${name}' is not ${kind === 'class' ? 'a class name' : 'an edge id'}.`)
  );
}
