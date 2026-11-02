import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { REGISTRY_PATH, generateRegistry, readManifests } from './registry.ts';

mkdirSync(dirname(REGISTRY_PATH), { recursive: true });
writeFileSync(REGISTRY_PATH, generateRegistry(readManifests()));
process.stdout.write(`wrote ${REGISTRY_PATH}\n`);
