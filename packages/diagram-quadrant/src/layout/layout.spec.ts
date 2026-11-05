import { describe, expect, it } from 'vitest';
import type { Warning } from '@mermaid-js/core';
import { layoutQuadrant } from './layout.ts';
import { quadrantLayoutViolations } from './invariants.ts';
import { axis, config, model, point } from './fixtures.ts';

describe('layoutQuadrant', () => {
  it('splits the padded square into four quadrants, with centred labels, when the chart is empty', () => {
    const l = layoutQuadrant(model(), config());
    expect([l.width, l.height]).toEqual([500, 500]);
    expect(l.quadrants.map((q) => [q.quadrant, q.x, q.y, q.width, q.height])).toEqual([
      [1, 250, 5, 245, 245],
      [2, 5, 5, 245, 245],
      [3, 5, 250, 245, 245],
      [4, 250, 250, 245, 245],
    ]);
    expect(l.quadrants.map((q) => [q.text.x, q.text.y, q.text.anchor, q.text.baseline])).toEqual([
      [372.5, 127.5, 'middle', 'middle'],
      [127.5, 127.5, 'middle', 'middle'],
      [127.5, 372.5, 'middle', 'middle'],
      [372.5, 372.5, 'middle', 'middle'],
    ]);
    expect(l.quadrants[0]!.text.fontSize).toBe(16);
    expect(l.axisLabels).toEqual([]);
    expect(l.points).toEqual([]);
    expect(l.title).toBeUndefined();
  });

  it('draws four outer borders overhanging by half their stroke, and two inner ones', () => {
    const l = layoutQuadrant(model(), config());
    expect(l.borders.map((b) => [b.kind, b.x1, b.y1, b.x2, b.y2, b.strokeWidth])).toEqual([
      ['external', 4, 5, 496, 5, 2],
      ['external', 495, 6, 495, 494, 2],
      ['external', 4, 495, 496, 495, 2],
      ['external', 5, 6, 5, 494, 2],
      ['internal', 250, 6, 250, 494, 1],
      ['internal', 6, 250, 494, 250, 1],
    ]);
  });

  it('makes room for the title and both axes, and centres two axis labels in their halves', () => {
    const l = layoutQuadrant(
      model({
        title: 'T',
        titleAst: 'st:1',
        xAxis: axis('x', 'Low', 'High'),
        yAxis: axis('y', 'Bottom', 'Top'),
      }),
      config()
    );
    expect(l.quadrants.map((q) => [q.x, q.y, q.width, q.height])).toEqual([
      [263, 71, 232, 212],
      [31, 71, 232, 212],
      [31, 283, 232, 212],
      [263, 283, 232, 212],
    ]);
    const { label, ...title } = l.title!;
    expect([label.text, title]).toEqual([
      'T',
      {
        ast: 'st:1',
        x: 250,
        y: 10,
        fontSize: 20,
        anchor: 'middle',
        baseline: 'hanging',
        rotation: 0,
      },
    ]);
    expect(
      l.axisLabels.map((a) => [
        a.axis,
        a.end,
        a.ast,
        a.text.label.text,
        a.text.x,
        a.text.y,
        a.text.anchor,
        a.text.rotation,
      ])
    ).toEqual([
      ['x', 'start', 'ax:x', 'Low', 147, 45, 'middle', 0],
      ['x', 'end', 'ax:x/end', 'High', 379, 45, 'middle', 0],
      ['y', 'start', 'ax:y', 'Bottom', 5, 389, 'middle', -90],
      ['y', 'end', 'ax:y/end', 'Top', 5, 177, 'middle', -90],
    ]);
    expect(l.axisLabels.every((a) => a.text.baseline === 'hanging')).toBe(true);
    expect(l.axisLabels.map((a) => a.text.fontSize)).toEqual([16, 16, 16, 16]);
  });

  it('forces the x axis to the bottom once there is a point, and start-anchors a lone label at the edge', () => {
    const l = layoutQuadrant(
      model({
        xAxis: axis('x', 'Reach'),
        yAxis: axis('y', 'Eng'),
        points: [point('A', '0.5', '0.5')],
      }),
      config({ xAxisPosition: 'top', yAxisPosition: 'right' })
    );
    expect(l.quadrants[1]).toMatchObject({ x: 5, y: 5, width: 232, height: 232 });
    expect(l.axisLabels.map((a) => [a.axis, a.text.x, a.text.y, a.text.anchor])).toEqual([
      ['x', 5, 479, 'start'],
      ['y', 479, 469, 'start'],
    ]);
    expect(l.quadrants.map((q) => [q.text.x, q.text.y, q.text.baseline])).toEqual([
      [353, 10, 'hanging'],
      [121, 10, 'hanging'],
      [121, 242, 'hanging'],
      [353, 242, 'hanging'],
    ]);
  });

  it('shows neither an empty title nor an axis without text', () => {
    const l = layoutQuadrant(
      model({ title: '', xAxis: axis('x', ''), yAxis: axis('y', '') }),
      config()
    );
    expect(l.title).toBeUndefined();
    expect(l.axisLabels).toEqual([]);
    expect(l.quadrants[1]).toMatchObject({ x: 5, y: 5, width: 245 });
  });

  it('maps [0, 1] onto the square with y inverted, the label below the point', () => {
    const l = layoutQuadrant(
      model({ points: [point('A', '0.3', '0.6'), point('B', '1', '0')] }),
      config()
    );
    const { text, ...a } = l.points[0]!;
    expect(a).toEqual({ ast: 'pt:A', cx: 152, cy: 201, radius: 5, strokeWidth: 0 });
    expect(text).toEqual({
      label: { text: 'A', markdown: false },
      x: 152,
      y: 206,
      fontSize: 12,
      anchor: 'middle',
      baseline: 'hanging',
      rotation: 0,
    });
    expect(l.points.map((p) => [p.cx, p.cy])).toEqual([
      [152, 201],
      [495, 495],
    ]);
  });

  it('takes styles inline first, then from the class, and writes colours with a #', () => {
    const classes = new Map([
      [
        'c1',
        {
          ast: 'c:c1',
          styles: { radius: 10, color: '908342', strokeColor: '#310085', strokeWidth: 10 },
        },
      ],
    ]);
    const l = layoutQuadrant(
      model({
        points: [
          point('A', '0.5', '0.5', { radius: 20 }, 'c1'),
          point('B', '0.5', '0.5', {}, 'nope'),
          point('C', '0.5', '0.5', { color: 'abc', strokeWidth: 3 }),
        ],
        classes,
      }),
      config({ pointRadius: 7 })
    );
    expect(
      l.points.map(({ radius, fill, stroke, strokeWidth }) => ({
        radius,
        fill,
        stroke,
        strokeWidth,
      }))
    ).toEqual([
      { radius: 20, fill: '#908342', stroke: '#310085', strokeWidth: 10 },
      { radius: 7, fill: undefined, stroke: undefined, strokeWidth: 0 },
      { radius: 7, fill: '#abc', stroke: undefined, strokeWidth: 3 },
    ]);
  });

  it('leaves out a point whose coordinate is not a number in [0, 1], with one warning per point (D226)', () => {
    const warnings: Warning[] = [];
    const l = layoutQuadrant(
      model({
        points: [
          point('hex', '0x5', '0.5'),
          point('both', '0a5', '0a5'),
          point('ok', '0.25', '0.75'),
          point('nan', '0.5', '0 5'),
        ],
      }),
      config(),
      (w) => warnings.push(w)
    );
    expect(l.points.map((p) => p.ast)).toEqual(['pt:ok']);
    expect(warnings.map((w) => [w.code, w.astIds])).toEqual([
      ['QUADRANT_POINT_INVALID', ['pt:hex']],
      ['QUADRANT_POINT_INVALID', ['pt:both']],
      ['QUADRANT_POINT_INVALID', ['pt:nan']],
    ]);
    expect(warnings[0]!.message).toBe(
      'Left out point "hex": its coordinates [0x5, 0.5] are not numbers from 0 to 1'
    );
  });

  it('honours a configured 0', () => {
    const l = layoutQuadrant(
      model({ points: [point('A', '0', '1')] }),
      config({ quadrantPadding: 0, pointRadius: 0 })
    );
    expect(l.quadrants[1]).toMatchObject({ x: 0, y: 0, width: 250, height: 250 });
    expect(l.points.map((p) => [p.cx, p.cy, p.radius])).toEqual([[0, 0, 0]]);
  });

  it('keeps label text and its markdown flag as the model gives them', () => {
    const md = { text: '**bold**', markdown: true };
    const l = layoutQuadrant(
      model({ quadrants: [{ ast: 'q:1', ...md }, undefined, undefined, undefined] }),
      config()
    );
    expect(l.quadrants.map((q) => [q.ast, q.text.label])).toEqual([
      ['q:1', md],
      [undefined, { text: '', markdown: false }],
      [undefined, { text: '', markdown: false }],
      [undefined, { text: '', markdown: false }],
    ]);
  });

  it('clamps the square to no size when the chart is too small for its bands', () => {
    const l = layoutQuadrant(
      model({ yAxis: axis('y', 'Eng'), points: [point('A', '0.5', '0.5')] }),
      config({ chartWidth: 20 })
    );
    expect(l.quadrants.map((q) => [q.x, q.width])).toEqual([
      [31, 0],
      [31, 0],
      [31, 0],
      [31, 0],
    ]);
    expect(l.points.map((p) => p.cx)).toEqual([31]);
    expect(quadrantLayoutViolations(l)).toEqual([]);
  });
});
