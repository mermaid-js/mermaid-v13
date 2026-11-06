/**
 * Test-only adapter for the ported v12 timeline spec (R-TEST-3): v12's `timeline.jison` parser,
 * its `timelineDb` and the common DB, backed by the v13 parse. The spec's expectations are
 * kept as v12 wrote them; this file only translates names and shapes:
 *
 * - `timeline.parse(text)` throws on an error diagnostic (v12 threw on a syntax error, and its
 *   DB on an event before any period), else keeps the model for the DB getters;
 * - `timelineDB.getTasks()` returns v12's raw tasks (`id`, `section`, `type`, `task`, `score`,
 *   `events`), `section` and `type` the section's name (`''` before the first one);
 * - `commonDb.getDiagramTitle()` and the accessibility getters read the model.
 *
 * The state lives in this module because v12's DB was a module (test-only; the v13 parser
 * keeps none).
 */
import { parseTimeline } from '../parser/index.ts';
import type { TimelineModel } from '../model.ts';

let model: TimelineModel | undefined;

export const timeline = {
  yy: {} as unknown,
  parse(text: string): void {
    const result = parseTimeline(text);
    const error = result.diagnostics.find((d) => d.severity === 'error');
    if (error) throw new Error(error.message);
    model = result.model;
  },
};

/** v12's raw task, as `getTasks()` returned it. */
interface RawTask {
  id: number;
  section: string;
  type: string;
  task: string;
  score: number;
  events: string[];
}

export const timelineDB = {
  clear(): void {
    model = undefined;
  },
  getDirection: (): string => model?.direction ?? 'LR',
  getSections: (): string[] => model?.sections.map((s) => s.text) ?? [],
  getTasks(): RawTask[] {
    const m = model;
    if (!m) return [];
    return m.periods.map((p, id) => {
      const section = p.section === undefined ? '' : (m.sections[p.section]?.text ?? '');
      return {
        id,
        section,
        type: section,
        task: p.text,
        score: 0,
        events: p.events.map((e) => e.text),
      };
    });
  },
};

export const commonDb = {
  getDiagramTitle: (): string => model?.title ?? '',
  getAccTitle: (): string => model?.accTitle ?? '',
  getAccDescription: (): string => model?.accDescr ?? '',
};

/** v12's logger switch: v13 parses without a logger. */
export function setLogLevel(): void {
  // Nothing to set.
}
