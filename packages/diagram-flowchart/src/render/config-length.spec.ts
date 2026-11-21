import { describe, expect, it } from 'vitest';
import {
  configLengths as shared,
  type ConfigLengthWarning,
} from '@mermaid-js/shared/config/readers';
import { configLengths } from './config-length.ts';

const DEFAULTS = { padding: 15, nodeSpacing: 50, curve: 'basis' };
const SECTIONS: readonly Readonly<Record<string, unknown>>[] = [
  {},
  { padding: 8, nodeSpacing: '20' },
  { padding: ' 2.5 ', nodeSpacing: '20px' },
  { padding: -5, nodeSpacing: true, curve: 3 },
  { padding: 1e4, nodeSpacing: 9999.5, rankSpacing: 'x' },
];
const KEYS = ['padding', 'nodeSpacing', 'curve', 'rankSpacing', 'padding'];

function run(make: (warn: (w: ConfigLengthWarning) => void) => (key: string) => unknown) {
  const warnings: ConfigLengthWarning[] = [];
  const length = make((w) => warnings.push(w));
  return { values: KEYS.map((k) => length(k)), warnings };
}

// Flowchart keeps its own copy of the shared reader on purpose (D594): this keeps the two in step.
describe("flowchart's configLengths copy", () => {
  it.each(SECTIONS)('reads %j as the shared reader does', (section) => {
    expect(run((warn) => configLengths(section, DEFAULTS, warn))).toEqual(
      run((warn) => shared('flowchart', 'FLOWCHART_CONFIG_IGNORED', section, DEFAULTS, warn))
    );
  });
});
