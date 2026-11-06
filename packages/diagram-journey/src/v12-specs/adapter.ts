/**
 * Test-only adapter for the ported v12 journey spec (R-TEST-3): v12's `journey.jison` parser
 * and `journeyDb`, backed by the v13 parse. The spec's expectations are kept as v12 wrote them;
 * this file only translates names and shapes:
 *
 * - `parser.parse(text)` throws on an error diagnostic, else loads the model into `parser.yy`
 *   (the spec sets it to `journeyDb`);
 * - `journeyDb` answers from the last loaded model as v12's DB did: tasks as
 *   `{ score, people, section, type, task }` (`type` is the section), `''` for an unset title.
 */
import type { JourneyModel } from '../model.ts';
import { parseJourney } from '../parser/index.ts';

let last: JourneyModel | undefined;

export const journeyDb = {
  load(model: JourneyModel): void {
    last = model;
  },
  clear(): void {
    last = undefined;
  },
  getDiagramTitle: (): string => last?.title ?? '',
  getAccTitle: (): string => last?.accTitle ?? '',
  getAccDescription: (): string => last?.accDescr ?? '',
  getSections: (): string[] => last?.sections.map((s) => s.name) ?? [],
  getTasks: (): {
    score: number;
    people: string[];
    section: string;
    type: string;
    task: string;
  }[] =>
    last?.tasks.map((t) => ({
      score: t.score,
      people: [...t.people],
      section: t.section,
      type: t.section,
      task: t.name,
    })) ?? [],
  getActors: (): string[] => [...(last?.actors ?? [])],
};

export const parser = {
  yy: journeyDb as { load?(model: JourneyModel): void },
  parse(text: string): void {
    const result = parseJourney(text);
    const error = result.diagnostics.find((d) => d.severity === 'error');
    if (error) throw new Error(error.message);
    parser.yy.load?.(result.model);
  },
};
