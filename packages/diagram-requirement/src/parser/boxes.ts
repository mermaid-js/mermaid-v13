/**
 * The one requirement-first lookup (D434, v12's order): relation ends, `style`, `class`, the
 * symbols and hover all reach a box of a name through {@link boxNamed}. Here, not in
 * `model.ts`, which stays type-only so the language bundle never reaches it.
 */
import type { BoxesByName, BoxOf, RequirementModel } from '../model.ts';

/** The model's boxes by name, for {@link boxNamed}. */
export function boxesByName(
  model: Pick<RequirementModel, 'requirements' | 'elements'>
): BoxesByName {
  return {
    requirements: new Map(model.requirements.map((r) => [r.name, r])),
    elements: new Map(model.elements.map((e) => [e.name, e])),
  };
}

/**
 * The box `name` reaches: the requirement of that name, else the element (v12's order, D434).
 * The one lookup of relation ends, `style`, `class`, symbols and hover.
 */
export function boxNamed<R, E>(name: string, boxes: BoxesByName<R, E>): BoxOf<R, E> | undefined {
  const r = boxes.requirements.get(name);
  if (r !== undefined) return { is: 'requirement', box: r };
  const e = boxes.elements.get(name);
  return e === undefined ? undefined : { is: 'element', box: e };
}
