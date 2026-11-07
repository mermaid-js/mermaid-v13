// TEMPORARY CI probe (removed before the PR is ready).
import { it } from 'vitest';
import { probeOne } from './zz-ci-probe.ts';

it('probe', () => probeOne('flowchart', 'old', 3), 120_000);
