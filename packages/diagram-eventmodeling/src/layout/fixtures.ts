// cspell:words gwts
/**
 * Hand-built event models for the layout's unit specs (as treemap's `layout/fixtures.ts`), and a
 * measurer whose widths are easy to work by hand: every character is half the font size wide,
 * a line is the font size high.
 */
import type { Measurer } from '@mermaid-js/core/text';
import type { EventModel, EventModelFrame, EventModelKind } from '../model.ts';

/** Every character half an em wide, whatever its style. */
export const halfEm: Measurer = {
  id: 'half-em',
  width: (text, font) => ([...text].length * font.size) / 2,
  metrics: (font) => ({ ascent: font.size * 0.8, descent: font.size * 0.2, lineHeight: font.size }),
};

/** A frame; {@link model} gives it its id. */
export function frame(
  kind: EventModelKind,
  name: string,
  extra: Partial<Omit<EventModelFrame, 'id' | 'astId'>> = {}
): EventModelFrame {
  return { id: '', reset: false, kind, keyword: kind, name, sources: [], astId: '', ...extra };
}

/** A model of `frames`, numbered `01`, `02`, … in order. */
export function model(...frames: EventModelFrame[]): EventModel {
  return {
    frames: frames.map((f, k) => {
      const id = String(k + 1).padStart(2, '0');
      return { ...f, id, astId: `frame:${id}` };
    }),
    entities: [],
    dataBlocks: [],
    notes: [],
    gwts: [],
    accTitle: '',
    accDescr: '',
    warnings: [],
  };
}
