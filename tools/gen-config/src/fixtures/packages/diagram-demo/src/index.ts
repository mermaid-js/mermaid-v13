import { theme } from './theme/table.ts';

/** A fixture plugin: the tools find its table as a first-party package's (`plugin.theme`). */
export const demo = { id: 'demo', render: (): void => undefined, theme };
