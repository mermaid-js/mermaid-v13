import type { DiagramAdapter } from '../types.ts';

/**
 * Test-only fixture plugin: a tiny v13-style parser for a subset of `pie`, so the runner can be
 * exercised against the real `mermaid@12` oracle before any first-party diagram exists.
 *
 * Supported: `pie [showData]`, an optional `title …` line, and `"label" : number` lines.
 * Anything else is rejected. Negative values are accepted on purpose so the tests have a
 * reliable divergence (v12 rejects them).
 */
export interface PieFixtureModel {
  title: string;
  showData: boolean;
  sections: [string, number][];
}

export function parsePieFixture(text: string): PieFixtureModel {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
  const header = /^pie(\s+showData)?$/.exec(lines.shift() ?? '');
  if (!header) throw new Error('Expected `pie`');
  const model: PieFixtureModel = { title: '', showData: header[1] !== undefined, sections: [] };
  for (const line of lines) {
    const title = /^title\s+(.*)$/.exec(line);
    if (title) {
      model.title = title[1] ?? '';
      continue;
    }
    const section = /^"([^"]*)"\s*:\s*(-?\d+(?:\.\d+)?)$/.exec(line);
    if (!section) throw new Error(`Unexpected line: ${line}`);
    const label = section[1] ?? '';
    if (!model.sections.some(([l]) => l === label)) {
      model.sections.push([label, Number(section[2])]);
    }
  }
  return model;
}

interface PieDbLike {
  getDiagramTitle(): string;
  getShowData(): boolean;
  getSections(): Map<string, number>;
}

export const pieFixtureAdapter: DiagramAdapter<PieFixtureModel> = {
  id: 'pie-fixture',
  v12Types: ['pie'],
  detect: (text) => /^\s*pie\b/.test(text),
  parse: parsePieFixture,
  normaliseV13: (model) => model,
  normaliseV12: (db) => {
    const pie = db as PieDbLike;
    return {
      title: pie.getDiagramTitle(),
      showData: pie.getShowData(),
      sections: [...pie.getSections()],
    };
  },
};
