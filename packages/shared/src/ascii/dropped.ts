// The `ASCII_DROPPED` collector (D82, R-ASCII-5) that a diagram's `asciiWarnings` fills: the
// diagram probes its own features, and the statements behind each kind are added from the AST.
import { asciiDropped, statements } from './diagram.ts';

/** What {@link droppedFeatures} collects into. */
export interface DroppedFeatures<F extends string> {
  /** Text output drops `feature`; `id`, when given, is the AST id of what uses it. */
  readonly add: (feature: F, id?: string) => void;
  /**
   * One `ASCII_DROPPED` warning per kind found, in the order of the `what` table, with the
   * ids of `ast`'s statements of that kind after the ids added. A statement alone is enough:
   * a `classDef` nothing uses still has no text form. `keys` names what a kind dropped.
   */
  warnings(
    ast: Parameters<typeof statements>[0],
    keys?: Readonly<Partial<Record<F, string>>>
  ): ReturnType<typeof asciiDropped<F>>[];
}

/**
 * A collector of the features one drawing uses that text output drops. `what` says what each
 * kind is, as its warning names it; `statementKinds` the AST node types behind each kind.
 */
export function droppedFeatures<F extends string>(
  what: Readonly<Record<F, string>>,
  statementKinds: Readonly<Partial<Record<F, readonly string[]>>>
): DroppedFeatures<F> {
  const found = new Map<F, Set<string>>();
  const add = (feature: F, id?: string): void => {
    let ids = found.get(feature);
    if (!ids) found.set(feature, (ids = new Set()));
    if (id) ids.add(id);
  };
  return {
    add,
    warnings(ast, keys) {
      const stmts = new Map<string, string[]>();
      statements(ast, stmts);
      const out: ReturnType<typeof asciiDropped<F>>[] = [];
      for (const feature of Object.keys(what) as F[]) {
        for (const kind of statementKinds[feature] ?? [])
          for (const id of stmts.get(kind) ?? []) add(feature, id);
        const ids = found.get(feature);
        if (ids) out.push(asciiDropped(feature, [...ids], what[feature], keys?.[feature]));
      }
      return out;
    },
  };
}
