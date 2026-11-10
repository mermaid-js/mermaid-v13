/**
 * The requirement symbols (D437): the parser records each name and class name as it reads it
 * ({@link Occurrence}); {@link symbolsOf} settles kinds and roles once the model is built.
 */
import type { Range, SymbolOccurrence } from '@mermaid-js/core/parser-kit';
import { boxesByName, boxNamed } from '../model.ts';
import type { BoxKind, RequirementModel } from '../model.ts';

/**
 * A name or class name as read: a box's own name (`requirement`, `element`), a name a statement
 * refers to (`name`), a class name a `classDef` defines (`classDef`) or one it applies (`class`).
 */
export interface Occurrence {
  as: BoxKind | 'name' | 'classDef' | 'class';
  name: string;
  range: Range;
}

/**
 * The symbols, in source order: the first box of a name defines it (a later box of that name,
 * which the model drops, refers to it) and a relation end or a `style`, `class` or `:::` target
 * refers to it, as a `requirement` when the model has a requirement of that name (the model's
 * own order), else as an `element` when it has an element; the first `classDef` of a class name
 * defines it, and the rest and every class use refer to it. The class `default`, which every box
 * has (v12), is no symbol: renaming it would restyle them.
 */
export function symbolsOf(
  occurrences: readonly Occurrence[],
  model: Pick<RequirementModel, 'requirements' | 'elements'>
): SymbolOccurrence[] {
  const byName = boxesByName(model);
  const boxes = new Set<string>();
  const classes = new Set<string>();
  const out: SymbolOccurrence[] = [];
  const sorted = [...occurrences].sort((a, b) => a.range.start - b.range.start);
  for (const o of sorted) {
    let kind: string;
    let role: 'def' | 'ref' = 'ref';
    if (o.as === 'name') {
      kind = boxNamed(o.name, byName)?.is ?? 'requirement';
    } else if (o.as === 'requirement' || o.as === 'element') {
      kind = o.as;
      if (!boxes.has(o.name)) role = 'def';
      boxes.add(o.name);
    } else {
      if (o.name === 'default') continue;
      kind = 'class';
      if (o.as === 'classDef' && !classes.has(o.name)) role = 'def';
      if (o.as === 'classDef') classes.add(o.name);
    }
    out.push({ name: o.name, kind, range: o.range, role });
  }
  return out;
}
