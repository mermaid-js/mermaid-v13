/**
 * Task-id symbols (R-LANG-8, #382): where a gantt task id is defined and mentioned, as v12's DB
 * reads them. A task's data names its id when it has three fields (the first, v12 `parseData`;
 * with more v12 reads neither id nor dates); its start field may be `after <ids>` (v12
 * `getStartDate`), its end field `until <ids>` (`getEndDate`); a `click` names ids split on `,`
 * (`setLink`, `setClickEvent`).
 */
import type { ParseState } from '@mermaid-js/core/parser-kit';

/** v12 `getStartDate`/`getEndDate`: `after <ids>` (a start) or `until <ids>` (an end). */
const AFTER = /^after\s+([\d\w- ]+)/;
const UNTIL = /^until\s+([\d\w- ]+)/;

/**
 * The id v12's plain-object `taskDb` never stores (assigning it sets the prototype), so nothing
 * finds a task by it; the schedule and layout skip it too.
 */
export const NEVER_STORED = '__proto__';

/** A task-id occurrence; `start` is relative to its token until it is recorded. */
interface Mention {
  name: string;
  start: number;
  role: 'def' | 'ref';
}

/** Whether `name` is `task<n>`, an id v12 gave one of the first `count` tasks without one. */
function isAutoId(name: string, count: number): boolean {
  const m = /^task([1-9]\d*)$/.exec(name);
  return m !== null && Number(m[1]) <= count;
}

/**
 * The ids `re` finds in `field` (trimmed, at offset `at`), split on blanks as v12 did, pushed
 * onto `out`.
 */
function refsIn(field: string | undefined, at: number | undefined, re: RegExp, out: Mention[]) {
  const m = field === undefined ? null : re.exec(field);
  if (!m || at === undefined) return;
  const ids = m[1] ?? '';
  let p = at + m[0].length - ids.length;
  for (const name of ids.split(' ')) {
    if (name !== '') out.push({ name, start: p, role: 'ref' });
    p += name.length + 1;
  }
}

/** The task-id occurrences of one parse, collected in source order. */
export class TaskIds {
  private readonly mentions: Mention[] = [];
  /** Names some mention of which is not where the source has it (a removed span cut it). */
  private readonly unmapped = new Set<string>();

  private add(base: number | undefined, found: readonly Mention[]): void {
    if (base === undefined) for (const m of found) this.unmapped.add(m.name);
    else for (const m of found) this.mentions.push({ ...m, start: base + m.start });
  }

  /**
   * A task's data: `fields` (after the tags, trimmed) start at `at` in the data, which starts
   * at source offset `base` (undefined when the data is not written as v12 read it).
   */
  task(base: number | undefined, fields: readonly string[], at: readonly number[]): void {
    if (fields.length > 3) return;
    const found: Mention[] = [];
    const many = fields.length === 3;
    const id = fields[0] ?? '';
    if (many && id !== '') found.push({ name: id, start: at[0] ?? 0, role: 'def' });
    let start = -1;
    if (many) start = 1;
    else if (fields.length === 2) start = 0;
    const end = many ? 2 : fields.length - 1;
    refsIn(fields[start], at[start], AFTER, found);
    refsIn(fields[end], at[end], UNTIL, found);
    this.add(base, found);
  }

  /** The ids of a `click`, written at source offset `base` (as for {@link task}). */
  click(base: number | undefined, ids: readonly string[]): void {
    const found: Mention[] = [];
    let p = 0;
    for (const name of ids) {
      if (name !== '') found.push({ name, start: p, role: 'ref' });
      p += name.length + 1;
    }
    this.add(base, found);
  }

  /**
   * Record the symbols (kind `task`) in source order. v12 looks an id up last-wins (`taskDb`),
   * so the last task written with an id is its definition and earlier ones mention it. A name
   * v12 also gives a task without an id (`task<n>`, of the first `autoIds` tasks) is no symbol:
   * that task could not be renamed with its mentions. Nor is a name a removed span cuts, nor
   * {@link NEVER_STORED}.
   */
  record(st: ParseState, autoIds: number): void {
    const last = new Map<string, Mention>();
    for (const m of this.mentions) if (m.role === 'def') last.set(m.name, m);
    for (const m of this.mentions) {
      if (this.unmapped.has(m.name) || isAutoId(m.name, autoIds) || m.name === NEVER_STORED) {
        continue;
      }
      const role = m.role === 'def' && last.get(m.name) !== m ? 'ref' : m.role;
      st.symbol(m.name, 'task', { start: m.start, end: m.start + m.name.length }, role);
    }
  }
}
