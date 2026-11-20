import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ALL,
  CASES,
  captureReference,
  findDifferences,
  formatReference,
  GROUP,
  reconcile,
  referenceAt,
  type Colour,
  type ReferenceTable,
} from './override-matrix.ts';

const SRC = dirname(fileURLToPath(import.meta.url));
const PACKAGES = join(SRC, '../..');

/** Every override spec: D568's and each type's `<type>/theme-overrides.spec.ts`. */
const SPECS = [
  'theme-overrides.spec.ts',
  ...readdirSync(SRC, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(SRC, d.name, 'theme-overrides.spec.ts')))
    .map((d) => `${d.name}/theme-overrides.spec.ts`),
];

describe('the override specs (D654)', () => {
  it.each(SPECS)('%s runs without v12', (spec) => {
    const text = readFileSync(join(SRC, spec), 'utf8');
    expect(text).not.toMatch(/mermaid-v12|loadOracle/);
  });

  it.each(SPECS.slice(1))("%s belongs to a diagram package's theme table", (spec) => {
    const type = spec.split('/')[0]!.toLowerCase();
    expect(existsSync(join(PACKAGES, `diagram-${type}`, 'src/theme/table.ts'))).toBe(true);
  });

  it.each(SPECS)('%s groups each difference under a decision (#1043)', (spec) => {
    for (const group of differenceGroups(readFileSync(join(SRC, spec), 'utf8'))) {
      expect(group).toMatch(GROUP);
    }
  });
});

