/**
 * Lanes, boxes and relations of an event model, without geometry: what v12's `getState()`
 * (`db.ts`) decided while it placed the boxes, in its order. Pure and linear; the layout (#604)
 * places these, and model parity (#602) compares them with v12's.
 *
 * Kept from v12: the three bands (`UI/Automation` 0, `Command/Read Model` 100, `Events` 200), a
 * namespace lane for a two-part name `ns.X` at the band's next free index (`UI/A: ns`,
 * `C/RM: ns`, `Stream: ns`); lanes in index order; the box content (the name after the dot of a
 * two-part name, the whole name otherwise, then the data); relations in frame order: a frame's
 * `->>` sources that are placed already (earlier frames, or itself), each once, in frame order;
 * a frame with none from the nearest earlier box in another lane, except the first frame and
 * reset frames.
 *
 * Changed from v12, as decided: one lane per band and namespace (D522), where v12 opened a new
 * lane for every namespaced frame; the data text between the braces or quotes (D523,
 * `EventModelData.text`).
 */
import type { AstId } from '@mermaid-js/core/parser-kit';
import type { EventModel, EventModelFrame, EventModelKind } from './model.ts';

/** The three bands: index of their default lane, its label, and a namespace lane's prefix. */
const BANDS = {
  trigger: [0, 'UI/Automation', 'UI/A: '],
  state: [100, 'Command/Read Model', 'C/RM: '],
  stream: [200, 'Events', 'Stream: '],
} as const;

export type EventModelBand = keyof typeof BANDS;

const BAND_OF: Readonly<Record<EventModelKind, EventModelBand>> = {
  ui: 'trigger',
  pcr: 'trigger',
  cmd: 'state',
  rmo: 'state',
  evt: 'stream',
};

export interface EventModelLane {
  /** v12's swimlane index: 0, 100, 200, or the next after them for a namespace. */
  readonly index: number;
  readonly label: string;
  readonly band: EventModelBand;
  /** The namespace of a namespace lane. */
  readonly namespace?: string;
}

export interface EventModelBox {
  /** The frame's index in `model.frames`. */
  readonly frame: number;
  /** Index into {@link EventModelStructure.lanes}. */
  readonly lane: number;
  /** The bold name: the part after the dot of a two-part name, else the whole name. */
  readonly name: string;
  /** The data shown under it (D523): a `[[ref]]`'s first data block, else the inline data. */
  readonly data?: string;
}

export interface EventModelRelation {
  /** Frame indices in `model.frames`. */
  readonly source: number;
  readonly target: number;
  /** No `->>` wrote it: from the nearest earlier box in another lane. */
  readonly inferred: boolean;
  /** The AST id of the `->>` that wrote it (`relation:<source>-><target>`); none when inferred. */
  readonly astId?: AstId;
}

export interface EventModelStructure {
  /** In index order (v12's `sortedSwimlanesArray`). */
  readonly lanes: readonly EventModelLane[];
  /** One per frame, in frame order. */
  readonly boxes: readonly EventModelBox[];
  /** In v12's order: by target frame, then by source frame order. */
  readonly relations: readonly EventModelRelation[];
}

/** The lanes, boxes and relations of `model` (see the module comment). */
export function eventModelStructure(model: EventModel): EventModelStructure {
  const { frames } = model;
  const byKey = new Map<string, EventModelLane>();
  /** The next namespace index per band. */
  const next = new Map<EventModelBand, number>();
  const laneOf: EventModelLane[] = [];
  const firstData = new Map<string, string>();
  for (const d of model.dataBlocks) if (!firstData.has(d.name)) firstData.set(d.name, d.data.text);

  const boxes: { frame: number; lane: EventModelLane; name: string; data?: string }[] = [];
  for (const [frame, f] of frames.entries()) {
    const band = BAND_OF[f.kind];
    const parts = f.name.split('.');
    const namespace = parts.length === 2 ? parts[0] : undefined;
    const key = namespace === undefined ? band : `${band} ${namespace}`;
    let lane = byKey.get(key);
    if (!lane) {
      const [first, label, prefix] = BANDS[band];
      if (namespace === undefined) lane = { index: first, label, band };
      else {
        const index = next.get(band) ?? first + 1;
        next.set(band, index + 1);
        lane = { index, label: prefix + namespace, band, namespace };
      }
      byKey.set(key, lane);
    }
    laneOf.push(lane);
    boxes.push({
      frame,
      lane,
      name: parts.length === 2 ? (parts[1] ?? '') : f.name,
      ...content(f, firstData),
    });
  }

  const lanes = [...byKey.values()].sort((a, b) => a.index - b.index);
  const at = new Map(lanes.map((l, k) => [l, k]));
  return {
    lanes,
    boxes: boxes.map((b) => ({ ...b, lane: at.get(b.lane) ?? 0 })),
    relations: relations(frames, laneOf),
  };
}

/** The box's data: a defined reference wins over the inline data (v12 overwrote it). */
function content(f: EventModelFrame, firstData: ReadonlyMap<string, string>): { data?: string } {
  const ref = f.dataRef === undefined ? undefined : firstData.get(f.dataRef);
  if (ref !== undefined) return { data: ref };
  return f.data ? { data: f.data.text } : {};
}

/** v12's `decidePositionRelation`, frame by frame. */
function relations(
  frames: readonly EventModelFrame[],
  laneOf: readonly EventModelLane[]
): EventModelRelation[] {
  const out: EventModelRelation[] = [];
  /** Each id's first frame (a repeated id is an error). */
  const firstOf = new Map<string, number>();
  for (const [k, f] of frames.entries()) if (!firstOf.has(f.id)) firstOf.set(f.id, k);
  /**
   * Where the run of boxes in one lane that ends at each frame starts: the nearest earlier box
   * in another lane is the one before the run (v12 scanned back box by box, quadratic when a
   * lane holds many in a row).
   */
  const runStart: number[] = [];
  for (const [target, f] of frames.entries()) {
    runStart.push(
      target > 0 && laneOf[target - 1] === laneOf[target] ? (runStart[target - 1] ?? 0) : target
    );
    if (f.sources.length > 0) {
      // v12 filtered the frames by the ids named, so each source counts once, in frame order;
      // only those placed already have a box.
      const named = new Set(f.sources);
      const sources = [...named]
        .map((id) => firstOf.get(id))
        .filter((k): k is number => k !== undefined && k <= target)
        .sort((a, b) => a - b);
      for (const source of sources) {
        const id = frames[source]?.id ?? '';
        out.push({ source, target, inferred: false, astId: relationId(f, id) });
      }
      continue;
    }
    if (target === 0 || f.reset) continue;
    const before = target - 1;
    const source = laneOf[before] === laneOf[target] ? (runStart[before] ?? 0) - 1 : before;
    if (source >= 0) out.push({ source, target, inferred: true });
  }
  return out;
}

/** The AST id of the first `->> source` of frame `f` (`relation:<source>-><target>`). */
function relationId(f: EventModelFrame, source: string): AstId {
  return `relation:${source}->${f.id}`;
}
