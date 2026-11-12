/**
 * `pnpm gen:registry` writes the files generated from the diagram packages' manifests;
 * `pnpm gen:registry --check` fails instead when any of them is stale.
 */
import { emit } from './emit.ts';
import { FORMAT_MATRIX_PATH, generateFormatMatrix } from './format-matrix.ts';
import {
  DETECTORS_PATH,
  FACETS_PATH,
  generateDetectors,
  generateFacets,
  REGISTRY_PATH,
  generateRegistry,
  readManifests,
} from './registry.ts';

const manifests = readManifests();
const files = new Map([
  [REGISTRY_PATH, generateRegistry(manifests)],
  // The language service's facet table, in the same detector order (D89).
  [FACETS_PATH, generateFacets(manifests)],
  [DETECTORS_PATH, generateDetectors(manifests)],
  // The type × format matrix comes from the same manifests (D58).
  [FORMAT_MATRIX_PATH, generateFormatMatrix(manifests)],
]);
if (!emit(files, { check: process.argv.includes('--check'), step: 'pnpm gen:registry' }))
  process.exitCode = 1;
