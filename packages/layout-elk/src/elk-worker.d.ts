// elkjs ships no types for its minified worker build. It is a CommonJS module whose
// `module.exports` is `{ default: FakeWorker, Worker: FakeWorker }` when it loads outside a
// Web Worker (see `exportLayout` in elkjs/lib/elk-worker.js).
declare module 'elkjs/lib/elk-worker.min.js' {
  const workerModule: unknown;
  export default workerModule;
}
