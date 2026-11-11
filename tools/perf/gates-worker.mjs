/** One reusable isolated gate worker; the owner enforces a per-diagram deadline. */
import { parentPort, workerData } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
const engines = await Promise.all(
  workerData.entries.map((entry, index) => import(`${pathToFileURL(entry).href}?gate=${index}`))
);
for (const engine of engines) engine.configure();
parentPort.on('message', async ({ source, index }) => {
  try {
    const outputs = [];
    for (const engine of engines) {
      await engine.setup(source);
      engine.reset();
      outputs.push(engine.render(source, index));
    }
    parentPort.postMessage({ outputs });
  } catch (error) {
    parentPort.postMessage({ error: String(error) });
  }
});
