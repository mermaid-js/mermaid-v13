/**
 * An XY chart axis: v12's `BaseAxis` with its `BandAxis` and `LinearAxis`
 * (`chartBuilder/components/axis/`), the same state machine (position, range, space, outer
 * padding) and the same arithmetic, without d3 (`scale.ts`). Its labels are measured before any
 * space is handed out (measure first, pitfall 16): a linear axis's ticks depend on its domain only.
 */
import type { Size } from '@mermaid-js/core/layout';
import type { AstId } from '@mermaid-js/core/parser-kit';
import type { FontKey } from '@mermaid-js/core/text';
import type { XyChartAxisOptions } from '../config.ts';
import { XYCHART_METRICS } from './metrics.ts';
import { bandScale, linearScale, ticks as d3Ticks } from './scale.ts';
import { place, type Measured, type TextMeasure } from './text.ts';
import type { Rect, Segment, XyAxisLayout, XyAxisPosition, XyText, XyTick } from './types.ts';

/** What the axis shows: a band of categories, or a linear domain (`[min, max]` as given). */
export type AxisData =
  | { readonly kind: 'band'; readonly categories: readonly string[] }
  | { readonly kind: 'linear'; readonly domain: readonly [number, number] };

export interface AxisInput {
  readonly data: AxisData;
  readonly title: string;
  readonly ast?: AstId;
  readonly options: XyChartAxisOptions;
  readonly family: string;
  readonly weight: number;
  readonly texts: TextMeasure;
}

const { maxOuterPadding, barToTick, tickCount, initialAxisLength } = XYCHART_METRICS;

export class Axis {
  private position: XyAxisPosition = 'left';
  private range: [number, number] = [0, initialAxisLength];
  private readonly box = { x: 0, y: 0, width: 0, height: 0 };
  private showTitle = false;
  private showLabel = false;
  private showTick = false;
  private showLine = false;
  /** v12's `outerPadding`: the range's inset at each end. */
  private padding = 0;
  private titleHeight = 0;
  /** v12's `normalizedLabelRotationInRad`: the config is already within ±90 (`config.ts`). */
  private readonly rotation: number;
  private readonly labelFont: FontKey;
  private readonly titleFont: FontKey;
  /** The tick values in increasing-domain order, and their measured labels. */
  private readonly values: readonly (string | number)[];
  private readonly labels: readonly Measured[];
  private readonly labelSize: Size;
  private readonly titleText: Measured | undefined;
  private scaleOf: (value: string | number) => number = () => 0;

  constructor(private readonly input: AxisInput) {
    const { options, family, weight, texts, data } = input;
    this.rotation = (options.labelRotation * Math.PI) / 180;
    this.labelFont = { family, size: options.labelFontSize, weight };
    this.titleFont = { family, size: options.titleFontSize, weight };
    this.values =
      data.kind === 'band' ? data.categories : d3Ticks(data.domain[0], data.domain[1], tickCount);
    this.labels = this.values.map((v) =>
      data.kind === 'band'
        ? texts.label(String(v), this.labelFont)
        : texts.plain(String(v), this.labelFont)
    );
    this.labelSize = texts.max(this.labels, this.labelFont);
    this.titleText = input.title ? texts.label(input.title, this.titleFont) : undefined;
    this.rescale();
  }

  setPosition(position: XyAxisPosition): void {
    this.position = position;
    this.setRange(this.range);
  }

  setRange(range: [number, number]): void {
    this.range = range;
    if (this.position === 'left') this.box.height = range[1] - range[0];
    else this.box.width = range[1] - range[0];
    this.rescale();
  }

  setOrigin(x: number, y: number): void {
    this.box.x = x;
    this.box.y = y;
  }

  /** The scale's range: the given range less the outer padding at each end. */
  private paddedRange(): [number, number] {
    return [this.range[0] + this.padding, this.range[1] - this.padding];
  }

