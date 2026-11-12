/**
 * c4-beta model builder: the AST in, a {@link C4BetaModel} out (spec #730). Elements come in
 * statement order, a parent before its children, and relations in statement order, `a <-- b`
 * already as `b → a`. What the grammar cannot check (duplicate ids, unknown relation ends,
 * fields dropped) comes with the next step.
 */
import type { C4BetaDocument, C4BetaElementNode } from './ast.ts';
import type { C4BetaElement, C4BetaKind, C4BetaModel, C4BetaDirection } from './model.ts';

type Built = Omit<C4BetaModel, 'warnings'>;

/** Build the model of `doc`. */
export function buildModel(doc: C4BetaDocument): Built {
  let kind: C4BetaKind = 'context';
  let direction: C4BetaDirection = 'TB';
  let legend = true;
  let title: string | undefined;
  let accTitle = '';
  let accDescr = '';
  const elements: C4BetaElement[] = [];
  const relations: Built['relations'][number][] = [];
  const styles: Built['styles'][number][] = [];
  const top: C4BetaElementNode[] = [];
  for (const node of doc.children) {
    if (node.type === 'Header' && node.kind) kind = node.kind;
    else if (node.type === 'Title') title = node.text;
    else if (node.type === 'AccTitle') accTitle = node.text;
    else if (node.type === 'AccDescr') accDescr = node.text;
    else if (node.type === 'Direction') direction = node.direction;
    else if (node.type === 'Legend') legend = node.on;
    else if (node.type === 'Style') {
      const entries = node.entries.map(({ key, value }) => ({ key, value }));
      styles.push({ target: node.target, entries, ast: node.id });
    } else if (node.type === 'Element') top.push(node);
    else if (node.type === 'Relation') {
      const { from, to, start, end, tags, step } = node;
      relations.push({
        from,
        to,
        start,
        end,
        description: node.description ?? '',
        technology: node.technology ?? '',
        ...(step === undefined ? {} : { step }),
        tags,
        ast: node.id,
      });
    }
  }
  // A stack, not recursion: a body may nest as deep as the text goes.
  const work = top.map((node) => ({ node, parent: undefined as string | undefined })).reverse();
  for (let item = work.pop(); item; item = work.pop()) {
    const { node, parent } = item;
    elements.push({
      id: node.name,
      kind: node.kind,
      name: node.label,
      description: node.description ?? '',
      technology: node.technology ?? '',
      ...(node.instances === undefined ? {} : { instances: node.instances }),
      tags: node.tags,
      ...(parent === undefined ? {} : { parent }),
      boundary: node.children.length > 0 || node.kind === 'group' || node.kind === 'deploymentNode',
      ast: node.id,
    });
    for (let k = node.children.length - 1; k >= 0; k--) {
      const child = node.children[k];
      if (child) work.push({ node: child, parent: node.name });
    }
  }
  return {
    kind,
    direction,
    legend,
    ...(title === undefined ? {} : { title }),
    accTitle,
    accDescr,
    elements,
    relations,
    styles,
  };
}
