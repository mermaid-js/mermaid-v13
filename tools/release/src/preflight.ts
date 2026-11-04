/**
 * What a manual alpha release would do, read-only (v13/docs/RELEASING.md): the packages the
 * pending changesets bump (from `changeset status --output`), and the versions already bumped
 * but not yet on the registry (a release that stopped half way).
 */

/** The part of `changeset status --output` the plan reads. */
export interface ChangesetStatus {
  releases: {
    name: string;
    type: string;
    oldVersion: string;
    newVersion: string;
    changesets: string[];
  }[];
}

export interface PlannedRelease {
  name: string;
  from: string;
  to: string;
  /** Changeset ids naming this package; empty when it is bumped only as a dependent. */
  changesets: string[];
}

/** The published packages `changeset version` would bump; private and no-op entries dropped. */
export function releasePlan(
  status: ChangesetStatus,
  published: readonly string[]
): PlannedRelease[] {
  const names = new Set(published);
  return status.releases
    .filter((r) => names.has(r.name) && r.oldVersion !== r.newVersion)
    .map((r) => ({ name: r.name, from: r.oldVersion, to: r.newVersion, changesets: r.changesets }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type NextStep = 'version' | 'publish' | 'version-then-publish' | 'nothing';

/**
 * A publish ships HEAD. With changesets pending, HEAD already holds their code, so version first
 * and then publish every version not on the registry yet, a half-finished release's included.
 * An alpha number that never reaches the registry is harmless; a changelog that misses code is not.
 */
export function nextStep(pending: number, unpublished: number): NextStep {
  if (unpublished > 0) return pending > 0 ? 'version-then-publish' : 'publish';
  return pending > 0 ? 'version' : 'nothing';
}
