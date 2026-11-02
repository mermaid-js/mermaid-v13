import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const root = join(import.meta.dirname, '..', '..', '..');
const json = (path: string) =>
  JSON.parse(readFileSync(join(root, path), 'utf8')) as Record<string, unknown>;

interface Step {
  name?: string;
  run?: string;
  uses?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
}
interface Job {
  if?: string;
  needs?: string | string[];
  environment?: string | { name: string };
  permissions?: Record<string, string>;
  steps: Step[];
}
const workflow = parse(readFileSync(join(root, '.github/workflows/release.yml'), 'utf8')) as {
  on: { push: { branches: string[] } };
  concurrency: { group: string; 'cancel-in-progress': boolean };
  jobs: Record<string, Job>;
};
const job = (id: string) => {
  const j = workflow.jobs[id];
  if (j === undefined) throw new Error(`release.yml has no job "${id}"`);
  return j;
};
const stepIndex = (j: Job, pattern: RegExp) => j.steps.findIndex((s) => pattern.test(s.run ?? ''));
const needs = (j: Job) => [j.needs ?? []].flat();

describe('changesets (R-REL-1, R-REL-2)', () => {
  it('versions from mermaid-v13, not develop or master', () => {
    expect(json('.changeset/config.json').baseBranch).toBe('mermaid-v13');
  });

  it('is in pre mode with tag alpha', () => {
    const pre = json('.changeset/pre.json');
    expect(pre.mode).toBe('pre');
    expect(pre.tag).toBe('alpha');
  });

  it('versions every published package together, so each alpha is one consistent set', () => {
    expect(json('.changeset/config.json').fixed).toEqual([
      [
        'mermaid',
        '@mermaid-js/core',
        '@mermaid-js/diagram-flowchart',
        '@mermaid-js/plugin-interactions',
      ],
    ]);
  });

  it('does not version or tag private workspace packages', () => {
    expect(json('.changeset/config.json').privatePackages).toEqual({ version: false, tag: false });
  });
});

describe('release workflow (R-REL-2, R-REL-3)', () => {
  it('runs on every push to mermaid-v13, one release at a time', () => {
    expect(workflow.on.push.branches).toEqual(['mermaid-v13']);
    expect(workflow.concurrency['cancel-in-progress']).toBe(false);
  });

  it('versions every merge (an auto changeset when none came with it) and skips its own commit', () => {
    const v = job('version');
    expect(v.if).toContain("!startsWith(github.event.head_commit.message, 'chore(release):')");
    const ensure = stepIndex(v, /pnpm release:ensure-changeset/);
    const version = stepIndex(v, /pnpm changeset version/);
    const push = stepIndex(v, /git push/);
    expect(ensure).toBeGreaterThanOrEqual(0);
    expect(version).toBeGreaterThan(ensure);
    expect(push).toBeGreaterThan(version);
  });

  it('publishes the private alpha to GitHub Packages after versioning', () => {
    const p = job('private');
    expect(needs(p)).toContain('version');
    const publish = p.steps.find((s) => /pnpm release:publish --target private/.test(s.run ?? ''));
    expect(publish?.env?.NODE_AUTH_TOKEN).toBe('${{ secrets.MERMAID_CHART_PACKAGES_TOKEN }}');
    expect(stepIndex(p, /pnpm build/)).toBeLessThan(stepIndex(p, /release:publish/));
  });

  it('publishes publicly only after the private alpha, behind the opt-in variable and environment', () => {
    const p = job('public');
    expect(needs(p)).toEqual(expect.arrayContaining(['version', 'private']));
    expect(p.if).toContain("vars.PUBLIC_ALPHA == 'true'");
    expect(p.environment).toBe('npm-alpha');
    expect(p.permissions?.['id-token']).toBe('write');
  });

  it('runs the full bench and the R-PERF-1…4 gate before the public publish, which re-checks it', () => {
    const p = job('public');
    const bench = stepIndex(
      p,
      /pnpm --filter @mermaid-js\/bench bench(?! .*--(?:filter|tiers|set|renderers))/
    );
    const gate = stepIndex(p, /pnpm release:public-gate /);
    const publish = stepIndex(p, /pnpm release:publish --target public --gate /);
    expect(bench).toBeGreaterThanOrEqual(0);
    expect(gate).toBeGreaterThan(bench);
    expect(publish).toBeGreaterThan(gate);
    // A failing gate step fails the job; nothing may let the publish run anyway.
    for (const s of p.steps.slice(gate)) expect(s).not.toHaveProperty('continue-on-error');
    expect(p.steps[publish]!).not.toHaveProperty('if');
  });

  it('publishes only through release:publish (tarball, leak gate, tag alpha), never latest', () => {
    const runs = Object.values(workflow.jobs).flatMap((j) => j.steps.map((s) => s.run ?? ''));
    for (const run of runs) {
      expect(run).not.toMatch(/\bnpm publish\b|\bpnpm publish\b|changeset publish/);
      expect(run).not.toMatch(/--tag latest|dist-tag/);
    }
  });
});
