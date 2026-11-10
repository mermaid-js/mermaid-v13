/**
 * Block hover (DESIGN §4.5, D93, spec #521 "Language facet"): keywords, links and directions
 * their one-line doc from the grammar file (`generated/docs.ts`); a block (its id, its shape or
 * its label) its shape, label, span, columns and what holds it; an anonymous composite's
 * `block` the same after its doc; a class its styles and use. Never a preview.
 */
import { Kind } from '@mermaid-js/core/parser-kit';
import type {
  DocumentView,
  Hover,
  HoverTarget,
  Range,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import { blockDocs } from '../generated/docs.ts';
import { isComposite, type Block, type BlockModel } from '../model.ts';
import type { BlockDocument, BlockStatementNode } from '../parser/ast.ts';
import { T } from '../parser/tokens.ts';
import { TYPE_NAMES } from './tables.ts';
import { code, plural, span, tokenAt } from './text.ts';

/** The tokens of a block's shape or block arrow, after its id up to its closer. */
const SHAPE_PARTS = new Set<number>([
  T.NodeDStart,
  T.BlockArrowStart,
  T.StringStart,
  T.Str,
  T.StringEnd,
  T.MdStringStart,
  T.MdStr,
  T.MdStringEnd,
  T.ArrowDirStart,
  T.Dir,
  T.NodeDEnd,
  T.BlockArrowEnd,
]);
const OPENERS = new Set<number>([T.NodeDStart, T.BlockArrowStart]);
const CLOSERS = new Set<number>([T.NodeDEnd, T.BlockArrowEnd]);

interface Found {
  block: Block;
  parent?: Block;
}

/** One line of a label, cut at 40 characters. */
function short(text: string): string {
  const t = text.trim();
  const line = /^[^\n\r]*/.exec(t)?.[0] ?? '';
  return line.length > 40 || line.length < t.length ? `${line.slice(0, 40)}…` : line;
}

/** The first block of `model` (pre-order) that `match` takes, with the composite holding it. */
function findBlock(model: BlockModel, match: (b: Block) => boolean): Found | undefined {
  const walk = (blocks: readonly Block[], parent?: Block): Found | undefined => {
    for (const block of blocks) {
      if (match(block)) return parent ? { block, parent } : { block };
      const inner = walk(block.children, block);
      if (inner) return inner;
    }
    return undefined;
  };
  return walk(model.blocks);
}

function blockFacts({ block, parent }: Found): string[] {
  const facts = [`Shape: ${TYPE_NAMES[block.type]}`];
  if (block.label !== '' && block.label !== block.id)
    facts.push(`Label: ${code(short(block.label))}`);
  if (block.directions && block.directions.length > 0)
    facts.push(`Points: ${block.directions.join(', ')}`);
  facts.push(`Span: ${plural(block.span, 'column')}`);
  if (isComposite(block)) {
    const columns = block.columns === undefined || block.columns < 0 ? 'auto' : `${block.columns}`;
    facts.push(`Columns: ${columns}`, `Holds ${plural(block.children.length, 'block')}`);
  }
  if (parent) facts.push(`In ${parent.anonymous ? 'a composite' : code(parent.id)}`);
  if (block.classes.length > 0) facts.push(`Classes: ${block.classes.map(code).join(', ')}`);
  return facts;
}

function blockText(model: BlockModel, name: string): string | undefined {
  const found = findBlock(model, (b) => b.id === name);
  if (!found) return undefined;
  return [`**block** ${code(name)}`, ...blockFacts(found)].join('\n\n');
}

function classText(model: BlockModel, name: string): string {
  const def = model.classDefs.find((c) => c.id === name);
  let users = 0;
  const walk = (blocks: readonly Block[]) => {
    for (const b of blocks) {
      if (b.classes.some((c) => c.split(/\s+/).includes(name))) users++;
      walk(b.children);
    }
  };
  walk(model.blocks);
  const styles = def ? `Styles: ${code(def.styles.join(','))}` : 'No `classDef` defines it';
  return [`**class** ${code(name)}`, styles, `Used by ${plural(users, 'block')}`].join('\n\n');
}

/** `r` without the blanks and line breaks at its ends (`end` and links take those after them). */
function tight(text: string, r: Range): Range {
  let { start, end } = r;
  while (end > start && /\s/.test(text.charAt(end - 1))) end--;
  while (start < end && /\s/.test(text.charAt(start))) start++;
  return span(start, end);
}

/**
 * The block whose shape holds token `j`: its id token's range and the end of the shape's last
 * token. The shape's tokens follow the id right after it, opener first.
 */
function shapeOwner(tokens: TokenStream, j: number): { id: Range; end: number } | undefined {
  let i = j;
  while (i > 0 && SHAPE_PARTS.has(tokens.kind[i] ?? Kind.EOF)) i--;
  if (tokens.kind[i] !== T.NodeId || !OPENERS.has(tokens.kind[i + 1] ?? Kind.EOF)) return undefined;
  let last = j;
  while (
    !CLOSERS.has(tokens.kind[last] ?? Kind.EOF) &&
    SHAPE_PARTS.has(tokens.kind[last + 1] ?? Kind.EOF)
  )
    last++;
  return { id: span(tokens.start[i] ?? 0, tokens.end[i] ?? 0), end: tokens.end[last] ?? 0 };
}

/** The AST id of the anonymous composite whose `block` starts at `start`. */
function compositeAt(nodes: readonly BlockStatementNode[], start: number): string | undefined {
  for (const n of nodes) {
    if (n.type !== 'Composite') continue;
    if (n.range.start === start && n.name === undefined) return n.id;
    if (n.range.start <= start && start < n.range.end) return compositeAt(n.children, start);
  }
  return undefined;
}

export function blockHover(at: HoverTarget, doc: DocumentView<BlockDocument>): Hover | undefined {
  const { result, text } = doc;
  const model = result.model as BlockModel;
  const s = at.symbol;
  if (s?.kind === 'block') {
    const contents = blockText(model, s.name);
    return contents === undefined ? undefined : { range: s.range, contents };
  }
  if (s?.kind === 'class') return { range: s.range, contents: classText(model, s.name) };
  const t = at.token;
  const tokens = result.tokens;
  if (!t || !tokens) return undefined;
  const range = tight(text, t.range);
  const { start, end } = range;
  if (t.kind === T.Block) {
    const keyword = `**${code(text.slice(start, end))}**`;
    const header = result.statements.some((x) => x.kind === 'header' && x.range.start === start);
    if (header) return { range, contents: `${keyword}\n\n${blockDocs[T.Block] ?? ''}` };
    const ast = compositeAt(result.ast.children, start);
    const found = ast === undefined ? undefined : findBlock(model, (b) => b.ast === ast);
    const facts = found ? blockFacts(found) : [];
    const contents = [keyword, blockDocs[T.IdBlock] ?? '', ...facts].join('\n\n');
    return { range, contents };
  }
  const docText = blockDocs[t.kind];
  if (docText !== undefined) {
    const word = text.slice(start, end).replace(/^,\s*/, '');
    return { range, contents: `**${code(word)}**\n\n${docText}` };
  }
  if (!SHAPE_PARTS.has(t.kind)) return undefined;
  const j = tokenAt(tokens, t.range.start);
  const owner = j < 0 ? undefined : shapeOwner(tokens, j);
  if (!owner) return undefined;
  const contents = blockText(model, text.slice(owner.id.start, owner.id.end));
  if (contents === undefined) return undefined;
  return { range: tight(text, span(owner.id.start, owner.end)), contents };
}
