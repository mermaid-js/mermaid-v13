/**
 * Writes the parity outcome as JSON for the weekly oracle-bump workflow:
 * `{ oracleVersion, sources, clusters, disappeared }`.
 *
 * Usage: `pnpm --filter @mermaid-js/conformance oracle:report <out.json>`
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  clusterDivergences,
  loadDivergences,
  loadOracle,
  resolveCorpus,
  runParity,
} from '../index.ts';
import { DIVERGENCES_FILE, PARITY_SUITES } from '../registry.ts';

const out = process.argv[2];
const oracle = await loadOracle();
const report = await runParity({
  oracle,
  adapters: PARITY_SUITES.map((s) => s.adapter),
  corpus: resolveCorpus(process.env, PARITY_SUITES),
  divergences: loadDivergences(fileURLToPath(DIVERGENCES_FILE)),
});
const json = JSON.stringify(
  {
    oracleVersion: oracle.version,
    sources: report.results.length,
    clusters: clusterDivergences(report.unlisted),
    disappeared: report.disappeared,
  },
  null,
  2
);
if (out) writeFileSync(out, json + '\n');
else process.stdout.write(json + '\n');
