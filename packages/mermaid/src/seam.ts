/**
 * The discovered-list seam's state for one API object (D166; see discovery.ts): the first-use
 * source, the registrations still in flight, and the warnings waiting for the next draw.
 * `createMermaid` owns one `DiscoveryQueue` and hands it the registry call.
 */
import type { Warning } from '@mermaid-js/core';
import type { DiscoveredPlugin } from './registry.ts';

/** How long a draw waits for a discovered registration still in flight (D165's import limit). */
const ADD_TIME_LIMIT_MS = 5000;

/** Options of the discovered-list seam's `add`. */
export interface AddOptions {
  /** How long a draw waits for this registration; default 5 s. */
  readonly timeLimitMs?: number;
}

/**
 * A first-use discovery source (see discovery.ts): gets the `initialize()` config and `warn`,
 * which queues a warning for the first render (a package the scan skipped).
 */
export type FirstUseSource = (
  config: Readonly<Record<string, unknown>>,
  warn: (warning: Warning) => void
) => readonly DiscoveredPlugin[] | Promise<readonly DiscoveredPlugin[]>;

/** The discovered-list seam of one API object (see discovery.ts). */
interface Seam {
  add(list: readonly DiscoveredPlugin[], options?: AddOptions): Promise<readonly Warning[]>;
  onFirstUse(source: FirstUseSource, options?: AddOptions): void;
}

/** Whether `p` settles before `deadline` (a time from `Date.now()`). */
function settlesBy(p: Promise<unknown>, deadline: number): Promise<boolean> {
  const left = deadline - Date.now();
  if (left <= 0) return Promise.resolve(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p.then(
      () => true,
      () => true
    ),
    new Promise<boolean>((done) => (timer = setTimeout(() => done(false), left))),
  ]).finally(() => clearTimeout(timer));
}

const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const failed = (message: string): Warning => ({ code: 'PLUGIN_DISCOVERY_FAILED', message });
const late = (limit: number) => `did not finish within ${limit} ms; rendering without it.`;

export class DiscoveryQueue implements Seam {
  /** Discovery's warnings; they leave only once a draw that succeeds has them. */
  readonly skipped: Warning[] = [];
  private firstUse: ((deadline: number) => Promise<void>) | undefined;
  private firstUseLimit = ADD_TIME_LIMIT_MS;
  private ready: Promise<void> | undefined;
  // Additions still registering (the CDN queue's pushes, T6), with the time each one's wait
  // ends: a draw waits for each until then, and renders without it after (one warning).
  private readonly adding = new Map<Promise<unknown>, { deadline: number; limit: number }>();

  /**
   * `register`: the registry's `registerDiscovered`, with the hooks rebuilt after it.
   * `clear`: drops parsed texts. `config`: the `initialize()` config, for the first-use source.
   */
  constructor(
    private readonly register: (list: readonly DiscoveredPlugin[]) => Promise<readonly Warning[]>,
    private readonly clear: () => void,
    private readonly config: () => Readonly<Record<string, unknown>>
  ) {}

  /** Whether a draw must `settle()` first. */
  get pending(): boolean {
    return this.firstUse !== undefined || this.adding.size > 0;
  }

  /** Runs the first-use source once, then waits for each addition until its deadline. */
  async settle(): Promise<void> {
    const start = this.firstUse;
    if (start) {
      // One limit for the source and its registration; past it the draw goes on (see onFirstUse).
      this.ready ??= (async () => {
        const limit = this.firstUseLimit;
        const deadline = Date.now() + limit;
        const run = start(deadline).catch(
          (e: unknown) => void this.skipped.push(failed(`Plugin discovery failed: ${why(e)}`))
        );
        if (!(await settlesBy(run, deadline)))
          this.skipped.push(failed(`Plugin discovery ${late(limit)}`));
      })();
      await this.ready;
    }
    while (this.adding.size > 0) {
      const [pending, { deadline, limit }] = this.adding.entries().next().value!;
      if (!(await settlesBy(pending, deadline)) && this.adding.delete(pending))
        this.skipped.push(failed(`A plugin registration ${late(limit)}`));
    }
  }

  add(
    list: readonly DiscoveredPlugin[],
    { timeLimitMs = ADD_TIME_LIMIT_MS }: AddOptions = {}
  ): Promise<readonly Warning[]> {
    return this.registerBy(list, Date.now() + timeLimitMs, timeLimitMs);
  }

  /** `add`, waited for by draws until `deadline` (`undefined`: not waited for). */
  private registerBy(
    list: readonly DiscoveredPlugin[],
    deadline: number | undefined,
    limit: number
  ): Promise<readonly Warning[]> {
    this.clear();
    // Never rejects; leaves `adding` before its awaiter resumes, so a draw right after it
    // does not wait. The cache is cleared again: a draw during the wait may have filled it.
    const pending: Promise<readonly Warning[]> = this.register(list)
      .then(
        (warnings) => {
          this.skipped.push(...warnings);
          return warnings;
        },
        (e: unknown): readonly Warning[] => {
          const w = failed(`Plugin registration failed: ${why(e)}`);
          this.skipped.push(w);
          return [w];
        }
      )
      .finally(() => {
        this.clear();
        this.adding.delete(pending);
      });
    if (deadline !== undefined) this.adding.set(pending, { deadline, limit });
    return pending;
  }

  onFirstUse(source: FirstUseSource, { timeLimitMs = ADD_TIME_LIMIT_MS }: AddOptions = {}): void {
    if (this.firstUse || this.ready) throw new Error('A first-use discovery source is already set');
    this.firstUseLimit = timeLimitMs;
    this.firstUse = async (deadline) => {
      const list = await source(this.config(), (w) => void this.skipped.push(w));
      void this.registerBy(list, Date.now() < deadline ? deadline : undefined, timeLimitMs);
    };
  }
}

const seams = new WeakMap<object, Seam>();

/** Makes `queue` the seam of `api` (an object `createMermaid` made). */
export function setSeam(api: object, queue: DiscoveryQueue): void {
  seams.set(api, queue);
}

/** The discovered-list seam of `api`, an object `createMermaid` made. */
export function seamOf(api: object): Seam {
  const seam = seams.get(api);
  if (!seam) throw new TypeError('Not a mermaid API object');
  return seam;
}
