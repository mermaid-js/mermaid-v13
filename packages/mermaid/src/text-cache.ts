// The analyses of recent diagram texts (DESIGN §3), each valid only for the config snapshot it
// was made with.

const CACHE_SIZE = 32;
// V8 hashes a string of this length or more by its length alone, so long sources of one length
// (the bench's `%% run N` copies) would share a hash and compare almost to their ends (#276).
const LONG = 16_384;
const SAMPLES = 256;

/** The key of `text`: itself, or for a long one its length and a hash of sampled characters. */
function cacheKey(text: string): string {
  const n = text.length;
  if (n < LONG) return text;
  let h = 0x811c9dc5;
  const step = Math.floor(n / SAMPLES);
  for (let i = 0; i < n; i += step) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  for (let i = Math.max(0, n - 64); i < n; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return `${n}:${h >>> 0}`;
}

/**
 * The last 32 texts' values, by text and snapshot. Two long texts that share a key replace each
 * other: a hit always compares the whole text.
 */
export class TextCache<S, V> {
  private readonly entries = new Map<string, { text: string; snap: S; value: V }>();

  get(text: string, snap: S): V | undefined {
    const hit = this.entries.get(cacheKey(text));
    return hit && hit.snap === snap && hit.text === text ? hit.value : undefined;
  }

  set(text: string, snap: S, value: V): void {
    const key = cacheKey(text);
    this.entries.delete(key);
    this.entries.set(key, { text, snap, value });
    if (this.entries.size > CACHE_SIZE) this.entries.delete(this.entries.keys().next().value!);
  }

  clear(): void {
    this.entries.clear();
  }
}
