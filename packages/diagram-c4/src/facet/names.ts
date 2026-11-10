/**
 * Which names each C4 symbol kind can take (`LanguageFacet.isValidId`, D92, D458): an alias is
 * valid when, written bare where that kind is written (an element's or a boundary's first
 * argument, and a relation end naming it), it reads back as exactly that alias.
 */
import { parseC4 } from '../parser/parser.ts';

/** Whether `name` reads back as the alias of an element or boundary, and as relation ends. */
function readsBack(name: string, kind: 'element' | 'boundary'): boolean {
  const text =
    kind === 'element'
      ? `C4Context\nPerson(${name}, "x")\nRel(${name}, ${name}, "y")\n`
      : `C4Context\nBoundary(${name}, "x") {\nPerson(p, "p")\n}\nRel(p, ${name}, "y")\n`;
  const r = parseC4(text);
  if (r.diagnostics.some((d) => d.severity === 'error')) return false;
  const mine = r.symbols.filter((s) => s.name === name);
  const want = kind === 'element' ? 3 : 2;
  return (
    mine.length === want &&
    mine.every((s) => s.kind === kind && text.slice(s.range.start, s.range.end) === name)
  );
}

/** Why `name` cannot be an alias of kind `kind` (an element when omitted), if it cannot. */
export function invalidReason(name: string, kind = 'element'): string | undefined {
  if (kind !== 'element' && kind !== 'boundary') return `'${kind}' is not a C4 symbol kind.`;
  if (name.trim() === '') return 'An alias cannot be empty.';
  // D458: a blank, `,` or `)` ends an argument or is trimmed from it.
  if (/\s/.test(name)) return 'An alias cannot hold a blank or a line break.';
  if (/[,)]/.test(name)) return 'An alias cannot hold `,` or `)`: they end an argument.';
  if (name.includes('"')) return 'An alias cannot hold `"`: arguments have no escapes.';
  if (name.startsWith('$')) return 'An alias cannot start with `$`: that writes a named argument.';
  return readsBack(name, kind) ? undefined : `'${name}' would not read as a C4 alias.`;
}
