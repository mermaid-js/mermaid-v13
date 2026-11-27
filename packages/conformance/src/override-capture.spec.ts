import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DiagramThemeTable } from '@mermaid-js/core/theme';
import { describe, expect, it } from 'vitest';
import { captureTable, checkPasted, findTables, v12Colour } from './override-capture.ts';
import { formatReference, type ReferenceTable } from './override-matrix.ts';

const SRC = dirname(fileURLToPath(import.meta.url));

describe('findTables: the diagram theme tables, from the packages’ files', () => {
  const tables = findTables(SRC, join(SRC, '../..'));

  it('finds each packages/diagram-<type>/src/theme/table.ts, by its conformance folder', () => {
    expect(tables.length).toBeGreaterThanOrEqual(28);
    for (const t of tables) expect(existsSync(t.path), t.path).toBe(true);
    const types = tables.map((t) => t.type);
    expect(types).toContain('gitgraph');
    expect(types).toContain('treeView');
    // Flowchart has had a table since #1345; sankey still has none.
    expect(types).toContain('flowchart');
    expect(types).not.toContain('sankey');
  });
});

describe('v12Colour: a variable in v12’s resolved theme variables', () => {
  const table = {
    section: 'xyChart',
    vars: { xyChartTitleColor: { alias: 'xt', kind: 'color', nested: 'titleColor' } },
  } as unknown as DiagramThemeTable;

  it('reads the flat name, or the nested key under the table’s section (D335)', () => {
    expect(v12Colour({ pie1: '#ECECFF' }, 'pie1')).toBe('#ececff');
    expect(v12Colour({ xyChart: { titleColor: 'red' } }, 'xyChartTitleColor', table)).toBe(
      '#ff0000'
    );
  });

  it('gives null where v12 resolves no colour', () => {
    expect(v12Colour({}, 'xyChartTitleColor', table)).toBeNull();
    expect(v12Colour({ xyChart: 'none' }, 'xyChartTitleColor', table)).toBeNull();
    expect(v12Colour({ pie1: 'not a colour' }, 'pie1')).toBeNull();
  });
});

describe('captureTable: a reference table from a resolver per theme', () => {
  it('captures each classic theme', async () => {
    const table = await captureTable(['fill'], (theme) =>
      Promise.resolve(() => ({ fill: theme === 'dark' ? '#000000' : '#ffffff' }))
    );
    expect(table).toEqual({
      default: { fill: '#ffffff' },
      dark: { fill: '#000000' },
      forest: { fill: '#ffffff' },
      neutral: { fill: '#ffffff' },
      base: { fill: '#ffffff' },
    });
  });
});

describe('checkPasted: a spec against a fresh capture', () => {
  const one = (fill: string): ReferenceTable => ({
    default: { fill },
    dark: {},
    forest: {},
    neutral: {},
    base: {},
  });
  const none: ReferenceTable = { default: {}, dark: {}, forest: {}, neutral: {}, base: {} };
  const spec = `head\n${formatReference('V12', one('#111111'))}tail\n`;

  it('passes a spec that holds the printed table byte for byte', () => {
    expect(checkPasted('pie', one('#111111'), spec, 'V12')).toBeUndefined();
    expect(checkPasted('kanban', none, undefined, 'V12')).toBeUndefined();
  });

  it('names a type whose pasted table differs, has no spec, or should have none', () => {
    expect(checkPasted('pie', one('#222222'), spec, 'V12')).toMatch(/^pie: .*differs/);
    expect(checkPasted('pie', one('#111111'), undefined, 'V12')).toMatch(/^pie: no spec/);
    expect(checkPasted('kanban', none, spec, 'V12')).toMatch(/^kanban: .*no colour/);
  });
});
