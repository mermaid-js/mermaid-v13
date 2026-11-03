/**
 * The committed benchmark fixtures (R-PERF-6): the 158-diagram flowchart corpus synced by the
 * `mermaid-v13-approaches` harness, and the #8635 / Pele set (7-, 50- and 500-node flowcharts,
 * a sequence and a class diagram). Performance only; the parity corpus lives in conformance.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export type FixtureSet = 'corpus' | 'pele';
export type Tier = 'tiny' | 'regular' | 'large' | 'huge';

export interface Fixture {
  /** Stable id, `<group>/<name>`, used as the key in reports and baselines. */
  id: string;
  set: FixtureSet;
  /** Diagram type, from the manifest. */
  type: 'flowchart' | 'sequence' | 'class';
  group: string;
  tier: Tier;
  features: string[];
  /** Bytes recorded in the manifest when the fixture was synced. */
  bytes: number;
  source: string;
}

interface CorpusManifest {
  diagrams: {
    id: string;
    file: string;
    group: string;
    tier: Tier;
    bytes: number;
    features: string[];
  }[];
}

interface PeleManifest {
  diagrams: { id: string; file: string; type: Fixture['type']; nodes?: number }[];
}

export const FIXTURES_DIR = fileURLToPath(new URL('../fixtures/', import.meta.url));

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(FIXTURES_DIR + path, 'utf8')) as T;
}

function tierOf(source: string): Tier {
  const lines = source.split('\n').length;
  if (lines <= 20) return 'tiny';
  return lines <= 1000 ? 'regular' : 'large';
}

/** Every fixture, corpus first, in manifest order. */
export function loadFixtures(): Fixture[] {
  const corpus = readJson<CorpusManifest>('corpus/manifest.json').diagrams.map(
    (d): Fixture => ({
      id: d.id,
      set: 'corpus',
      type: 'flowchart',
      group: d.group,
      tier: d.tier,
      features: d.features,
      bytes: d.bytes,
      source: readFileSync(FIXTURES_DIR + 'corpus/' + d.file, 'utf8'),
    })
  );
  const pele = readJson<PeleManifest>('pele/manifest.json').diagrams.map((d): Fixture => {
    const source = readFileSync(FIXTURES_DIR + 'pele/' + d.file, 'utf8');
    return {
      id: d.id,
      set: 'pele',
      type: d.type,
      group: 'pele',
      tier: tierOf(source),
      features: [],
      bytes: Buffer.byteLength(source),
      source,
    };
  });
  return [...corpus, ...pele];
}
