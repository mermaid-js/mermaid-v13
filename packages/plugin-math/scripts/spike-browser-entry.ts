// Browser bundle entry for spike-evidence.ts: the engine, as M2 would load it.
import { typeset } from '../src/engine.ts';

(globalThis as unknown as { __mathSpike: unknown }).__mathSpike = { typeset };
