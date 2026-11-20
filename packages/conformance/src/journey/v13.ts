/**
 * The v13 side of journey parity: the journey parser and the normaliser from its
 * `JourneyModel` to the {@link JourneySnapshot} that `v12.ts` takes from mermaid\@12's DB.
 */
import { detectJourney, parseJourney } from '@mermaid-js/diagram-journey';
import type { JourneyModel } from '@mermaid-js/diagram-journey';
import { parseForParity } from '../parity-parse.ts';
import type { DiagramAdapter } from '../types.ts';
import { JOURNEY_V12_TYPES, journeyV12Snapshot } from './v12.ts';
import type { JourneySnapshot } from './v12.ts';

export function journeyV13Snapshot(model: JourneyModel): JourneySnapshot {
  return {
    title: model.title ?? '',
    accTitle: model.accTitle,
    accDescr: model.accDescr,
    sections: model.sections.map((s) => s.name),
    tasks: model.tasks.map((t) => ({
      name: t.name,
      score: t.score,
      people: [...t.people],
      section: t.section,
    })),
    actors: [...model.actors],
  };
}

/**
 * v13 parse for parity: the model, or a throw carrying the first error diagnostic. The
 * front-matter title is held back, as the oracle never passes front matter to v12; the D218
 * fallback has its own specs in the journey package.
 */
export const parseJourneyForParity = (text: string): JourneyModel =>
  parseForParity(text, parseJourney, { withoutTitle: true });

export const journeyAdapter: DiagramAdapter<JourneyModel> = {
  id: 'journey',
  v12Types: JOURNEY_V12_TYPES,
  detect: (text) => detectJourney(text),
  parse: parseJourneyForParity,
  normaliseV13: journeyV13Snapshot,
  normaliseV12: journeyV12Snapshot,
};
