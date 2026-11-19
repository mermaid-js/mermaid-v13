import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { pendingChangesets } from './changesets.ts';

const root = join(import.meta.dirname, '..', '..', '..');
const json = (path: string) =>
  JSON.parse(readFileSync(join(root, path), 'utf8')) as Record<string, unknown>;

interface Step {
  name?: string;
  if?: string;
  run?: string;
  uses?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
}
interface Job {
  if?: string;
  env?: Record<string, string>;
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

  it('versions each package on its own; a change re-releases its dependents (v13/docs/RELEASING.md)', () => {
    expect(json('.changeset/config.json').fixed).toEqual([]);
    expect(json('.changeset/config.json').linked).toEqual([]);
    // Exact workspace ranges: Changesets bumps every dependent, so `mermaid` always ships the
    // newest set, and a pinned `mermaid` never floats onto another alpha of its packages.
    for (const dir of [
      'mermaid',
      'diagram-flowchart',
      'diagram-class',
      'diagram-er',
      'diagram-sequence',
      'plugin-interactions',
    ]) {
      const pkg = json(`packages/${dir}/package.json`) as {
        dependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
      };
      for (const range of Object.values({ ...pkg.dependencies, ...pkg.peerDependencies }))
        expect(range, dir).toBe('workspace:*');
    }
  });

  it('does not version or tag private workspace packages', () => {
    expect(json('.changeset/config.json').privatePackages).toEqual({ version: false, tag: false });
  });

  it('gives every public package that has not been released a pending feat: changeset', () => {
    const released = Object.keys(json('.changeset/pre.json').initialVersions as object);
    const pending = pendingChangesets(root).map((id) =>
      readFileSync(join(root, '.changeset', `${id}.md`), 'utf8')
    );
    const unreleased = readdirSync(join(root, 'packages'))
      .filter((dir) => existsSync(join(root, 'packages', dir, 'package.json')))
      .map((dir) => json(`packages/${dir}/package.json`) as { name: string; private?: boolean })
      .filter((pkg) => pkg.private !== true && !released.includes(pkg.name))
      .map((pkg) => pkg.name);
    // Empty right after a release, when `changeset version` has added every package to pre.json.
    for (const name of unreleased) {
      const first = pending.filter(
        (md) => md.includes(`'${name}': `) && md.includes(`feat: first release of \`${name}\``)
      );
      expect(first.length, name).toBeGreaterThan(0);
    }
  });
});

