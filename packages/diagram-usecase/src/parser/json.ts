/**
 * The object of a `json Id@{ … }` statement, as v12 read it (`usecaseJson.ts`): `JSON.parse`
 * gives the value (a repeated key keeps its last value) and a walk of the text gives each
 * object's key order by JSON Pointer (a repeated key keeps its first place, its earlier subtree
 * dropped). The walk also checks the text first, so an invalid object is reported at the offset
 * where it goes wrong, in every engine (v12 read the offset out of V8's `JSON.parse` message).
 * The walk is one pass over the text (R-PARSE-7).
 */
import type { UsecaseJsonRow } from '../model.ts';

export interface OrderedJson {
  value: Record<string, unknown>;
  propertyOrder: Record<string, string[]>;
}

/** Where the text stops being JSON, and what was expected there (for the message). */
export interface JsonProblem {
  offset: number;
  expected: string;
}

/** Where the walk found the text invalid (thrown inside the walk, caught by its caller). */
class Invalid extends Error {
  constructor(
    readonly offset: number,
    readonly expected: string
  ) {
    super(expected);
  }
}

/** The first character code a JSON string may hold unescaped. */
const FIRST_PLAIN = 0x20;

/** The object `text` holds, or where it is invalid. */
export function parseOrderedJson(text: string): OrderedJson | JsonProblem {
  let propertyOrder: Record<string, string[]>;
  try {
    propertyOrder = new OrderWalk(text).collect();
  } catch (error) {
    if (error instanceof Invalid) return { offset: error.offset, expected: error.expected };
    throw error;
  }
  return { value: JSON.parse(text) as Record<string, unknown>, propertyOrder };
}

const escapePointer = (part: string): string => part.replaceAll('~', '~0').replaceAll('/', '~1');

const isDigit = (c: string | undefined): boolean => c !== undefined && c >= '0' && c <= '9';

/** v12's `PropertyOrderCollector`, which throws {@link Invalid} where the text goes wrong. */
class OrderWalk {
  private offset = 0;
  /**
   * Each object's keys, in the order the objects were read, and where each pointer's live
   * entry is. A dropped entry is marked, not deleted: deleting from a large map or object
   * costs V8 a rehash every few times, which made many repeated keys quadratic.
   */
  private readonly entries: { pointer: string; keys: string[]; live: boolean }[] = [];
  private readonly entryAt = new Map<string, number>();
  /** The pointers of the objects and arrays read under each pointer, to drop a subtree. */
  private readonly kids = new Map<string, string[]>();

  constructor(private readonly text: string) {}

  collect(): Record<string, string[]> {
    this.blanks();
    this.value('');
    this.blanks();
    if (this.offset !== this.text.length) throw new Invalid(this.offset, 'the end of the object');
    return Object.fromEntries(this.entries.filter((e) => e.live).map((e) => [e.pointer, e.keys]));
  }

  private value(pointer: string): void {
    this.blanks();
    const c = this.text[this.offset];
    if (c === '{' || c === '[') {
      const parent = pointer.slice(0, Math.max(0, pointer.lastIndexOf('/')));
      if (pointer !== '') {
        const list = this.kids.get(parent);
        if (list) list.push(pointer);
        else this.kids.set(parent, [pointer]);
      }
      if (c === '{') this.object(pointer);
      else this.array(pointer);
    } else if (c === '"') this.string(false);
    else if (c === 't') this.literal('true');
    else if (c === 'f') this.literal('false');
    else if (c === 'n') this.literal('null');
    else if (c === '-' || isDigit(c)) this.number();
    else throw new Invalid(this.offset, 'a value');
  }

  private object(pointer: string): void {
    this.offset++;
    const keys: string[] = [];
    const seen = new Set<string>();
    this.entryAt.set(pointer, this.entries.push({ pointer, keys, live: true }) - 1);
    this.blanks();
    if (this.text[this.offset] === '}') {
      this.offset++;
      return;
    }
    while (this.offset < this.text.length) {
      if (this.text[this.offset] !== '"') {
        throw new Invalid(this.offset, 'a key in double quotes');
      }
      const key = this.string(true);
      const child = `${pointer}/${escapePointer(key)}`;
      if (seen.has(key)) this.dropSubtree(child);
      else {
        seen.add(key);
        keys.push(key);
      }
      this.blanks();
      if (this.text[this.offset] !== ':') throw new Invalid(this.offset, '`:` after the key');
      this.offset++;
      this.value(child);
      this.blanks();
      if (this.text[this.offset] === '}') {
        this.offset++;
        return;
      }
      if (this.text[this.offset] !== ',') throw new Invalid(this.offset, '`,` or `}`');
      this.offset++;
      this.blanks();
    }
    throw new Invalid(this.offset, 'a key in double quotes');
  }

  private array(pointer: string): void {
    this.offset++;
    this.blanks();
    if (this.text[this.offset] === ']') {
      this.offset++;
      return;
    }
    let index = 0;
    while (this.offset < this.text.length) {
      this.value(`${pointer}/${index++}`);
      this.blanks();
      if (this.text[this.offset] === ']') {
        this.offset++;
        return;
      }
      if (this.text[this.offset] !== ',') throw new Invalid(this.offset, '`,` or `]`');
      this.offset++;
      this.blanks();
    }
    throw new Invalid(this.offset, 'a value');
  }

