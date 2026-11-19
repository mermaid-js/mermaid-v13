/**
 * Synchronous elkjs call (spike E1 #239, D172).
 *
 * elkjs's `ELK.layout()` returns a Promise, but its bundled build lays out in-process: the
 * "FakeWorker" it uses without a real worker hands each message to a `Dispatcher` inside a
 * `setTimeout(…, 0)`, the dispatcher runs the GWT-compiled layout synchronously, and posts the
 * laid-out graph back through `onmessage`, which `ELK` resolves in a second `setTimeout`. Here we
 * skip both timers: we call the dispatcher ourselves and read the answer it posts, before
 * returning. No worker, no timer, no Promise.
 *
 * The worker module is `elkjs/lib/elk-worker.min.js`, the same code `elkjs/lib/elk.bundled.js`
 * (v12 develop's import) wraps.
 */
import type { ElkNode, LayoutOptions } from 'elkjs/lib/elk-api.js';
import elkWorkerModule from 'elkjs/lib/elk-worker.min.js';

/** The algorithms `new ELK()` registers when it is given none. */
const DEFAULT_ALGORITHMS = [
  'layered',
  'stress',
  'mrtree',
  'radial',
  'force',
  'disco',
  'sporeOverlap',
  'sporeCompaction',
  'rectpacking',
] as const;

interface Request {
  id: number;
  cmd: 'register' | 'layout';
  [key: string]: unknown;
}

interface Answer {
  id: number;
  data?: unknown;
  error?: unknown;
}

interface FakeWorker {
  dispatcher: { saveDispatch(event: { data: Request }): void };
  onmessage: ((event: { data: Answer }) => void) | null;
}

type FakeWorkerConstructor = new () => FakeWorker;

export interface LayoutSyncOptions {
  /** Same as `ELK.layout(graph, { layoutOptions })`: options applied to the graph's root. */
  layoutOptions?: LayoutOptions;
}

function fakeWorkerConstructor(): FakeWorkerConstructor {
  const mod = elkWorkerModule as { Worker?: unknown; default?: { Worker?: unknown } } | undefined;
  const ctor = mod?.Worker ?? mod?.default?.Worker;
  if (typeof ctor !== 'function') {
    // elkjs installs itself as the host's `self.onmessage` instead of exporting the
    // FakeWorker when it loads where `document` is undefined and `self` is defined.
    throw new Error('elkjs did not export its in-process worker (is this a Web Worker?)');
  }
  return ctor as FakeWorkerConstructor;
}

// eslint-disable-next-line mermaid/no-module-state -- lazy-load handle: elkjs's in-process worker, created once.
let worker: FakeWorker | undefined;
// eslint-disable-next-line mermaid/no-module-state -- the worker's synchronous reply, cleared before and after each dispatch.
let answer: Answer | undefined;
// eslint-disable-next-line mermaid/no-module-state -- request ids, matched to replies only; they never reach a layout.
let nextId = 0;

/** GWT keeps a nested Java exception under `__java$exception`; flatten it as `ELK` does. */
function flattenGwtError(err: unknown): unknown {
  if (err === null || typeof err !== 'object') return err;
  const record = err as { __java$exception?: { cause?: { backingJsObject?: unknown } } } & {
    cause?: unknown;
  };
  const java = record.__java$exception;
  if (java) {
    if (java.cause?.backingJsObject) record.cause = flattenGwtError(java.cause.backingJsObject);
    delete record.__java$exception;
  }
  return err;
}

function dispatch(target: FakeWorker, request: Omit<Request, 'id'>): unknown {
  const id = nextId++;
  answer = undefined;
  target.dispatcher.saveDispatch({ data: { ...request, id } as Request });
  const reply = answer as Answer | undefined;
  answer = undefined;
  if (reply?.id !== id) throw new Error('elkjs did not answer synchronously');
  if (reply.error !== undefined) throw flattenGwtError(reply.error);
  return reply.data;
}

function getWorker(): FakeWorker {
  if (worker) return worker;
  const created = new (fakeWorkerConstructor())();
  created.onmessage = (event) => {
    answer = event.data;
  };
  dispatch(created, { cmd: 'register', algorithms: [...DEFAULT_ALGORITHMS] });
  worker = created;
  return created;
}

/**
 * Lays out `graph` with elkjs and returns it, synchronously. Like `ELK.layout()` with elkjs's
 * bundled (in-process) worker, it writes the positions into `graph` itself and returns that same
 * object. Errors elkjs reports are thrown, not rejected.
 */
export function layoutSync(graph: ElkNode, options: LayoutSyncOptions = {}): ElkNode {
  const laidOut = dispatch(getWorker(), {
    cmd: 'layout',
    graph,
    layoutOptions: options.layoutOptions ?? {},
    options: { logging: false, measureExecutionTime: false },
  });
  return laidOut as ElkNode;
}
