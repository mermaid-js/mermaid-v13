/**
 * Class hover (DESIGN §4.5, D93): a class name shows its label, generic type, annotations,
 * style classes, member counts, namespace and relationship count; an interface the classes
 * its lollipops attach to; a namespace its label and contents; a style class its `classDef`
 * styles and users; an arrow what it draws; a keyword the one-line doc of the grammar file
 * (`generated/docs.ts`). Never a preview.
 */
import type {
  DocumentView,
  Hover,
  HoverTarget,
  Range,
  SymbolOccurrence,
} from '@mermaid-js/core/parser-kit';
import { classDocs } from '../generated/docs.ts';
import type { ClassDocument, ClassRelationStmt, ClassStatementNode } from '../parser/ast.ts';
import type { ClassModel } from '../parser/model.ts';
import { DIRECTIONS as DIRECTION_OF } from '../parser/tables.ts';
import { T } from '../parser/tokens.ts';
import { ARROW_PARTS, code, DIRECTIONS, describeRelation, plural, span } from './tables.ts';

/** Every relationship statement of the AST, namespaces included. */
function* relations(children: readonly ClassStatementNode[]): Generator<ClassRelationStmt> {
  for (const c of children) {
    if (c.type === 'Relation') yield c;
    else if (c.type === 'Namespace') yield* relations(c.children as ClassStatementNode[]);
  }
}

function classNodeHover(name: string, model: ClassModel): string | undefined {
  const c = model.classes.find((x) => x.id === name);
  if (!c) return undefined;
  const facts: string[] = [];
  if (c.label !== c.id) facts.push(`Label: ${code(c.label)}`);
  if (c.type !== '') facts.push(`Generic: ${code(`~${c.type}~`)}`);
  if (c.annotations.length > 0) {
    facts.push(`Annotations: ${c.annotations.map((a) => code(`<<${a}>>`)).join(', ')}`);
  }
  const styles = c.classes.filter((x) => x !== 'default');
  if (styles.length > 0) {
    facts.push(
      `${styles.length === 1 ? 'Style class' : 'Style classes'}: ${styles.map(code).join(', ')}`
    );
  }
  if (c.parent !== undefined) facts.push(`In namespace ${code(c.parent)}`);
  const members = `${plural(c.attributes.length, 'attribute')}, ${plural(c.methods.length, 'method')}`;
  const rels = model.relations.filter((r) => r.start.id === name || r.end.id === name).length;
  const lines = [`**class** ${code(name)}`];
  if (facts.length > 0) lines.push(facts.join(' · '));
  lines.push(`${members} · ${plural(rels, 'relationship')}`);
  return lines.join('\n\n');
}

function interfaceHover(name: string, model: ClassModel): string | undefined {
  const on = [...new Set(model.interfaces.filter((i) => i.label === name).map((i) => i.classId))];
  if (on.length === 0) return undefined;
  return `**interface** ${code(name)}\n\nLollipop on ${on.map(code).join(', ')}`;
}

function namespaceHover(name: string, model: ClassModel): string | undefined {
  const n = model.namespaces.find((x) => x.id === name);
  if (!n) return undefined;
  const facts = [plural(n.classes.length, 'class', 'classes')];
  if (n.children.length > 0) facts.push(plural(n.children.length, 'namespace'));
  if (n.notes.length > 0) facts.push(plural(n.notes.length, 'note'));
  const label = n.label === name ? '' : `Label: ${code(n.label)} · `;
  const parent = n.parent === undefined ? '' : `\n\nIn namespace ${code(n.parent)}`;
  return `**namespace** ${code(name)}\n\n${label}${facts.join(', ')}${parent}`;
}

function styleClassHover(name: string, model: ClassModel): string {
  const c = model.styleClasses.find((x) => x.id === name);
  const users = model.classes.filter((x) => x.classes.includes(name)).length;
  const used =
    name === 'default' ? 'Applies to every class.' : `Used by ${plural(users, 'class', 'classes')}`;
  let styles = 'No `classDef` defines it.';
  if (c !== undefined) {
    styles =
      c.styles.length === 0
        ? 'Its `classDef` sets no styles.'
        : code(`classDef ${name} ${c.styles.join(',')}`);
  }
  return `**style class** ${code(name)}\n\n${styles}\n\n${used}`;
}

