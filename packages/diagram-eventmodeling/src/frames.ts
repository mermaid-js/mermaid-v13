/** Shared by the parser's normaliser and `eventModelStructure`. */
import type { EventModelFrame } from './model.ts';

/** Each frame id's first frame, by its index in `frames` (a repeated id is an error). */
export function firstFrameAt(frames: readonly Pick<EventModelFrame, 'id'>[]): Map<string, number> {
  const at = new Map<string, number>();
  for (const [k, f] of frames.entries()) if (!at.has(f.id)) at.set(f.id, k);
  return at;
}
