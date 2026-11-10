// cspell:ignore unsketched
/**
 * What the dev specs read instead of a hand-kept list of diagram types, so a new diagram
 * port joins them unchanged: the first-party diagram packages' `mermaid` manifests
 * (`packages/diagram-*`/package.json, DESIGN §12.1), and each e2e fixture folder's
 * `hand-drawn.txt` verdict.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './fixtures.ts';

export interface DiagramManifest {
  readonly id: string;
  /** The v12 diagram types it renders, as `detectType` reports them. */
  readonly types: readonly string[];
  readonly formats: readonly string[];
}

/** Every first-party diagram package's manifest, in package directory order. */
export function diagramManifests(): DiagramManifest[] {
  const dir = join(REPO_ROOT, 'packages');
  return readdirSync(dir)
    .filter((entry) => entry.startsWith('diagram-'))
    .sort()
    .flatMap((entry) => {
      const path = join(dir, entry, 'package.json');
      if (!existsSync(path)) return [];
      const { mermaid } = JSON.parse(readFileSync(path, 'utf8')) as {
        mermaid?: DiagramManifest & { plugin?: string };
      };
      return mermaid?.plugin === 'diagram' ? [mermaid] : [];
    });
}

/**
 * The first line of `e2e/diagrams/<folder>/hand-drawn.txt`: `sketched` when v12 sketched the
 * folder's type with `look: handDrawn`, `unsketched` when it never did, else undefined.
 */
export function handDrawnVerdict(folder: string): string | undefined {
  const file = join(REPO_ROOT, 'e2e', 'diagrams', folder, 'hand-drawn.txt');
  return existsSync(file) ? readFileSync(file, 'utf8').split('\n')[0]!.trim() : undefined;
}
