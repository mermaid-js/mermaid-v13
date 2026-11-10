import { describe, expect, it } from 'vitest';
import { draw } from './ascii/usecase.fixtures.ts';
import { usecaseLabels } from './labels.ts';
import { ASCII_QUOTES } from './layout/sizing.ts';
import { parseUsecase } from './parser/index.ts';
import { usecase } from './plugin.ts';

const SRC =
  'usecase-beta\nactor A <<Staff>>\nB <<Core>>\nA --> B\nB ..> : include C\nC -- "pays" --> D';

/** Every label text a layout measured: stereotypes, names and relationship labels. */
const measured = (layout: Awaited<ReturnType<typeof draw>>['layout']): string[] => {
  const p = layout.usecase!;
  const text = (l?: { lines: readonly (readonly { text: string }[])[] }) =>
    l ? l.lines.map((line) => line.map((r) => r.text).join('')).join(' ') : undefined;
  return [
    ...[...p.nodes.values()].flatMap((v) =>
      v.kind === 'actor' || v.kind === 'usecase' ? [text(v.label), text(v.stereotype)] : []
    ),
    ...p.edges.map((e) => (e.kind === 'relation' ? text(e.label) : undefined)),
  ].filter((t): t is string => t !== undefined);
};

describe('usecase labels (D176)', () => {
  it('lists the stereotypes and include/extend labels in the quotes the layout measures', async () => {
    const { model } = parseUsecase(SRC);
    expect(usecaseLabels(model)).toEqual(
      expect.arrayContaining(['«Staff»', '«Core»', '«include»', 'pays'])
    );
    const ascii = usecaseLabels(model, ASCII_QUOTES);
    expect(ascii).toEqual(expect.arrayContaining(['<<Staff>>', '<<Core>>', '<<include>>']));
    expect(ascii).not.toContain('«include»');
    const { layout } = await draw(SRC, { charset: 'ascii' });
    for (const t of measured(layout)) expect(ascii).toContain(t);
  });

  it('gives the plugin both forms, so the list holds what either output measures', () => {
    const { model } = parseUsecase(SRC);
    const listed = usecase.labels(model);
    expect(listed).toEqual(
      expect.arrayContaining(['«Core»', '<<Core>>', '«include»', '<<include>>'])
    );
    expect(new Set(listed).size).toBe(listed.length);
  });
});
