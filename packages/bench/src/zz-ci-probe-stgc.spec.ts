// TEMPORARY CI probe (removed before the PR is ready): as zz-ci-probe.spec.ts, with V8's
// garbage collector switched to one thread before anything is measured.
import { setFlagsFromString } from 'node:v8';
import { it } from 'vitest';
import { probe } from './zz-ci-probe.ts';

setFlagsFromString('--single-threaded-gc');

it('probe', () => probe('stgc'), 600_000);
