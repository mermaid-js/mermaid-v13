/**
 * Hover on a front-matter key (D96): `title`, `displayMode`, `config`, and every `config` key
 * the schema declares, with its description, type, default and compatibility status (D60).
 */
import type { Hover } from '@mermaid-js/core/parser-kit';
import type { DocumentContext } from '../context.ts';
import { keyAt } from './front-matter.ts';
import type { FrontMatterTree } from './front-matter.ts';
import { SchemaView, annotationOf, typeText } from './schema.ts';
import type { SchemaNode } from './schema.ts';

/** The front-matter keys outside `config` (v12 reads only these). */
export const FRONT_MATTER_KEYS: Readonly<Record<string, string>> = {
  title: 'The diagram title, drawn above the diagram.',
  displayMode: 'Legacy: the same as `config.gantt.displayMode`, which Mermaid moves it to.',
  config: 'Config for this diagram: the keys of `initialize()`, scoped to this diagram.',
};

/** Markdown describing one config key from its schema node. */
export function describeKey(path: string, node: SchemaNode): string {
  const lines = [`**${path}**`];
  if (node.description !== undefined) lines.push('', node.description.trim());
  const facts = [`Type: \`${typeText(node)}\``];
  if (node.default !== undefined) facts.push(`Default: \`${JSON.stringify(node.default)}\``);
  lines.push('', facts.join(' · '));
  const note = annotationOf(node);
  lines.push(
    '',
    [
      `Status: ${note.status}${note.since === undefined ? '' : ` (since ${note.since})`}.`,
      note.movedTo === undefined ? undefined : `Moved to \`${note.movedTo}\`.`,
      note.reason,
      note.replacement === undefined ? undefined : `Replacement: ${note.replacement}.`,
    ]
      .filter((s) => s !== undefined)
      .join(' ')
  );
  return lines.join('\n');
}

export function frontMatterHover(
  ctx: DocumentContext,
  fm: FrontMatterTree,
  offset: number
): Hover | undefined {
  const hit = keyAt(fm.root, offset);
  if (hit === undefined) return undefined;
  const [head, ...rest] = hit.path;
  const range = hit.pair.keyRange;
  if (rest.length === 0 && head !== undefined && Object.hasOwn(FRONT_MATTER_KEYS, head)) {
    return { range, contents: `**${head}**\n\n${FRONT_MATTER_KEYS[head]}` };
  }
  if (head !== 'config' || ctx.schema === undefined) return undefined;
  const schema = new SchemaView(ctx.schema);
  const node = schema.at(rest);
  return node && { range, contents: describeKey(rest.join('.'), schema.resolve(node)) };
}
