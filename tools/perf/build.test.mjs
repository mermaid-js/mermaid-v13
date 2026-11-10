import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { buildArtifacts, verifyArtifacts } from './build.mjs';

test('immutable builds verify inputs, exports, reset behavior, counters and diagnostic output', async () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'mermaid-perf-build-'));
  try {
    const result = await buildArtifacts({ out: resolve(directory, 'artifacts') });
    assert.equal(
      verifyArtifacts(result.manifestPath, { expectedManifestSha256: result.manifestSha256 }).source
        .commit.length,
      40
    );
    await assert.rejects(
      buildArtifacts({ out: resolve(directory, 'artifacts') }),
      /already exists/
    );
    for (const kind of ['v13', 'pele']) {
      const timing = await import(pathToFileURL(result.manifest.entries[kind].timing.entry));
      const diagnostic = await import(
        pathToFileURL(result.manifest.entries[kind].diagnostic.entry)
      );
      assert.deepEqual(Object.keys(timing).sort(), [
        'configure',
        'name',
        'render',
        'reset',
        'setup',
      ]);
      assert.equal((await diagnostic.verifyReset()).identical, true);
      const source =
        'flowchart TD\nA["A long label with enough words to exceed the default wrapping width by a large margin"]-->|edge|B';
      for (const entry of [timing, diagnostic]) {
        entry.configure();
        await entry.setup(source);
        entry.reset();
      }
      diagnostic.resetStats();
      assert.equal(timing.render(source, 4), diagnostic.render(source, 4));
      assert.equal(diagnostic.stats().parserCalls, 1);
      assert.ok(diagnostic.stats().measurerCalls > 0);
      if (kind === 'v13') {
        diagnostic.reset({ analysis: false });
        diagnostic.render(source, 4);
        assert.equal(diagnostic.stats().parserCalls, 1);
        diagnostic.reset();
        diagnostic.render(source, 4);
        assert.equal(diagnostic.stats().parserCalls, 2);
        const features = await diagnostic.inspect(source);
        assert.equal(features.nodes, 2);
        assert.equal(features.labelledEdges, 1);
        assert.equal(features.wideLabels, 1);
      }
    }
    const artifact = result.manifest.entries.v13.timing.entry;
    chmodSync(artifact, 0o644);
    writeFileSync(artifact, readFileSync(artifact, 'utf8') + '\n// altered\n');
    assert.throws(() => verifyArtifacts(result.manifestPath), /hash mismatch/);
    assert.throws(
      () => verifyArtifacts(result.manifestPath, { expectedManifestSha256: '0'.repeat(64) }),
      /manifest hash mismatch/
    );
    const missingSource = structuredClone(result.manifest);
    missingSource.artifacts = missingSource.artifacts.filter((file) => file.path !== artifact);
    assert.throws(() => verifyArtifacts(missingSource), /Missing entry evidence/);
    const wrongSource = structuredClone(result.manifest);
    wrongSource.artifacts = wrongSource.artifacts.filter((file) => file.path !== artifact);
    wrongSource.sources[0].sha256 = '0'.repeat(64);
    assert.throws(() => verifyArtifacts(wrongSource), /source hash mismatch/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('custom frozen target pins are hashed evidence and cannot bypass target checks', async () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'mermaid-perf-pins-'));
  try {
    const targets = resolve(directory, 'candidate-targets.json');
    const baseline = readFileSync('tools/perf/entries/targets.json', 'utf8');
    writeFileSync(targets, baseline);
    const built = await buildArtifacts({ out: resolve(directory, 'custom'), targets });
    assert.equal(built.manifest.instrumentationPinsFile.path, targets);
    assert.equal(
      built.manifest.sources.find((source) => source.path === targets).sha256,
      built.manifest.instrumentationPinsFile.sha256
    );
    const changed = JSON.parse(baseline);
    changed.targets.find((pin) => pin.path === 'packages/mermaid/src/api.ts').sha256 = '0'.repeat(
      64
    );
    writeFileSync(targets, JSON.stringify(changed));
    assert.throws(() => verifyArtifacts(built.manifestPath), /source hash mismatch/);
    await assert.rejects(
      buildArtifacts({ out: resolve(directory, 'changed'), targets }),
      /Non-public target hash mismatch/
    );
    const moved = JSON.parse(baseline);
    moved.peleMeasurer.targets[0] = 'function missingWidthTarget() {';
    writeFileSync(targets, JSON.stringify(moved));
    await assert.rejects(
      buildArtifacts({ out: resolve(directory, 'moved'), targets }),
      /Instrumentation target moved/
    );
    writeFileSync(targets, JSON.stringify({ ...moved, targets: [] }));
    await assert.rejects(
      buildArtifacts({ out: resolve(directory, 'missing'), targets }),
      /invalid non-public target pins/
    );
    assert.equal(readFileSync('tools/perf/entries/targets.json', 'utf8'), baseline);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
