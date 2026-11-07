// TEMPORARY CI probe (removed before the PR is ready): measured alone, after every other file.
import { it } from 'vitest';
import { probeOne } from '../zz-ci-probe.ts';

it('probe', () => probeOne('flowchart', 'new', 1, 'quiet'), 120_000);