  /** A string from its opening quote; its decoded text when `decode` (a key). */
  private string(decode: boolean): string {
    const { text } = this;
    this.offset++;
    let out = '';
    while (this.offset < text.length) {
      const at = this.offset;
      const c = text[this.offset++] ?? '';
      if (c === '"') return out;
      if (c.charCodeAt(0) < FIRST_PLAIN)
        throw new Invalid(at, 'no line break or control character');
      if (c !== '\\') {
        if (decode) out += c;
        continue;
      }
      const escapeAt = this.offset;
      const e = text[this.offset++];
      if (e === '"' || e === '\\' || e === '/') out += decode ? e : '';
      else if (e === 'b') out += decode ? '\b' : '';
      else if (e === 'f') out += decode ? '\f' : '';
      else if (e === 'n') out += decode ? '\n' : '';
      else if (e === 'r') out += decode ? '\r' : '';
      else if (e === 't') out += decode ? '\t' : '';
      else if (e === 'u') {
        const unit = text.slice(this.offset, this.offset + 4);
        if (!/^[\dA-Fa-f]{4}$/.test(unit)) throw new Invalid(this.offset, 'four hex digits');
        if (decode) out += String.fromCharCode(Number.parseInt(unit, 16));
        this.offset += 4;
      } else throw new Invalid(escapeAt, 'an escape such as `\\n` or `\\"`');
    }
    throw new Invalid(this.offset, 'the closing `"`');
  }

  private literal(word: string): void {
    for (let k = 0; k < word.length; k++) {
      if (this.text[this.offset + k] !== word[k]) {
        throw new Invalid(this.offset + k, `\`${word}\``);
      }
    }
    this.offset += word.length;
  }

  private number(): void {
    const { text } = this;
    if (text[this.offset] === '-') this.offset++;
    if (text[this.offset] === '0') this.offset++;
    else if (isDigit(text[this.offset]) && text[this.offset] !== '0') {
      while (isDigit(text[this.offset])) this.offset++;
    } else throw new Invalid(this.offset, 'a digit');
    if (text[this.offset] === '.') {
      this.offset++;
      if (!isDigit(text[this.offset])) throw new Invalid(this.offset, 'a digit');
      while (isDigit(text[this.offset])) this.offset++;
    }
    if (text[this.offset] === 'e' || text[this.offset] === 'E') {
      this.offset++;
      if (text[this.offset] === '+' || text[this.offset] === '-') this.offset++;
      if (!isDigit(text[this.offset])) throw new Invalid(this.offset, 'a digit');
      while (isDigit(text[this.offset])) this.offset++;
    }
  }

  private blanks(): void {
    const { text } = this;
    while (this.offset < text.length) {
      const c = text[this.offset];
      if (c !== ' ' && c !== '\t' && c !== '\n' && c !== '\r') return;
      this.offset++;
    }
  }

  /**
   * Forget the order recorded at and under `pointer` (a repeated key's earlier value): each
   * object or array read is visited at most once, however often its key repeats.
   */
  private dropSubtree(pointer: string): void {
    const stack = [pointer];
    for (let p = stack.pop(); p !== undefined; p = stack.pop()) {
      const entry = this.entries[this.entryAt.get(p) ?? -1];
      if (entry) entry.live = false;
      const below = this.kids.get(p);
      if (!below) continue;
      stack.push(...below);
      below.length = 0;
    }
  }
}

/** A JSON scalar's cell text. */
function scalar(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null) return 'null';
  return String(value as number | boolean);
}

/**
 * The table rows of a JSON object (v12's `flattenJsonRows`): one row per scalar, keyed by its
 * dotted path (`items[0].name`); a scalar array is one row per item, the key on the first only;
 * an empty array or object is one row (`[]`, `{}`).
 */
export function jsonRows(
  value: Record<string, unknown>,
  propertyOrder: Readonly<Record<string, readonly string[]>>
): UsecaseJsonRow[] {
  const rows: UsecaseJsonRow[] = [];
  const add = (key: string, accessibleKey: string, cell: string) =>
    rows.push({ key, accessibleKey, value: cell });
  const visit = (current: unknown, path: string, pointer: string): void => {
    if (Array.isArray(current)) {
      if (current.length === 0) {
        add(path, path, '[]');
        return;
      }
      const scalars = current.every(
        (item) => item === null || ['string', 'number', 'boolean'].includes(typeof item)
      );
      current.forEach((item: unknown, index) => {
        if (scalars) add(index === 0 ? path : '', path, scalar(item));
        else visit(item, `${path}[${index}]`, `${pointer}/${index}`);
      });
      return;
    }
    if (current !== null && typeof current === 'object') {
      const object = current as Record<string, unknown>;
      const keys = propertyOrder[pointer] ?? Object.keys(object);
      if (keys.length === 0) {
        add(path, path, '{}');
        return;
      }
      for (const key of keys) {
        visit(object[key], path ? `${path}.${key}` : key, `${pointer}/${escapePointer(key)}`);
      }
      return;
    }
    add(path, path, scalar(current));
  };
  visit(value, '', '');
  return rows;
}
