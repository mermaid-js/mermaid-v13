/**
 * Test-only adapter for the ported v12 event modeling specs (R-TEST-3), backed by the v13
 * parse. The specs' expectations are kept as v12 wrote them; this file only translates names and
 * shapes:
 *
 * - `parser`, `db` and `mermaidAPI` stand for v12's event modeling parser, its DB and
 *   `mermaidAPI.parse`: `parse` rejects with the first error's message (v12's thrown duplicate
 *   id, word for word), and `db.getState()` gives the boxes and relations v12 built, from
 *   `eventModelStructure` (each box's `frame.name` and `swimlane.index`), or throws v12's
 *   `No data for EventModel` after a failed parse;
 * - `SVGElement` is a stand-in for the DOM class the diagram spec patches `getBBox` on (v12 ran
 *   it in jsdom); v13 measures nothing at parse;
 * - `eventModelingParse` stands for the parser package's Langium `parse` helper: lexer and
 *   parser errors from the diagnostics, and `value` with Langium's lists and field names
 *   (`frames`, `dataEntities`, `noteEntities`, `gwtEntities`; a frame's `name`,
 *   `modelEntityType`, `entityIdentifier`, `$type`, `sourceFrames`);
 * - `EventModelingValidator` stands for v12's validator: its check on a mock frame builds that
 *   frame and its sources as text and reports v13's `EVENTMODELING_INVALID_SOURCE` warning,
 *   one message per case (D525).
 */
import { EVENTMODELING_INVALID_SOURCE } from '../codes.ts';
import type { EventModel } from '../model.ts';
import { parseEventModel } from '../parser/index.ts';
import { eventModelStructure } from '../structure.ts';

/** The model, or a throw with the first error's message (v12's parse rejected). */
function modelOf(text: string): EventModel {
  const result = parseEventModel(text);
  const error = result.diagnostics.find((d) => d.severity === 'error');
  if (error) throw new Error(error.message);
  return result.model;
}

let current: EventModel | undefined;

/** A box as v12's spec reads it. */
interface ShownBox {
  frame: { name: string };
  swimlane: { index: number; label: string };
}

export const parser = {
  parse: (text: string): Promise<void> => {
    // v12's `setAst` dropped the last AST before it checked the new one.
    current = undefined;
    try {
      current = modelOf(text);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error as Error);
    }
  },
};

export const db = {
  clear(): void {
    current = undefined;
  },
  getState(): {
    boxes: ShownBox[];
    relations: { sourceBox: ShownBox | undefined; targetBox: ShownBox | undefined }[];
    sortedSwimlanesArray: { index: number; label: string }[];
  } {
    const model = current;
    if (!model) throw new Error('No data for EventModel');
    const { lanes, boxes, relations } = eventModelStructure(model);
    const shown: ShownBox[] = boxes.map((b) => ({
      frame: { name: model.frames[b.frame]?.id ?? '' },
      swimlane: { index: lanes[b.lane]?.index ?? -1, label: lanes[b.lane]?.label ?? '' },
    }));
    return {
      boxes: shown,
      relations: relations.map((r) => ({ sourceBox: shown[r.source], targetBox: shown[r.target] })),
      sortedSwimlanesArray: lanes.map((l) => ({ index: l.index, label: l.label })),
    };
  },
};

export const mermaidAPI = {
  parse: (text: string): Promise<{ diagramType: string }> => {
    try {
      modelOf(text);
      return Promise.resolve({ diagramType: 'eventmodeling' });
    } catch (error) {
      return Promise.reject(error as Error);
    }
  },
};

/** The DOM class v12's spec patches; v13 measures no text at parse. */
export class SVGElement {}

/** Langium's parse result for the parser package's spec. */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- test adapter; the ported spec is untyped
export function eventModelingParse(text: string) {
  const result = parseEventModel(text);
  const lexical = new Set(['UNEXPECTED_CHARACTER', 'UNCLOSED_DATA', 'UNCLOSED_STRING']);
  const errors = result.diagnostics.filter((d) => d.severity === 'error');
  const { model } = result;
  return {
    lexerErrors: errors.filter((d) => lexical.has(d.code)),
    parserErrors: errors.filter((d) => !lexical.has(d.code)),
    value: {
      frames: model.frames.map((f) => ({
        $type: f.reset ? 'EmResetFrame' : 'EmTimeFrame',
        name: f.id,
        modelEntityType: f.keyword,
        entityIdentifier: f.name,
        sourceFrames: f.sources.map((s) => ({ $refText: s })),
      })),
      dataEntities: model.dataBlocks,
      noteEntities: model.notes,
      gwtEntities: model.gwts,
      modelEntities: model.entities,
    },
  };
}

interface MockFrame {
  modelEntityType: string;
  sourceFrames: { ref?: MockFrame }[];
}

/** v12's validator, checked on the text of a mock frame and its sources. */
export class EventModelingValidator {
  checkSourceFrameTypes(
    frame: MockFrame,
    accept: (severity: string, message: string, info: unknown) => void
  ): void {
    const sources = frame.sourceFrames.map(
      (s, k) => `tf ${k + 1} ${s.ref?.modelEntityType ?? 'evt'} Source${k}`
    );
    const arrows = frame.sourceFrames.map((_, k) => ` ->> ${k + 1}`).join('');
    const target = `tf ${sources.length + 1} ${frame.modelEntityType} Target${arrows}`;
    const text = ['eventmodeling', ...sources, target].join('\n');
    const warning = parseEventModel(text).diagnostics.find(
      (d) => d.code === EVENTMODELING_INVALID_SOURCE
    );
    if (!warning) return;
    for (const message of [warning.message, ...(warning.related ?? []).map((r) => r.message)]) {
      accept('error', message, { node: frame, property: 'sourceFrames' });
    }
  }
}

/** Langium's registration (its test is skipped in the port: v13 has no validation registry). */
export function registerValidationChecks(): void {
  // Nothing to register: v13's checks run in the parser (D525).
}
