import { describe, expect, it } from 'vitest';
import { eventmodeling } from './plugin.ts';
import { parseEventModel } from './parser/index.ts';
import { EVENTMODELING_METRICS } from './layout/index.ts';

describe('eventmodeling plugin (spec #527 T4)', () => {
  it('is a custom-layout SVG plugin', () => {
    expect(eventmodeling.id).toBe('eventmodeling');
    expect(eventmodeling.layoutKind).toBe('custom');
    expect(eventmodeling.formats).toEqual(['svg']);
  });

  it('hands extensions no label text: data is plain, so `$$` loads no engine (D523, D176)', () => {
    const { model } = parseEventModel(
      'eventmodeling\ntf 01 cmd Pay { amount: $$x^2$$ }\ntf 02 evt Paid [[D]]\ndata D {\n  $$y$$\n}'
    );
    expect(model.frames.map((f) => f.data?.text ?? f.dataRef)).toEqual(['amount: $$x^2$$', 'D']);
    expect(eventmodeling.labels()).toEqual([]);
  });

  it('carries the eventmodeling section defaults, padding as the layout falls back to (#611)', () => {
    expect(eventmodeling.configDefaults).toEqual({ useMaxWidth: true, padding: 30, rowHeight: 32 });
    expect(eventmodeling.configDefaults.padding).toBe(EVENTMODELING_METRICS.padding);
  });
});
