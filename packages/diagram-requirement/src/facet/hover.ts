/**
 * Requirement hover (DESIGN §4.5, D93): a name shows its box's kind, its fields as the model
 * holds them (the first definition's), its relation count and classes; a class its `classDef`
 * styles and how many boxes use it; a relationship keyword what the relation it is in says; any
 * other keyword the one-line doc of the grammar file (`generated/docs.ts`).
 */
import type {
  DocumentView,
  Hover,
  HoverTarget,
  Range,
  SymbolOccurrence,
} from '@mermaid-js/core/parser-kit';
import { requirementDocs } from '../generated/docs.ts';
import type { BoxOf, RequirementModel } from '../model.ts';
import { boxesByName, boxNamed } from '../parser/boxes.ts';
import type { RelationNode, RequirementDocument } from '../parser/ast.ts';
import { T } from '../parser/tokens.ts';
import { RELATIONSHIPS, code, plural, span, spelling } from './tables.ts';
import { trimmed } from '@mermaid-js/shared/parser/facet';

const fieldList = (fields: readonly (readonly [key: string, value: string])[]): string => {
  const set = fields.filter(([, v]) => v !== '');
  return set.length === 0 ? 'No fields.' : set.map(([k, v]) => `${k}: ${code(v)}`).join(' · ');
};

/** The box `name` denotes: the requirement first (v12), the element for an element's own name. */
function findBox(name: string, kind: string, model: RequirementModel): BoxOf | undefined {
  const byName = boxesByName(model);
  const own = kind === 'element' ? byName.elements.get(name) : undefined;
  return own ? { is: 'element', box: own } : boxNamed(name, byName);
}

function boxHover(name: string, kind: string, model: RequirementModel): string | undefined {
  const found = findBox(name, kind, model);
  if (!found) return undefined;
  const parts =
    found.is === 'requirement'
      ? [
          `**${found.box.kind}** ${code(name)}`,
          fieldList([
            [spelling(T.Id), found.box.requirementId],
            [spelling(T.Text), found.box.text],
            [spelling(T.Risk), found.box.risk],
            [spelling(T.VerifyMethod), found.box.verifyMethod],
          ]),
        ]
      : [
          `**Element** ${code(name)}`,
          fieldList([
            [spelling(T.Type), found.box.type],
            [spelling(T.DocRef), found.box.docRef],
          ]),
        ];
  // By resolved end, not name: an element sharing a requirement's name has none of its relations.
  const { ast } = found.box;
  const relations = model.relations.filter((r) => r.from === ast || r.to === ast).length;
  const facts = [plural(relations, 'relation')];
  const classes = [...new Set(found.box.classes.filter((c) => c !== 'default'))];
  if (classes.length > 0) {
    facts.push(`${classes.length === 1 ? 'Class' : 'Classes'}: ${classes.map(code).join(', ')}`);
  }
  parts.push(facts.join(' · '));
  return parts.join('\n\n');
}

function classHover(name: string, model: RequirementModel): string {
  const c = model.classes.find((x) => x.name === name);
  let styles = 'No `classDef` defines it.';
  if (c !== undefined) {
    styles =
      c.styles.length === 0
        ? 'Its `classDef` sets no styles.'
        : code(`classDef ${name} ${c.styles.join(',')}`);
  }
  const boxes = [...model.requirements, ...model.elements];
  const used =
    name === 'default'
      ? 'Applies to every box.'
      : `Used by ${plural(boxes.filter((b) => b.classes.includes(name)).length, 'box', 'boxes')}`;
  return `**class** ${code(name)}\n\n${styles}\n\n${used}`;
}

function symbolHover(s: SymbolOccurrence, model: RequirementModel): string | undefined {
  return s.kind === 'class' ? classHover(s.name, model) : boxHover(s.name, s.kind, model);
}

const relationAt = (doc: RequirementDocument, at: number): RelationNode | undefined =>
  doc.children.find(
    (c): c is RelationNode => c.type === 'Relation' && c.range.start <= at && at <= c.range.end
  );

export function requirementHover(
  at: HoverTarget,
  doc: DocumentView<RequirementDocument>
): Hover | undefined {
  const { text, result } = doc;
  const model = result.model as RequirementModel;
  if (at.symbol) {
    const contents = symbolHover(at.symbol, model);
    if (contents !== undefined) return { range: at.symbol.range, contents };
  }
  const t = at.token;
  if (!t) return undefined;
  const range = trimmed(text, t.range);
  if (at.offset < range.start || at.offset > range.end || range.start === range.end) {
    return undefined;
  }
  const docText = requirementDocs[t.kind];
  if (docText === undefined) return undefined;
  const word = text.slice(range.start, range.end);
  const rel = RELATIONSHIPS.find((r) => r.kind === t.kind);
  if (rel) {
    const node = relationAt(result.ast, at.offset);
    const what = node
      ? `${code(node.src.text)} ${rel.label} ${code(node.dst.text)}`
      : (rel.detail ?? '');
    return { range, contents: `**${code(word)}** ${what}\n\n${docText}` };
  }
  return { range, contents: `**${code(word)}**\n\n${docText}` };
}
