import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { FORMAT_MATRIX_PATH, generateFormatMatrix } from './format-matrix.ts';
import { REGISTRY_PATH, generateRegistry, readManifests } from './registry.ts';

const manifests = readManifests();
mkdirSync(dirname(REGISTRY_PATH), { recursive: true });
writeFileSync(REGISTRY_PATH, generateRegistry(manifests));
process.stdout.write(`wrote ${REGISTRY_PATH}\n`);
// The type × format matrix comes from the same manifests (D58).
writeFileSync(FORMAT_MATRIX_PATH, generateFormatMatrix(manifests));
process.stdout.write(`wrote ${FORMAT_MATRIX_PATH}\n`);