  /** v12 `getTickDistance`: the padded length over the tick count (duplicates counted). */
  tickDistance(): number {
    const [a, b] = this.paddedRange();
    return Math.abs(a - b) / Math.max(1, this.tickValues().length);
  }

  /** v12 `getAxisOuterPadding`. */
  outerPadding(): number {
    return this.padding;
  }

  /** v12 `recalculateOuterPaddingToDrawBar`: room for a bar at each end. */
  padForBars(): void {
    if (barToTick * this.tickDistance() > this.padding * 2) {
      this.padding = Math.floor((barToTick * this.tickDistance()) / 2);
    }
    this.rescale();
  }

  /** The coordinate of `value` along the axis; the range start for one the axis does not have. */
  scale(value: string | number): number {
    return this.scaleOf(value);
  }

  private rescale(): void {
    const range = this.paddedRange();
    const { data } = this.input;
    if (data.kind === 'band') {
      const s = bandScale(data.categories, range);
      this.scaleOf = (v) => s(String(v)) ?? range[0];
    } else {
      const s = linearScale(this.domain(), range);
      this.scaleOf = (v) => {
        const n = Number(v);
        return Number.isFinite(n) ? s(n) : range[0];
      };
    }
  }

  /** A linear domain as the scale reads it: reversed on a left axis (SVG's y runs down). */
  private domain(): [number, number] {
    const { data } = this.input;
    if (data.kind === 'band') return [0, 0];
    const [a, b] = data.domain;
    return this.position === 'left' ? [b, a] : [a, b];
  }

  /** The tick values in v12's order: a left linear axis counts down. */
  private tickValues(): readonly (string | number)[] {
    return this.input.data.kind === 'linear' && this.position === 'left'
      ? [...this.values].reverse()
      : this.values;
  }

  private tickLabels(): readonly Measured[] {
    return this.input.data.kind === 'linear' && this.position === 'left'
      ? [...this.labels].reverse()
      : this.labels;
  }

  /**
   * v12 `calculateSpace` (`calculateSpaceIfDrawnHorizontally`/`…Vertical`, one shape): what the
   * axis takes across `available`, dropping parts that do not fit, in v12's order: the axis line,
   * the labels (whose half size along the axis sets the outer padding), the ticks, the title.
   */
  calculateSpace(available: Size): Size {
    const options = this.input.options;
    const left = this.position === 'left';
    const across = left ? 'width' : 'height';
    const along = left ? 'height' : 'width';
    let room = available[across];
    if (options.showAxisLine && room > options.axisLineWidth) {
      room -= options.axisLineWidth;
      this.showLine = true;
    }
    if (options.showLabel) {
      const size = this.labelSize;
      this.padding = Math.min(size[along] / 2, maxOuterPadding * available[along]);
      const need = this.labelDepth() + options.labelPadding * 2;
      if (need <= room) {
        room -= need;
        this.showLabel = true;
      }
    }
    if (options.showTick && room >= options.tickLength) {
      this.showTick = true;
      room -= options.tickLength;
    }
    if (options.showTitle && this.titleText) {
      const need = this.titleText.height + options.titlePadding * 2;
      this.titleHeight = this.titleText.height;
      if (need <= room) {
        room -= need;
        this.showTitle = true;
      }
    }
    this.box[across] = available[across] - room;
    this.box[along] = available[along];
    this.rescale();
    return { width: this.box.width, height: this.box.height };
  }

  /** How deep the labels are across the axis: their width on a left axis, else their (rotated) height. */
  private labelDepth(): number {
    const size = this.labelSize;
    if (this.position === 'left') return size.width;
    if (this.position !== 'bottom' || this.rotation === 0) return size.height;
    return Math.max(
      size.height,
      Math.abs(Math.sin(this.rotation) * size.width) +
        Math.abs(Math.cos(this.rotation) * size.height)
    );
  }

  /** v12 `calculateOffsetByRotation`: a rotated label's shift, from the widest/tallest label. */
  private rotationOffset(of: 'width' | 'height'): number {
    if (this.rotation === 0) return 0;
    return (Math.sin(this.rotation) * this.labelSize[of]) / 2;
  }

