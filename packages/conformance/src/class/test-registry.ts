/**
 * A test registry for the class plugin until its manifest is in the generated first-party
 * table (#157). A spec mocks `mermaid`'s generated registry (`registry.gen.ts`) with
 * `withClass` of the original module (see `class-render.spec.ts`), so `createMermaid()` from `mermaid` detects `classDiagram` (v12 order) and loads the plugin
 * as T5 will. Once the generated row has a loader the rows pass through unchanged.
 */
import { classDiagram } from '@mermaid-js/diagram-class';

interface Row {
  readonly type: string;
  readonly id?: string;
  readonly formats?: readonly string[];
  readonly load?: () => Promise<unknown>;
}

export function withClass<M extends { FIRST_PARTY: readonly Row[] }>(mod: M): M {
  return {
    ...mod,
    FIRST_PARTY: mod.FIRST_PARTY.map((e) =>
      e.type === 'classDiagram' && e.load === undefined
        ? { ...e, id: 'class', formats: ['svg'], load: () => Promise.resolve(classDiagram) }
        : e
    ),
  };
}
