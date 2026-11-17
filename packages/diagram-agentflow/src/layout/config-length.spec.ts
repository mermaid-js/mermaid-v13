import { describe, expect, it } from 'vitest';
import type { ConfigLengthWarning } from '@mermaid-js/shared/config/readers';
import { configLengths } from './config-length.ts';

const DEFAULTS = { wrappingWidth: 120, minNodeWidth: 120 } as const;

function reader(section: unknown) {
  const warnings: ConfigLengthWarning[] = [];
  const length = configLengths(section, DEFAULTS, 'agentflow', (w) => warnings.push(w));
  return { length, warnings };
}

describe('agentflow configLengths', () => {
  it('takes a number or a whole numeric string from 0 up to 10000', () => {
    const { length, warnings } = reader({ wrappingWidth: ' 2.5 ', minNodeWidth: 0 });
    expect(length('wrappingWidth')).toBe(2.5);
    expect(length('minNodeWidth')).toBe(0);
    expect(warnings).toEqual([]);
  });

  it('reads an unset key, or a section that is no object, as the default without a warning', () => {
    expect(reader({}).length('wrappingWidth')).toBe(120);
    const { length, warnings } = reader(5);
    expect(length('minNodeWidth')).toBe(120);
    expect(reader(null).length('minNodeWidth')).toBe(120);
    expect(warnings).toEqual([]);
  });

  it('draws anything else with the default, warning once per key', () => {
    const { length, warnings } = reader({ wrappingWidth: '20px', minNodeWidth: 1e4 });
    expect(length('wrappingWidth')).toBe(120);
    expect(length('wrappingWidth')).toBe(120);
    expect(length('minNodeWidth')).toBe(120);
    expect(warnings).toEqual([
      {
        code: 'AGENTFLOW_CONFIG_INVALID',
        message:
          'Ignored agentflow.wrappingWidth: it is not a number from 0 up to 10000; using 120',
        path: 'agentflow.wrappingWidth',
      },
      {
        code: 'AGENTFLOW_CONFIG_INVALID',
        message: 'Ignored agentflow.minNodeWidth: it is not a number from 0 up to 10000; using 120',
        path: 'agentflow.minNodeWidth',
      },
    ]);
  });

  it('gives the default alone through fallback, with no warning for a bad value', () => {
    const { length, warnings } = reader({ wrappingWidth: 'wide' });
    expect(length.fallback('wrappingWidth')).toBe(120);
    expect(warnings).toEqual([]);
  });
});
