/**
 * Shapes of the generated key tree (`generated/keys.ts`).
 */

/**
 * One schema key: `0` a known leaf, `'open'` an object whose own keys are free
 * (`themeVariables`, dictionaries), `'removed'`/`'moved'` per its `x-mermaid` status,
 * or the tree of a known object's keys.
 */
export type KeyTree = 0 | 'open' | 'removed' | 'moved' | { readonly [key: string]: KeyTree };

/** The `x-mermaid` annotation of a removed or moved key. */
export interface KeyNote {
  readonly status: 'removed' | 'moved';
  readonly since?: string;
  readonly movedTo?: string;
  readonly replacement?: string;
  readonly reason?: string;
}
