// Browser bundle entry for spike-evidence.ts: the sync call and elkjs's own API, side by side.
import elkBundled from 'elkjs/lib/elk.bundled.js';
import { layoutSync } from '../src/sync.ts';

(globalThis as unknown as { __elkSpike: unknown }).__elkSpike = {
  layoutSync,
  ELK: elkBundled.default,
};
