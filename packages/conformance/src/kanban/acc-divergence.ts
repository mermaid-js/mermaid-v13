// cspell:words accdescr acctitle
/**
 * The one place the kanban lexers leave v12's token stream on purpose (D742): v13 reads
 * `accTitle: …`, `accDescr: …` and `accDescr { … }` at a line start as `ACC_TITLE` and
 * `ACC_DESCR`, where v12's jison lexer has no such token and read a `NODE_ID` (an item; at
 * `accDescr {` a lexical error came next). The lexer gates compare both streams up to the first
 * of them, and check that v12's token there is that `NODE_ID`.
 */
import type { JisonToken } from '../jison/oracle.ts';

const ACC = new Set(['ACC_TITLE', 'ACC_DESCR']);

export interface AccCut {
  /** Both streams, cut before the first acc token (unchanged without one). */
  readonly v12: JisonToken[];
  readonly ours: JisonToken[];
  /** Why the cut is not the divergence D742 allows, when it is not. */
  readonly problem?: string;
}

/** `ours` and `v12` cut at our first acc token, with a problem when v12's token there differs. */
export function cutAtAcc(v12: JisonToken[], ours: JisonToken[]): AccCut {
  const at = ours.findIndex(([name]) => ACC.has(name));
  if (at < 0) return { v12, ours };
  const [name, image] = ours[at]!;
  const [v12Name, v12Image] = v12[at] ?? ['', ''];
  const keyword = name === 'ACC_TITLE' ? 'acctitle' : 'accdescr';
  const cut = { v12: v12.slice(0, at), ours: ours.slice(0, at) };
  const lower = v12Image.toLowerCase();
  if (v12Name === 'NODE_ID' && lower.startsWith(keyword) && image.startsWith(v12Image)) return cut;
  return { ...cut, problem: `${name} where v12 has ${v12Name}:${JSON.stringify(v12Image)}` };
}

/** A line of `text` that starts (after blanks) with an acc statement v13 reads (D742). */
const ACC_LINE = /(?:^|\n)[\t ]*acc(?:Title[\t ]*:|Descr[\t ]*[:{])/i;

/**
 * Whether mermaid\@12 may reject `text` where the grammar accepts it for D742: v12 read an acc
 * statement as an item, so its text could leave a shape open, and `accDescr {` was a lexical
 * error. The grammar differentials compare v12's verdict only on sources without one.
 */
export const hasAccStatement = (text: string): boolean => ACC_LINE.test(text);