/** The group keys of a spec's `DIFFERENCES`: its lines at two spaces' indent that open a key. */
function differenceGroups(text: string): string[] {
  const block = /^const DIFFERENCES\b.*?= \{\n([\s\S]*?)^\};/m.exec(text)?.[1] ?? '';
  return [...block.matchAll(/^ {2}(?:(["'])(.*?)\1|([\w$]+)):/gm)].map((m) => m[2] ?? m[3]!);
}

describe('a group of differences (D654, #1043)', () => {
  it("is read from each key of a spec's DIFFERENCES", () => {
    const text = [
      "const V12: ReferenceTable = { 'not: a group': {} };",
      'const DIFFERENCES: Readonly<Record<string, readonly string[]>> = {',
      '  "D571: v12\'s darkMode": [',
      "    'base / darkMode / pie1',",
      '  ],',
      "  '#1035 T2 (#1039) pending': [],",
      '  D351: [],',
      '};',
    ].join('\n');
    expect(differenceGroups(text)).toEqual([
      "D571: v12's darkMode",
      '#1035 T2 (#1039) pending',
      'D351',
    ]);
  });

  it('names a decision', () => {
    expect('D571: why').toMatch(GROUP);
    expect('D571, D406: why').toMatch(GROUP);
  });

  it("does not name a ticket: spec #1035's ticket groups are closed (#1043)", () => {
    expect('#1035 T2 (#1039) pending').not.toMatch(GROUP);
    expect('#1035 T4').not.toMatch(GROUP);
  });
});

/** A resolver that gives `base` everywhere, except where `moved` names a label. */
const resolver =
  (
    base: Readonly<Record<string, Colour>>,
    moved: Readonly<Record<string, Record<string, Colour>>>
  ) =>
  (label: string): Readonly<Record<string, Colour>> => ({ ...base, ...moved[label] });

describe('the override matrix (D568, D654)', () => {
  it('has no override, each base colour and mainBkg set alone to both test colours, and darkMode', () => {
    expect(ALL).toHaveLength(16);
    expect(CASES['primaryColor:light']).toEqual({ primaryColor: '#ffd966' });
    expect(CASES['mainBkg:dark']).toEqual({ mainBkg: '#2a4d69' });
    expect(CASES.darkMode).toEqual({ darkMode: true });
  });

  it('reads a reference: the value with no override unless the override is listed', () => {
    expect(referenceAt('#111111', 'primaryColor:light')).toBe('#111111');
    const ref = { none: '#111111', 'lineColor:dark': '#2a4d69', darkMode: null };
    expect(referenceAt(ref, 'none')).toBe('#111111');
    expect(referenceAt(ref, 'primaryColor:light')).toBe('#111111');
    expect(referenceAt(ref, 'lineColor:dark')).toBe('#2a4d69');
    expect(referenceAt(ref, 'darkMode')).toBeNull();
  });
});

describe('findDifferences: where the value matches with no override (D654)', () => {
  const reference = { fill: { none: '#111111', 'primaryColor:light': '#ffd966' } };

  it('finds nothing where v13 moves under exactly the listed overrides, to the listed values', () => {
    const resolve = resolver({ fill: '#111111' }, { 'primaryColor:light': { fill: '#ffd966' } });
    expect(findDifferences('default', reference, resolve, { response: true })).toEqual([]);
  });

  it('finds an override that moves the reference and not v13', () => {
    const resolve = resolver({ fill: '#111111' }, {});
    expect(findDifferences('default', reference, resolve, { response: true })).toEqual([
      'default / primaryColor:light / fill',
    ]);
  });

  it('finds an override the reference does not list that moves v13', () => {
    const resolve = resolver(
      { fill: '#111111' },
      { 'primaryColor:light': { fill: '#ffd966' }, darkMode: { fill: '#222222' } }
    );
    expect(findDifferences('forest', reference, resolve, { response: true })).toEqual([
      'forest / darkMode / fill',
    ]);
  });

  it('finds an override under which both move, to different values', () => {
    const resolve = resolver({ fill: '#111111' }, { 'primaryColor:light': { fill: '#ffd967' } });
    expect(findDifferences('base', reference, resolve, { response: true })).toEqual([
      'base / primaryColor:light / fill',
    ]);
  });
});

describe('findDifferences: where the value differs with no override', () => {
  const reference = { ink: { none: '#111111', 'lineColor:light': '#ffd966' } };
  const resolve = resolver(
    { ink: '#999999' },
    { 'lineColor:light': { ink: '#123456' }, 'background:dark': { ink: '#2a4d69' } }
  );

  it('finds the difference with no override, and then compares only whether it moves (D654)', () => {
    expect(findDifferences('neutral', reference, resolve, { response: true })).toEqual([
      'neutral / none / ink',
      'neutral / background:dark / ink',
    ]);
  });

  it('compares the values under every case, no override included, without response (D568)', () => {
    expect(findDifferences('dark', reference, resolve, { response: false })).toEqual(
      ALL.map((label) => `dark / ${label} / ink`)
    );
  });

  it('treats a colour the reference does not resolve as a value', () => {
    const gone = { ink: { none: '#111111', darkMode: null } };
    const same = resolver({ ink: '#111111' }, {});
    expect(findDifferences('dark', gone, same, { response: true })).toEqual([
      'dark / darkMode / ink',
    ]);
  });
});

describe('reconcile: the found differences against the listed ones', () => {
  it('reports an unlisted difference and a listed one that has gone', () => {
    expect(reconcile(['a', 'b'], ['b', 'c'])).toEqual({ unlisted: ['a'], gone: ['c'] });
    expect(reconcile(['b', 'a'], ['a', 'b'])).toEqual({ unlisted: [], gone: [] });
  });
});

describe('captureReference: the reference values of one theme', () => {
  it('keeps the value with no override, and only the overrides that change it', () => {
    const resolve = resolver(
      { fill: '#111111', ink: '#222222', unset: undefined as unknown as Colour },
      {
        'primaryColor:light': { fill: '#ffd966' },
        'primaryColor:dark': { fill: '#2a4d69' },
        darkMode: { ink: null, unset: '#333333' },
      }
    );
    expect(captureReference(['fill', 'ink', 'unset'], resolve)).toEqual({
      fill: { none: '#111111', 'primaryColor:light': '#ffd966', 'primaryColor:dark': '#2a4d69' },
      ink: { none: '#222222', darkMode: null },
    });
  });
});

describe('formatReference: the table the capture tool prints', () => {
  const table = {
    default: { fill: '#111111', ink: { none: '#222222', 'lineColor:light': '#ffd966' } },
    dark: {},
    forest: { fill: '#111111' },
    neutral: { fill: '#111111' },
    base: {
      fill: {
        none: '#111111',
        'primaryColor:light': '#ffd966',
        'primaryColor:dark': '#2a4d69',
        'secondaryColor:light': '#ffd966',
        darkMode: null,
      },
    },
  } satisfies ReferenceTable;

  it('prints one Prettier-formatted statement, objects broken where they pass 100 columns', () => {
    expect(formatReference('V12', table)).toBe(
      [
        'const V12: ReferenceTable = {',
        '  default: {',
        "    fill: '#111111',",
        "    ink: { none: '#222222', 'lineColor:light': '#ffd966' },",
        '  },',
        '  dark: {},',
        '  forest: {',
        "    fill: '#111111',",
        '  },',
        '  neutral: {',
        "    fill: '#111111',",
        '  },',
        '  base: {',
        '    fill: {',
        "      none: '#111111',",
        "      'primaryColor:light': '#ffd966',",
        "      'primaryColor:dark': '#2a4d69',",
        "      'secondaryColor:light': '#ffd966',",
        '      darkMode: null,',
        '    },',
        '  },',
        '};',
        '',
      ].join('\n')
    );
  });
});
