// TEMPORARY CI probe (removed before the PR is ready): logs raw R-LANG-4 samples measured by
// several methods on the hosted runner, under the load of the rest of `pnpm test`.
import { it } from 'vitest';
import { probe } from './zz-ci-probe.ts';

it('probe', () => probe('default'), 600_000);
