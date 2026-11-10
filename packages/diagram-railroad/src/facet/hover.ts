/**
 * Railroad hover (DESIGN §4.5, D93): a rule name, where a rule defines it or a nonterminal
 * names it, shows the first line of the rule it refers to (the first rule of that name, D517),
 * says when the name is defined more than once (v12 draws each) and when no rule defines it; an
 * ABNF repeat shows the minimum and maximum it was read as, which the diagram does not draw
 * (D514); a keyword or operator shows the one-line doc of its notation's grammar file
 * (`generated/*.docs.ts`). Never a preview.
 */
import { LineIndex } from '@mermaid-js/core/parser-kit';
import type { DocumentView, Hover, HoverTarget, Range } from '@mermaid-js/core/parser-kit';
import type { RailroadDocument } from '../parser/ast.ts';
import { RULE_SYMBOL } from '../parser/parser.ts';
import { repeatBounds } from '../parser/convert.ts';
import { T } from '../parser/tokens.ts';
import { code, NOTATION_DOCS, notationOf, ruleFirstLine, rulesByName, span } from './tables.ts';

/** The header statement tokens: only their keyword is hovered. */
const STATEMENT_WORDS: Readonly<Record<number, string>> = {
  [T.Title]: 'title',
  [T.AccTitle]: 'accTitle',
  [T.AccDescr]: 'accDescr',
};

/** A fenced code block holding `text`, whatever backticks it has. */
function block(text: string): string {
  const runs = text.match(/`{3,}/g) ?? [];
  const fence = '`'.repeat(Math.max(2, ...runs.map((r) => r.length)) + 1);
  return `${fence}\n${text}\n${fence}`;
}

function ruleHover(name: string, doc: DocumentView<RailroadDocument>): string {
  const head = `**rule** ${code(name)}`;
  const rules = rulesByName(doc.result.ast).get(name) ?? [];
  const [first] = rules;
  if (!first) {
    return `${head}\n\nNo rule named ${code(name)} is defined: the diagram draws its box with no rule behind it.`;
  }
  const line = ruleFirstLine(doc.text, first);
  const more = first.range.end - first.range.start > line.length ? ' …' : '';
  const parts = [head, block(`${line}${more}`)];
  if (rules.length > 1) {
    const lines = new LineIndex(doc.text);
    const at = rules.map((r) => lines.position(r.range.start).line + 1);
    parts.push(
      `Defined ${rules.length} times (lines ${at.join(', ')}): v12 draws each rule, and the name refers to the first.`
    );
  }
  return parts.join('\n\n');
}

/** An ABNF repeat (`2*5`, `*`, `3`): the bounds it was read as, and what is drawn of them. */
function repeatHover(written: string): string {
  const { min, max } = repeatBounds(written);
  const head = `**repeat** ${code(written)}`;
  if (min === 0 && max === 1)
    return `${head}\n\nAt most once: drawn as optional, with a bypass above.`;
  const times = (n: number) => (n === 1 ? 'once' : `${n} times`);
  let bounds: string;
  if (min === max) bounds = `Exactly ${times(min)}.`;
  else if (max === Infinity) {
    bounds =
      min === 0
        ? 'Any number of times, or not at all.'
        : `At least ${times(min)}, with no maximum.`;
  } else bounds = `At least ${times(min)} and at most ${times(max)}.`;
  const drawn = min === 0 ? 'a loop below and a bypass above' : 'a loop below';
  return `${head}\n\n${bounds}\n\nThe diagram draws ${drawn}, with no count: it shows neither the minimum nor the maximum, as v12 did.`;
}

export function railroadHover(
  at: HoverTarget,
  doc: DocumentView<RailroadDocument>
): Hover | undefined {
  const { text } = doc;
  if (at.symbol?.kind === RULE_SYMBOL) {
    return { range: at.symbol.range, contents: ruleHover(at.symbol.name, doc) };
  }
  const t = at.token;
  if (!t) return undefined;
  const notation = notationOf(doc.result.model);
  if (notation === 'railroadAbnf' && (t.kind === T.Repeat || t.kind === T.ExactRepeat)) {
    return { range: t.range, contents: repeatHover(text.slice(t.range.start, t.range.end)) };
  }
  let range: Range = t.range;
  // A statement token holds its text too: only the keyword is hovered.
  const word = STATEMENT_WORDS[t.kind];
  if (word !== undefined) {
    const start = range.start + text.slice(range.start, range.end).indexOf(word);
    range = span(start, start + word.length);
  }
  if (at.offset < range.start || at.offset > range.end) return undefined;
  const docText = NOTATION_DOCS[notation][t.kind];
  if (docText === undefined) return undefined;
  return { range, contents: `**${code(text.slice(range.start, range.end))}**\n\n${docText}` };
}