  /** The axis's parts as v12 drew them (`getDrawableElementsFor{Left,Bottom,Top}Axis`). */
  result(): XyAxisLayout {
    const options = this.input.options;
    const { data, ast } = this.input;
    const box: Rect = { ...this.box };
    const line = options.axisLineWidth;
    const tickLen = options.tickLength;
    const lineIn = this.showLine ? line : 0;
    const values = this.tickValues();
    const labels = this.tickLabels();
    let axisLine: Segment | undefined;
    let title: XyText | undefined;
    const tickAt: (at: number) => Segment = (at) => {
      if (this.position === 'left') {
        const x = box.x + box.width - lineIn;
        return { x1: x, y1: at, x2: x - tickLen, y2: at };
      }
      if (this.position === 'bottom') {
        const y = box.y + lineIn;
        return { x1: at, y1: y, x2: at, y2: y + tickLen };
      }
      const y = box.y + box.height - lineIn;
      return { x1: at, y1: y, x2: at, y2: y - tickLen };
    };
    const labelAt = (at: number, m: Measured): XyText => {
      if (this.position === 'left') {
        const x = box.x + box.width - options.labelPadding - (this.showTick ? tickLen : 0) - lineIn;
        return place(m, { x, y: at }, 'end', 'middle');
      }
      if (this.position === 'bottom') {
        const y =
          box.y +
          options.labelPadding +
          (this.showTick ? tickLen : 0) +
          lineIn +
          Math.abs(this.rotationOffset('width'));
        const x = at + this.rotationOffset('height');
        return place(m, { x, y }, 'middle', 'top', (this.rotation * 180) / Math.PI);
      }
      const y =
        box.y +
        (this.showTitle ? this.titleHeight + options.titlePadding * 2 : 0) +
        options.labelPadding;
      return place(m, { x: at, y }, 'middle', 'top');
    };
    if (this.position === 'left') {
      if (this.showLine) {
        const x = box.x + box.width - line / 2;
        axisLine = { x1: x, y1: box.y, x2: x, y2: box.y + box.height };
      }
      if (this.showTitle && this.titleText) {
        const at = { x: box.x + options.titlePadding, y: box.y + box.height / 2 };
        title = place(this.titleText, at, 'middle', 'top', 270);
      }
    } else if (this.position === 'bottom') {
      if (this.showLine) {
        const y = box.y + line / 2;
        axisLine = { x1: box.x, y1: y, x2: box.x + box.width, y2: y };
      }
      if (this.showTitle && this.titleText) {
        const at = {
          x: this.range[0] + (this.range[1] - this.range[0]) / 2,
          y: box.y + box.height - options.titlePadding - this.titleHeight,
        };
        title = place(this.titleText, at, 'middle', 'top');
      }
    } else {
      if (this.showLine) {
        const y = box.y + box.height - line / 2;
        axisLine = { x1: box.x, y1: y, x2: box.x + box.width, y2: y };
      }
      if (this.showTitle && this.titleText) {
        const at = { x: box.x + box.width / 2, y: box.y + options.titlePadding };
        title = place(this.titleText, at, 'middle', 'top');
      }
    }
    const ticks: XyTick[] = values.map((value, i) => {
      const at = this.scale(value);
      return {
        value,
        at,
        ...(this.showTick ? { line: tickAt(at) } : {}),
        ...(this.showLabel ? { label: labelAt(at, labels[i]!) } : {}),
      };
    });
    return {
      kind: data.kind,
      position: this.position,
      ...(ast === undefined ? {} : { ast }),
      box,
      range: this.paddedRange(),
      outerPadding: this.padding,
      ...(data.kind === 'linear' ? { domain: this.domain() } : { categories: data.categories }),
      ticks,
      tickWidth: options.tickWidth,
      ...(axisLine ? { line: axisLine } : {}),
      lineWidth: line,
      ...(title ? { title } : {}),
    };
  }
}
