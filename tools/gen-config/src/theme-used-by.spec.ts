import { describe, expect, it } from 'vitest';
import { THEME_VARIABLES } from '../../../packages/core/src/theme/index.ts';
import { diagramPackages } from '../../workspace/diagrams.ts';
import {
  PACKAGES,
  coreListedErrors,
  coreUsers,
  knownNames,
  packageReadErrors,
  themePackages,
  themeReads,
} from './theme-packages.ts';

/**
 * `usedBy` names the diagram types that read each theme variable (#207). The types are read from
 * each diagram package's sources (`themeReads` in theme-packages.ts): a string-literal argument
 * to a `Theme` method or a local helper over one, a table of names, a table rule's
 * `inline(name)`, and the names a package builds at run time, which its vocabulary lists as
 * `DYNAMIC_READS`. So core's vocabulary never lists a diagram package that reads a row: the
 * inventory lists it from its reads (`coreUsers`). Core's own `usedBy` names `core` and types
 * listed ahead of their reads only. A package's own rows (`src/theme/vocabulary.ts`, spec #414
 * T0b) may be read by its own type only: a row another type reads belongs in core.
 *
 * Everything per type lives in the package (`DYNAMIC_READS`, `NOT_DRAWN_YET`, `LISTED_AHEAD`),
 * so a port adds its package and edits nothing here.
 */
const PKGS = await themePackages(PACKAGES, { tables: 'vocabulary' });
const OWNERS = PKGS.filter((p) => p.vocabulary !== undefined);
const READS = themeReads(PKGS, knownNames(THEME_VARIABLES, PKGS));
const TYPES = PKGS.map((p) => p.type);

describe('theme vocabulary usedBy (#207)', () => {
  it('scans every diagram package', () => {
    expect(TYPES).toEqual(diagramPackages().map((p) => p.type));
    expect(TYPES.length).toBeGreaterThan(0);
  });

  // A port whose package has not reached layout yet says so with `NOT_DRAWN_YET = true` in its
  // vocabulary: it must read nothing then, so the flag goes as soon as it reads one.
  it.each(PKGS.map((p) => [p.type, p.notDrawnYet === true] as const))(
    '%s reads theme variables exactly when it is drawn (NOT_DRAWN_YET: %s)',
    (type, notDrawn) => {
      if (notDrawn) expect(READS.get(type)!.size, type).toBe(0);
      else expect(READS.get(type)!.size, type).toBeGreaterThan(0);
    }
  );

  it.each(PKGS.filter((p) => p.dynamicReads).map((p) => p.type))(
    "every DYNAMIC_READS name of %s is a theme variable (a typo can't hide a read)",
    (type) => {
      const known = knownNames(THEME_VARIABLES, PKGS);
      const pkg = PKGS.find((p) => p.type === type)!;
      expect(pkg.dynamicReads!.filter((n) => !known.has(n))).toEqual([]);
    }
  );

  it("names in core's usedBy only core and types listed ahead of their reads", () => {
    expect(coreListedErrors(THEME_VARIABLES, PKGS, READS)).toEqual([]);
  });

  it.each(TYPES)('lists %s for every core variable it reads, and for no other', (type) => {
    const reads = new Set([...READS.get(type)!].filter((n) => n in THEME_VARIABLES));
    const listed = Object.keys(THEME_VARIABLES).filter((name) =>
      coreUsers(name, THEME_VARIABLES[name]!.usedBy, READS).includes(type)
    );
    const ahead = PKGS.find((p) => p.type === type)!.listedAhead ?? [];
    expect(listed.filter((name) => !reads.has(name)).sort()).toEqual([...ahead].sort());
    expect([...reads].filter((name) => !listed.includes(name)).sort()).toEqual([]);
  });

  // packages/conformance/src/neo-theme.spec.ts keeps `border1` because nothing reads it (D152);
  // core's own `usedBy` no longer says whether a diagram does, so the reads check it here.
  it('reads border1 nowhere (neo-theme.spec, D152)', () => {
    expect(coreUsers('border1', THEME_VARIABLES.border1!.usedBy, READS)).toEqual([]);
  });

  it("lists core first, then every other user sorted, independent of the ports' order", () => {
    const reads = new Map([
      ['zeta', new Set(['x'])],
      ['alpha', new Set(['x', 'y'])],
    ]);
    expect(coreUsers('x', ['core', 'pending'], reads)).toEqual([
      'core',
      'alpha',
      'pending',
      'zeta',
    ]);
    expect(coreUsers('y', [], reads)).toEqual(['alpha']);
  });

  it('fails on a core row that lists a reader, or lists a type ahead without its LISTED_AHEAD', () => {
    const core = {
      a: { usedBy: ['core', 'demo'] },
      b: { usedBy: ['demo'] },
      c: { usedBy: ['nopackage'] },
      d: { usedBy: [] },
    };
    const packages = [{ type: 'demo', listedAhead: ['b', 'd'] }];
    const reads = new Map([['demo', new Set(['a'])]]);
    expect(coreListedErrors(core, packages, reads)).toEqual([
      'core `a`: drop demo from usedBy, its sources read it',
      "demo: LISTED_AHEAD `d` is not listed on core's row",
    ]);
    expect(coreListedErrors({ b: { usedBy: ['demo'] } }, [{ type: 'demo' }], new Map())).toEqual([
      'core `b`: lists demo, which neither reads it nor lists it ahead',
    ]);
  });
});

describe('package theme vocabularies usedBy (spec #414 T0b)', () => {
  it('reads each package row only from its own package', () => {
    expect(packageReadErrors(OWNERS, READS)).toEqual([]);
  });

  it('fails when another package reads a package row, or usedBy is wrong', () => {
    const demo = {
      type: 'demo',
      vocabulary: {
        demoFill: { alias: 'dmf', kind: 'color', usedBy: ['demo'] },
        demoText: { alias: 'dmt', kind: 'color', usedBy: ['demo'] },
        demoGap: { alias: 'dmx', kind: 'length', usedBy: [] },
      },
    } as const;
    const reads = new Map([
      ['demo', new Set(['demoFill', 'demoGap'])],
      ['other', new Set(['demoFill', 'mainBkg'])],
    ]);
    expect(packageReadErrors([demo], reads)).toEqual([
      'demo: `demoFill` is read by other too; a shared row belongs in core',
      'demo: `demoText` lists usedBy [demo], its sources say []',
      'demo: `demoGap` lists usedBy [], its sources say [demo]',
    ]);
  });
});
