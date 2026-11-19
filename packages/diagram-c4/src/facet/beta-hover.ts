/**
 * c4-beta hover (DESIGN §4.5, D93, spec #730 T6): an element id, at its declaration or in a
 * relation, shows what the element is (its kind, name, description, technology, tags and parent);
 * a tag what it styles; the target and the keys of a `style` what they set; a diagram kind, an
 * element kind and every other keyword the one-line doc of the grammar file
 * (`generated/c4beta.docs.ts`). Names, labels and the text of statements have none. Never a
 * preview.
 */
import type { DocumentView, Hover, HoverTarget, Range } from '@mermaid-js/core/parser-kit';
import { code, inside, plural, span } from '@mermaid-js/shared/parser/facet';
import type { C4BetaDocument, C4BetaStyleNode } from '../beta/ast.ts';
import type { C4BetaElement, C4BetaModel } from '../beta/model.ts';
import { VALUE_WORDS } from '../beta/probe.ts';
import { ID_KINDS, T } from '../beta/tokens.ts';
import { c4betaDocs } from '../generated/c4beta.docs.ts';
import { short } from './hover.ts';
import { DIAGRAM_KIND_DOCS, ELEMENT_INFO, STYLE_KEY_DOCS } from './beta-tables.ts';

const lineOf = (text: string, at: number) => text.slice(0, at).split(/\r\n|\r|\n/).length;

function elementFacts(model: C4BetaModel, e: C4BetaElement): string {
  const facts = [`**${e.kind}** ${code(e.id)}`, `Name: ${code(short(e.name))}`];
  if (e.description !== '') facts.push(`Description: ${code(short(e.description))}`);
  if (e.technology !== '') facts.push(`Technology: ${code(short(e.technology))}`);
  if (e.tags.length > 0) facts.push(`Tags: ${e.tags.map((t) => code(`:::${t}`)).join(' ')}`);
  if (e.parent !== undefined) facts.push(`In ${code(e.parent)}`);
  const held = model.elements.filter((x) => x.parent === e.id).length;
  if (e.boundary) facts.push(`Holds ${plural(held, 'element')}`);
  const out = model.relations.filter((r) => r.from === e.id).length;
  const into = model.relations.filter((r) => r.to === e.id).length;
  facts.push(`${plural(out, 'relation')} out, ${into} in`);
  return facts.join('\n\n');
}

function idHover(doc: DocumentView<C4BetaDocument>, range: Range, id: string): Hover {
  const model = doc.result.model as C4BetaModel;
  const element = model.elements.find((e) => e.id === id);
  const contents = element ? elementFacts(model, element) : `No element has the id ${code(id)}.`;
  return { range, contents };
}

/** What a tag, or an element kind, a `style` or a `:::` names styles: how many, and where. */
function tagFacts(doc: DocumentView<C4BetaDocument>, name: string, kind: boolean): string {
  const model = doc.result.model as C4BetaModel;
  const elements = model.elements.filter((e) => (kind ? e.kind === name : e.tags.includes(name)));
  const relations = kind ? [] : model.relations.filter((r) => r.tags.includes(name));
  const parts = [plural(elements.length, 'element')];
  if (!kind) parts.push(plural(relations.length, 'relation'));
  const styles = doc.result.ast.children.filter(
    (n): n is C4BetaStyleNode => n.type === 'Style' && n.target === name
  );
  const styled = styles.map((s) => `line ${lineOf(doc.text, s.range.start)}`);
  const lines = [`${kind ? `Every ${code(name)}` : `The tag ${code(name)}`}: ${parts.join(', ')}.`];
  lines.push(
    styled.length > 0
      ? `Styled by ${code(`style ${name}`)} at ${styled.join(', ')}.`
      : `No ${code(`style ${name}`)} statement styles it.`
  );
  return lines.join('\n\n');
}

/** The `style` statement holding `offset`, and what the token at it is in it. */
function styleHover(
  doc: DocumentView<C4BetaDocument>,
  at: HoverTarget,
  { kind, range }: { kind: number; range: Range }
): Hover | undefined {
  if (ID_KINDS[kind] !== 1) return undefined;
  const node = doc.result.ast.children.find(
    (n): n is C4BetaStyleNode => n.type === 'Style' && inside(at.offset, n.range)
  );
  const first = node?.entries[0];
  if (!node || !first) return undefined;
  const word = doc.text.slice(range.start, range.end);
  if (range.start < first.range.start) {
    const ofKind = ELEMENT_INFO.some((i) => i.kind === node.target);
    return { range, contents: `**${code(word)}**\n\n${tagFacts(doc, node.target, ofKind)}` };
  }
  const entry = node.entries.find((e) => e.range.start === range.start && e.key === word);
  const keyDoc = entry && STYLE_KEY_DOCS[entry.key];
  return keyDoc === undefined ? undefined : { range, contents: `**${code(word)}**\n\n${keyDoc}` };
}

/** The range of the keyword a token is: only the keyword of a statement that holds its text. */
function keywordRange(text: string, t: { kind: number; range: Range }): Range {
  const word = VALUE_WORDS[t.kind];
  if (word === undefined) return t.range;
  const blanks = /^[\t ]*/.exec(text.slice(t.range.start, t.range.end))?.[0].length ?? 0;
  return span(t.range.start + blanks, t.range.start + blanks + word.length);
}

/** The doc of a keyword: a diagram kind after the header, an element kind, or the grammar's. */
function keywordDoc(doc: DocumentView<C4BetaDocument>, kind: number, range: Range) {
  const header = doc.result.ast.children.find((n) => n.type === 'Header');
  const afterHeader =
    header !== undefined && kind !== T.Header && inside(range.start, header.range);
  const written = doc.text.slice(range.start, range.end);
  if (afterHeader && DIAGRAM_KIND_DOCS[written] !== undefined) return DIAGRAM_KIND_DOCS[written];
  return ELEMENT_INFO.find((i) => i.token === kind)?.doc ?? c4betaDocs[kind];
}

/** The keyword the token is, with the doc it has. */
function keywordHover(doc: DocumentView<C4BetaDocument>, at: HoverTarget): Hover | undefined {
  const t = at.token;
  if (!t) return undefined;
  const range = keywordRange(doc.text, t);
  const docText = inside(at.offset, range) ? keywordDoc(doc, t.kind, range) : undefined;
  if (docText === undefined) return undefined;
  return { range, contents: `**${code(doc.text.slice(range.start, range.end))}**\n\n${docText}` };
}

export function c4betaHover(at: HoverTarget, doc: DocumentView<C4BetaDocument>): Hover | undefined {
  const { symbol, token } = at;
  if (symbol?.kind === 'element' && inside(at.offset, symbol.range))
    return idHover(doc, symbol.range, symbol.name);
  if (token?.kind === T.Tag) {
    const name = doc.text.slice(token.range.start + 3, token.range.end);
    return {
      range: token.range,
      contents: `**${code(`:::${name}`)}**\n\n${tagFacts(doc, name, false)}`,
    };
  }
  return (token && styleHover(doc, at, token)) ?? keywordHover(doc, at);
}
