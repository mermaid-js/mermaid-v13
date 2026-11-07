/**
 * Which names each kanban symbol kind can take (`LanguageFacet.isValidId`, D92): a name is valid
 * when, written where that kind is written, it reads back as exactly that one symbol.
 */
import { parseKanban } from '../parser/parser.ts';
import { kanbanTokens } from '../parser/index.ts';
import { CLASS_BLANK, LINE_BREAK } from '../parser/text.ts';
import { T } from '../parser/tokens.ts';

/** What ends an item id: a shape opener or closer, `{`, `}` or `@` (`]` is part of an id). */
const DELIMITERS = /[()[{}@]/;

/** Whether `name`, written as a card's id, lexes as exactly that id. */
function readsAsId(name: string): boolean {
  const text = `kanban\n  todo\n    ${name}[x]`;
  const at = text.length - name.length - 3;
  const t = kanbanTokens(text).find((x) => x.range.start === at);
  return t?.kind === T.NodeId && t.range.end === at + name.length && t.text === name;
}

/**
 * Whether `name`, the `assigned` value of a card on one line and of one over several, reads
 * back as that assignee in both, with no error.
 */
function readsAsAssignee(name: string): boolean {
  const one = `kanban\n  todo\n    a@{ assigned: `;
  const block = `${one}${name} }\n    b@{\n      assigned: `;
  const text = `${block}${name}\n    }\n`;
  const r = parseKanban(text);
  if (r.diagnostics.some((d) => d.severity === 'error')) return false;
  const mine = r.symbols.filter((s) => s.kind === 'assignee');
  return (
    mine.length === 2 &&
    [one.length, block.length].every((at, k) => {
      const s = mine[k];
      return s?.name === name && s.range.start === at && s.range.end === at + name.length;
    })
  );
}

/** Why `name` cannot be a `kind` name (an item id when omitted), if it cannot. */
export function invalidReason(name: string, kind = 'node'): string | undefined {
  if (kind === 'class') {
    if (name === '') return 'A class name cannot be empty.';
    if (CLASS_BLANK.test(name) || LINE_BREAK.test(name))
      return 'A class name cannot hold blanks or line breaks: `:::a b` is two classes.';
    return undefined;
  }
  if (kind === 'assignee') {
    if (name.trim() === '') return 'An assignee cannot be empty.';
    if (LINE_BREAK.test(name)) return 'An assignee cannot hold a line break.';
    if (name !== name.trim()) return 'An assignee cannot start or end with a blank.';
    return readsAsAssignee(name)
      ? undefined
      : `'${name}' would not read as an assignee written as \`assigned: ${name}\`.`;
  }
  if (kind !== 'node') return `'${kind}' is not a kanban symbol kind.`;
  if (name.trim() === '') return 'An item id cannot be empty.';
  if (LINE_BREAK.test(name)) return 'An item id cannot hold a line break.';
  if (name !== name.trim())
    return 'An item id cannot start or end with a blank: the indent before it makes it a column or a card.';
  if (DELIMITERS.test(name))
    return 'An item id cannot hold `(`, `)`, `[`, `{`, `}` or `@`: they write the shape and its data.';
  return readsAsId(name) ? undefined : `'${name}' would not read as an item id.`;
}
