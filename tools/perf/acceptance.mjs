/** Readiness is scoped: Node measurement never attests to browser validation. */
import { readFileSync } from 'node:fs';
import { readJson, sha } from './common.mjs';

const nodeChecks = ['environment', 'harness', 'check', 'security', 'size', 'host'];
const browserChecks = ['browser', 'e2e'];

export function requiredChecks(profile) {
  if (profile === 'node') return [...nodeChecks];
  if (profile === 'full') return [...nodeChecks, ...browserChecks];
  throw new Error(`Unknown validation profile: ${profile}`);
}

export function readiness(profile, results, sourceStable) {
  const required = requiredChecks(profile);
  const passed = (name) => {
    const matches = results.filter((result) => result.name === name);
    return matches.length === 1 && matches[0].status === 'passed' && matches[0].exitCode === 0;
  };
  const ready = sourceStable === true && required.every(passed);
  return {
    validationProfile: profile,
    ready,
    fullReady: profile === 'full' && ready,
    browserValidation: browserChecks.every(passed) ? 'passed' : 'unverified',
    requiredChecks: required,
  };
}

export function validateAcceptance(path, sourceSha256, profile) {
  if (!path) throw new Error('Formal preparation requires --acceptance <acceptance.json>');
  const acceptance = readJson(path);
  const status = readiness(profile, acceptance.results ?? [], acceptance.sourceStable);
  if (
    acceptance.validationProfile !== profile ||
    acceptance.ready !== true ||
    !status.ready ||
    acceptance.sourceSha256 !== sourceSha256
  )
    throw new Error(
      'Acceptance is incomplete, failed, stale or for a different validation profile'
    );
  for (const name of status.requiredChecks) {
    const result = acceptance.results.find((item) => item.name === name);
    if (sha(readFileSync(result.log)) !== result.logSha256)
      throw new Error(`Changed acceptance evidence: ${name}`);
  }
  return acceptance;
}
