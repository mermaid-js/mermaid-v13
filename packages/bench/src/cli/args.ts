export interface ParsedArgs {
  positional: string[];
  flag(name: string): boolean;
  get(name: string): string | undefined;
  num(name: string, fallback: number): number;
  list(name: string): string[] | undefined;
}

/** Minimal `--name value` / `--flag` parsing for the bench CLIs. */
export function parseArgs(argv: string[]): ParsedArgs {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) {
      positional.push(a);
      continue;
    }
    const [name, inline] = a.slice(2).split('=', 2) as [string, string | undefined];
    const next = argv[i + 1];
    if (inline !== undefined) values.set(name, inline);
    else if (next !== undefined && !next.startsWith('--')) values.set(name, (i++, next));
    else flags.add(name);
  }
  return {
    positional,
    flag: (name: string) => flags.has(name) || values.get(name) === 'true',
    get: (name: string) => values.get(name),
    num: (name: string, fallback: number) => {
      const v = values.get(name);
      return v === undefined ? fallback : Number(v);
    },
    list: (name: string) =>
      values
        .get(name)
        ?.split(',')
        .map((s) => s.trim())
        .filter(Boolean),
  };
}
