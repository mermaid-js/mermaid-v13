import { defineConfig } from 'vitest/config';

// Workspace packages resolve to their TypeScript sources via the `mermaid-source` export
// condition, so no build is needed before testing.
const resolve = { conditions: ['mermaid-source'] };
const ssr = { resolve: { conditions: ['mermaid-source'], externalConditions: ['mermaid-source'] } };
const exclude = ['**/node_modules/**', '**/dist/**', 'tools/**/fixtures/**'];

// Gantt computes in local time (D270), so its specs run twice: pinned to UTC, and in a zone
// with DST changes. Every `*.spec.ts` under the package, gantt's conformance specs (the
// schedule parity among them) and the interactions plugin's gantt spec join both runs and no
// other; a case for one zone reads the zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`)
// and skips in the other.
const GANTT_SPECS = [
  'packages/diagram-gantt/src/**/*.spec.ts',
  'packages/conformance/src/gantt/**/*.spec.ts',
  'packages/plugin-interactions/src/gantt.spec.ts',
];
const GANTT_ZONES = { 'gantt-utc': 'UTC', 'gantt-la': 'America/Los_Angeles' };

// One root config for the whole workspace. Tests run in plain Node: there is no DOM
// shim anywhere (R-ARCH-1).
export default defineConfig({
  resolve,
  ssr,
  test: {
    environment: 'node',
    projects: [
      {
        resolve,
        ssr,
        test: {
          name: 'workspace',
          environment: 'node',
          include: [
            'packages/*/src/**/*.spec.ts',
            'tools/**/*.spec.ts',
            // Unit tests of the Playwright helpers the v13 visual baseline uses (R-TEST-5).
            'e2e/helpers/mmd-snapshots.spec.ts',
            'e2e/helpers/argos-metadata.spec.ts',
            'e2e/helpers/platform-harness.spec.ts',
          ],
          exclude: [...exclude, ...GANTT_SPECS, 'packages/bench/src/zz-quiet/**'],
        },
      },
      // TEMPORARY (R-LANG-4 probe): the quiet copies run alone, after every other file.
      {
        resolve,
        ssr,
        test: {
          name: 'zz-quiet',
          environment: 'node',
          include: ['packages/bench/src/zz-quiet/*.quiet.spec.ts'],
          sequence: { groupOrder: 1 },
          maxWorkers: 1,
        },
      },
      ...Object.entries(GANTT_ZONES).map(([name, TZ]) => ({
        resolve,
        ssr,
        test: { name, environment: 'node' as const, include: GANTT_SPECS, exclude, env: { TZ } },
      })),
    ],
  },
});
