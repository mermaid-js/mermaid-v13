// A stand-in pipeline that brackets one stage the way core's pipeline does, plus a lazily
// imported chunk. Used to prove what the production and bench builds contain.
import { installStageClock, stageEnd, stageStart } from '@mermaid-js/core/timing';

export { installStageClock };

export async function render(text: string): Promise<string> {
  const t = stageStart();
  const lines = text.split('\n').length;
  stageEnd('parse', t);
  const { wrap } = await import('./lazy-chunk.ts');
  return wrap(lines);
}