describe('release workflow (R-REL-2, R-REL-3)', () => {
  it('runs on every push to mermaid-v13, one release at a time', () => {
    expect(workflow.on.push.branches).toEqual(['mermaid-v13']);
    expect(workflow.concurrency['cancel-in-progress']).toBe(false);
  });

  it('versions every merge (an auto changeset when none came with it) and skips its own commit', () => {
    const v = job('version');
    expect(v.if).toContain("vars.RELEASE_ALPHA == 'true'");
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
    const publish = p.steps.find((s) =>
      (s.run ?? '').includes('pnpm release:publish --target private')
    );
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

describe('manual release workflow (v13/docs/RELEASING.md §5)', () => {
  const manual = parse(readFileSync(join(root, '.github/workflows/release-alpha.yml'), 'utf8')) as {
    on: Record<string, { inputs?: Record<string, { default?: unknown }> } | undefined>;
    concurrency: { group: string };
    jobs: Record<string, Job>;
  };
  const r = manual.jobs.release!;
  const at = (pattern: RegExp) => stepIndex(r, pattern);

  it('runs only when dispatched, as a dry run unless asked otherwise, one release at a time', () => {
    expect(Object.keys(manual.on)).toEqual(['workflow_dispatch']);
    expect(manual.on.workflow_dispatch?.inputs?.dry_run?.default).toBe(true);
    expect(manual.concurrency.group).toBe(workflow.concurrency.group);
    expect(r.environment).toBe('npm-alpha');
  });

  it('checks, versions, builds and rehearses before it pushes, publishes and tags', () => {
    const order = [
      /pnpm release:preflight/,
      /pnpm check/,
      /pnpm changeset version/,
      /pnpm release:sync-version/,
      /pnpm build/,
      /pnpm release:rehearse/,
      /git push origin HEAD:mermaid-v13/,
      /pnpm release:publish --target public/,
      /pnpm changeset tag/,
    ].map(at);
    expect(order.every((i) => i >= 0)).toBe(true);
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThanOrEqual(order[i - 1]!);
  });

  it('sets a git identity before versioning and tagging, and checks the tags reached origin', () => {
    const identity = at(/git config user\.email/);
    expect(identity).toBeGreaterThanOrEqual(0);
    expect(identity).toBeLessThan(at(/pnpm changeset version/));
    const tag = r.steps[at(/pnpm changeset tag/)]!;
    expect(tag.run).toMatch(/git rev-parse -q --verify "refs\/tags\/\$t"/);
    expect(tag.run).toMatch(/git ls-remote --exit-code --tags origin/);
  });

  it('pushes and tags only outside a dry run, and the publish honours it', () => {
    expect(r.steps[at(/git push origin HEAD/)]!.if).toContain('!inputs.dry_run');
    expect(r.steps[at(/pnpm changeset tag/)]!.if).toContain('!inputs.dry_run');
    const publish = r.steps[at(/pnpm release:publish/)]!;
    expect(publish.run).toContain('$DRY_RUN');
    expect(publish.env?.DRY_RUN).toContain('--dry-run');
  });

  it('publishes with the npm token, without provenance (private repository), gate reason given', () => {
    const publish = r.steps[at(/pnpm release:publish/)]!.run!;
    expect(publish).toContain('--no-provenance');
    expect(publish).toContain('--skip-gate "$GATE_REASON"');
    expect((r as Job & { env?: Record<string, string> }).env?.NODE_AUTH_TOKEN).toBe(
      '${{ secrets.NPM_TOKEN }}'
    );
    expect(r.permissions?.['id-token']).toBeUndefined();
    for (const s of r.steps) {
      expect(s.run ?? '').not.toMatch(/\bnpm publish\b|\bpnpm publish\b|changeset publish/);
      expect(s.run ?? '').not.toMatch(/--tag latest|dist-tag/);
    }
  });
});

describe('workflow branches (R-REL-1)', () => {
  const wf = (name: string) =>
    parse(readFileSync(join(root, '.github/workflows', name), 'utf8')) as {
      on: Record<string, { branches?: string[]; 'branches-ignore'?: string[] } | null>;
      jobs: Record<string, Job>;
    };

  const argosUpload = (name: string) =>
    wf(name).jobs.visual!.steps.find((s) => (s.run ?? '').includes('argos-upload.sh'));

  it('compares Argos screenshots with the mermaid-v13 baseline', () => {
    expect(argosUpload('ci.yml')?.env?.ARGOS_REFERENCE_BRANCH).toBe('mermaid-v13');
    expect(argosUpload('visual-nightly.yml')?.env?.ARGOS_REFERENCE_BRANCH).toBe('mermaid-v13');
  });

  it('runs two fixture tiers on a PR and every tier at night, as two Argos builds (D631)', () => {
    const tiers = (name: string) => wf(name).jobs.visual!.env?.MERMAID_E2E_FIXTURE_TIER;
    expect(tiers('ci.yml')).toBe('pr-check,baseline');
    expect(tiers('visual-nightly.yml')).toBeUndefined();
    expect(argosUpload('ci.yml')?.env?.ARGOS_BUILD_NAME).toBeUndefined();
    expect(argosUpload('visual-nightly.yml')?.env?.ARGOS_BUILD_NAME).toBe('nightly');
  });

  it('keeps the specs that take no screenshots out of the visual job', () => {
    const run = (jobId: string) =>
      wf('ci.yml')
        .jobs[jobId]!.steps.map((s) => s.run ?? '')
        .join('\n');
    expect(run('visual')).toContain('playwright test rendering/mmd-snapshots.spec.ts');
    expect(run('visual')).not.toContain('pnpm e2e');
    expect(run('e2e')).toContain('pnpm e2e --grep-invert "mmd snapshots"');
  });
});