function symbolHover(s: SymbolOccurrence, model: ClassModel): string | undefined {
  switch (s.kind) {
    case 'class':
      return classNodeHover(s.name, model);
    case 'interface':
      return interfaceHover(s.name, model);
    case 'namespace':
      return namespaceHover(s.name, model);
    case 'cssClass':
      return styleClassHover(s.name, model);
    default:
      return undefined;
  }
}

/**
 * The namespace whose header line holds `at` (`namespace A.B {`): dotted ids have no symbol
 * the service keeps (see `language.ts`), so hover finds them in the AST.
 */
function namespaceAt(
  text: string,
  at: number,
  children: readonly ClassStatementNode[]
): string | undefined {
  for (const c of children) {
    if (c.type !== 'Namespace' || at < c.range.start || at > c.range.end) continue;
    const inner = namespaceAt(text, at, c.children as ClassStatementNode[]);
    if (inner !== undefined) return inner;
    const header = text.slice(c.range.start, at);
    return /[\r\n{]/.test(header) ? undefined : c.name;
  }
  return undefined;
}

/** Kinds a namespace name is lexed into. */
const NAME_KINDS = new Set<number>([T.Alpha, T.Num, T.Minus, T.UnicodeText, T.Dot]);

/** A range without its leading and trailing blanks. */
function trimmed(text: string, r: Range): Range {
  let { start, end } = r;
  while (start < end && /\s/.test(text[start]!)) start++;
  while (end > start && /\s/.test(text[end - 1]!)) end--;
  return span(start, end);
}

/** The relationship whose arrow holds `at`, as the model records it. */
function arrowHover(
  text: string,
  at: number,
  model: ClassModel,
  ast: ClassDocument
): Hover | undefined {
  for (const r of relations(ast.children)) {
    const range = trimmed(text, r.arrowRange);
    if (at < range.start || at > range.end) continue;
    const rel = model.relations.find((x) => x.ast === r.id);
    if (!rel) return undefined;
    const what = describeRelation(rel.start.type, rel.line, rel.end.type);
    const arrow = text.slice(range.start, range.end);
    // A lollipop end is an interface node: shown by the name written for it.
    const label = (id: string) => model.interfaces.find((i) => i.id === id)?.label ?? id;
    const ends = `${code(label(rel.start.id))} → ${code(label(rel.end.id))}`;
    return {
      range,
      contents: `**${code(arrow)}** ${what}\n\n${ends}\n\n${classDocs[T.Line] ?? ''}`.trimEnd(),
    };
  }
  return undefined;
}

export function classHover(at: HoverTarget, doc: DocumentView<ClassDocument>): Hover | undefined {
  const { text, result } = doc;
  const model = result.model as ClassModel | undefined;
  if (!model) return undefined;
  if (at.symbol) {
    const contents = symbolHover(at.symbol, model);
    if (contents !== undefined) return { range: at.symbol.range, contents };
  }
  const t = at.token;
  if (!t) return undefined;
  // Arrow head tokens take the blanks before them: only their text counts.
  const range = trimmed(text, t.range);
  if (at.offset < range.start || at.offset > range.end || range.start === range.end) {
    return undefined;
  }
  if (ARROW_PARTS.has(t.kind)) return arrowHover(text, at.offset, model, result.ast);
  if (NAME_KINDS.has(t.kind)) {
    const ns = namespaceAt(text, at.offset, result.ast.children);
    const contents = ns === undefined ? undefined : namespaceHover(ns, model);
    return contents === undefined ? undefined : { range, contents };
  }
  const word = text.slice(range.start, range.end);
  const dir = DIRECTION_OF[t.kind];
  if (dir !== undefined) {
    const meaning = DIRECTIONS.find(([d]) => d === dir)?.[1] ?? dir;
    return { range, contents: `**${code(word)}** direction: ${meaning}` };
  }
  const docText = classDocs[t.kind];
  if (docText === undefined) return undefined;
  return { range, contents: `**${code(word)}**\n\n${docText}` };
}
