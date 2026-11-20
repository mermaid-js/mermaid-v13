// Flowchart's `@{ shape }` names: v12's, shared with agentflow (`@mermaid-js/shared/parser/flow`).
import { FLOW_SHAPE_NAMES, isValidShape } from '@mermaid-js/shared/parser/flow';

export { isValidShape, SHAPE_GROUPS } from '@mermaid-js/shared/parser/flow';

/** Every name `@{ shape: name }` accepts, aliases included (tests draw each one). */
export const shapeNames = (): string[] => FLOW_SHAPE_NAMES.filter(acceptedShape);

/**
 * Whether `@{ shape: name }` is accepted as written: a name v12 knows, lowercase, without `_`
 * (the model reports `UNKNOWN_SHAPE` for the others).
 */
export function acceptedShape(name: string): boolean {
  return isValidShape(name) && name === name.toLowerCase() && !name.includes('_');
}
