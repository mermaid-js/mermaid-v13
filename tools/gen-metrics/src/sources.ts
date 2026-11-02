import { join } from 'node:path';

export const SYSTEM_FONT_DIR = '/System/Library/Fonts/Supplemental';

export const METRICS_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'packages',
  'core',
  'src',
  'text',
  'metrics.ts'
);

/** Families in v12's default stack order. The table measurer falls back to `arial`. */
export const FONT_FILES = [
  { family: 'trebuchet ms', regular: 'Trebuchet MS.ttf', bold: 'Trebuchet MS Bold.ttf' },
  { family: 'verdana', regular: 'Verdana.ttf', bold: 'Verdana Bold.ttf' },
  { family: 'arial', regular: 'Arial.ttf', bold: 'Arial Bold.ttf' },
] as const;
