// TEMPORARY CI probe (removed before the PR is ready).
import { it } from 'vitest';
import { probeOne } from './zz-ci-probe.ts';

it('probe', () => probeOne('sequence', 'old', 1), 120_000);
