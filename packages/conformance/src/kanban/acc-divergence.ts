// cspell:words accdescr acctitle
/**
 * The one place the kanban lexers and parser leave v12 on purpose (D742): v13 reads
 * `accTitle: …`, `accDescr: …` and `accDescr { … }` at a line start as one `ACC_TITLE` or
 * `ACC_DESCR` token, a statement of its own, where v12's jison lexer has no such token and read
 * an item (a `NODE_ID`, then whatever its text held; at `accDescr {` a lexical error).
 *
 * The gates still compare everything else. v12 is run on the source with each acc statement
 * replaced by {@link ACC_PLACEHOLDER}, an item v12 reads as one `NODE_ID` and nothing more, and
 * v13's acc tokens are compared as that `NODE_ID` ({@link asPlaceholders}): the streams line up
 * token for token before, at and after every acc statement. {@link accProblem} checks that
 * v12, on the source as written, read an item where v13 reads the first acc statement.
 */
import type { Range } from '@mermaid-js/core/parser-kit';
import { KanbanTokenKind as T, kanbanTokens } from '@mermaid-js/diagram-kanban';
import type { JisonToken } from '../jison/oracle.ts';

const ACC = new Set(['ACC_TITLE', 'ACC_DESCR']);

/** What stands for an acc statement on v12's side: one item id, with no character jison splits at. */
const ACC_PLACEHOLDER = 'accItem';

/** The source ranges of `source`'s acc statements, as v13's lexer reads them, in order. */
export function accRanges(source: string): Range[] {
  return kanbanTokens(source)
    .filter((t) => t.kind === T.AccTitle || t.kind === T.AccDescr)
    .map((t) => t.range);
}

/** `source` with each acc statement replaced by {@link ACC_PLACEHOLDER}, for v12. */
export function withPlaceholders(source: string, ranges = accRanges(source)): string {
  let out = '';
  let at = 0;
  for (const r of ranges) {
    out += source.slice(at, r.start) + ACC_PLACEHOLDER;
    at = r.end;
  }
  return out + source.slice(at);
}

/** `ours` with each acc token read as the `NODE_ID` v12 gives {@link ACC_PLACEHOLDER}. */
export function asPlaceholders(ours: readonly JisonToken[]): JisonToken[] {
  return ours.map(([name, image]) =>
    ACC.has(name) ? ['NODE_ID', ACC_PLACEHOLDER] : [name, image]
  );
}

/**
 * Why v12's stream on the source as written (`v12`) is not the divergence D742 allows, or
 * undefined: before our first acc token the streams agree, and there v12 read a `NODE_ID`
 * starting with that keyword, which our token's text extends.
 */
export function accProblem(
  v12: readonly JisonToken[],
  ours: readonly JisonToken[]
): string | undefined {
  const at = ours.findIndex(([name]) => ACC.has(name));
  if (at < 0) return undefined;
  const [name, image] = ours[at]!;
  const [v12Name, v12Image] = v12[at] ?? ['', ''];
  const keyword = name === 'ACC_TITLE' ? 'acctitle' : 'accdescr';
  const before = JSON.stringify(v12.slice(0, at)) === JSON.stringify(ours.slice(0, at));
  const item =
    v12Name === 'NODE_ID' &&
    v12Image.toLowerCase().startsWith(keyword) &&
    image.startsWith(v12Image);
  return before && item
    ? undefined
    : `${name} where v12 has ${v12Name}:${JSON.stringify(v12Image)}`;
}
