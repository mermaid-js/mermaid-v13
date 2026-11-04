// A `mermaid` API object that renders ER before the registry lists it (#133; T5 adds the
// manifest). It is the public `createMermaid` with the generated first-party table, the `er`
// row given the plugin, so tests go through the same `render()` path as every other type.
// Once `gen:registry` lists ER, `createMermaid()` from `mermaid` replaces this.
import { er } from '@mermaid-js/diagram-er';
// eslint-disable-next-line mermaid/import-boundaries -- until T5 (#134) lists ER in the generated registry, no public entry builds an API object that renders it
import { createMermaid } from '../../../mermaid/src/api.ts';
// eslint-disable-next-line mermaid/import-boundaries -- the same first-party table `mermaid` uses, with the ER row loadable
import { FIRST_PARTY } from '../../../mermaid/src/generated/registry.gen.ts';

/** A fresh API object with `deterministic: true` (table measurer) that renders ER. */
export function erMermaid(): ReturnType<typeof createMermaid> {
  const m = createMermaid(
    FIRST_PARTY.map((row) =>
      row.type === 'er' && row.load === undefined
        ? { ...row, id: 'er', formats: ['svg'], load: () => Promise.resolve(er) }
        : row
    )
  );
  m.initialize({ deterministic: true });
  return m;
}
