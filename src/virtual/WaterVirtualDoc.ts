/**
 * Copyright (c) 2022 大漠穷秋.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/**
 * **给排水工艺图的「虚拟文档」**（引擎虚拟子源的 IED 侧参考实现，2026-09-21）。
 *
 * 目的：把"文档里的图元"和"内存里的组件对象"解耦 —— 一份几万个符号 + 几万条管线的厂站图，
 * 常驻内存只有几条 TypedArray，屏幕上看得到的那几百个才物化成真组件（可选中 / 可编辑）。
 *
 * 三类条目（同一套下标空间）：
 * | type | 内容 | 画法 |
 * |---|---|---|
 * | 0 符号 | 21 种工艺符号（`WATER_SYMBOL_PRESETS`） | **批量精灵**：每种 kind 渲染一张离屏位图，逐实例 `drawImage` |
 * | 1 标注 | 位号 + 名称（`P-00123 水泵`） | **窗口内物化**成真 `ICEText`（引擎的文本位图缓存对它有效） |
 * | 2 管线 | 介质 + 管径的折线 | 批量落墨（`setLineDash` + `stroke`）；命中走点到线段距离 |
 *
 * 与引擎的分工（见 `ice-render/plans/virtual-child-source.md`）：
 * - 引擎负责：窗口计算、坐标换算、批量落墨的 ctx 隔离、命中即物化 + 事件重定向、窗口增删的廉价通道；
 * - 这里负责：列存文档、空间索引、精灵、命中精算、物化时**造出真组件**。
 */
import { ICEText, materializeVirtualChild, releaseVirtualChild, materializedIndices } from 'ice-render';
import type { VirtualChildSource, VirtualChildView } from 'ice-render';
import WaterSymbol, { WATER_SYMBOL_PRESETS, WATER_MEDIUM_STYLES, WATER_STYLE } from '../water/water_shapes';
import type { WaterMedium } from '../water/water_shapes';
import { WaterPipe } from '../water/WaterProcessDesigner';

/** 条目类型 */
export const ITEM_SYMBOL = 0;
export const ITEM_LABEL = 1;
export const ITEM_PIPE = 2;

const KIND_NAMES = Object.keys(WATER_SYMBOL_PRESETS);
const MEDIUM_NAMES = Object.keys(WATER_MEDIUM_STYLES) as WaterMedium[];

export interface WaterVirtualDocOptions {
  /** 符号个数（默认 20000）。标注与管线按它派生。 */
  symbols?: number;
  /** 栅格列数（默认按世界长宽比算）。 */
  cols?: number;
  worldW?: number;
  worldH?: number;
  /** 每个符号都配一条到右邻的管线（默认 true）。 */
  pipes?: boolean;
}

type Sprite = { canvas: HTMLCanvasElement; w: number; h: number; ox: number; oy: number };

export class WaterVirtualDoc implements VirtualChildSource {
  public readonly count: number;
  /** 符号个数（下标 0..symbolCount-1 是符号，接着是标注，最后是管线） */
  public readonly symbolCount: number;
  public version = 1;

  /** ---- 列存 ---- */
  public readonly type: Uint8Array;
  public readonly x: Float32Array;
  public readonly y: Float32Array;
  public readonly w: Float32Array;
  public readonly h: Float32Array;
  /** 符号/标注的 kind 索引（TEXT 条目用不到） */
  public readonly kind: Uint8Array;
  /** 标注 → 它属于哪个符号（符号自己存 -1） */
  public readonly labelOf: Int32Array;
  /** 管线两端（指向符号下标）与介质 / 管径 */
  public readonly pipeFrom: Int32Array;
  public readonly pipeTo: Int32Array;
  public readonly pipeMedium: Uint8Array;
  public readonly pipeDn: Uint16Array;
  /** 已物化（批量层让位）标记：**契约要求**——`materialize` 里必须置位 */
  public readonly done: Uint8Array;

  public readonly worldW: number;
  public readonly worldH: number;
  /** 位号 / 名称的字符串表（按符号下标算：`P-000123` / `水泵`） */
  public tagOf(i: number): string {
    const preset = WATER_SYMBOL_PRESETS[KIND_NAMES[this.kind[i]]];
    // 不用 padStart：IED 的 tsconfig 目标较低（lib 里没有 es2017 的 String.prototype.padStart）
    const n = String(i % 100000);
    return `${preset.tag}-${'00000'.slice(n.length)}${n}`;
  }
  public nameOf(i: number): string {
    return WATER_SYMBOL_PRESETS[KIND_NAMES[this.kind[i]]].label;
  }

  private readonly ice: any;
  private readonly cols: number;
  private readonly rows: number;
  private readonly cell: number;
  private readonly gw: number;
  private readonly gh: number;
  private readonly head: Int32Array;
  private nodePrim: Int32Array;
  private nodeNext: Int32Array;
  private nodeCount = 0;
  private readonly sprites: Sprite[] = [];
  private readonly scratch = new Float64Array(4);
  private labelSyncPad = 300;
  /** 绑定的虚拟层（`paint` 里做标注的窗口同步要用它）。 */
  private layer: any = null;
  /** 上一次批量落墨的窗口（页面 / 探针读） */
  public lastView: VirtualChildView | null = null;
  /** 是否在 `paint` 里自动做"标注窗口同步"（默认开；关掉可以自己驱动） */
  public syncLabelsOnPaint = true;

  constructor(ice: any, options: WaterVirtualDocOptions = {}) {
    this.ice = ice;
    const symbols = Math.max(1, options.symbols || 20000);
    this.worldW = options.worldW || 12000;
    this.worldH = options.worldH || 8000;
    this.cols = options.cols || Math.max(1, Math.round(Math.sqrt((symbols * this.worldW) / this.worldH)));
    this.rows = Math.ceil(symbols / this.cols);
    const withPipes = options.pipes !== false;
    this.symbolCount = symbols;
    this.count = symbols + symbols /* 标注 */ + (withPipes ? symbols : 0) /* 管线 */;

    this.type = new Uint8Array(this.count);
    this.x = new Float32Array(this.count);
    this.y = new Float32Array(this.count);
    this.w = new Float32Array(this.count);
    this.h = new Float32Array(this.count);
    this.kind = new Uint8Array(this.count);
    this.labelOf = new Int32Array(this.count).fill(-1);
    this.pipeFrom = new Int32Array(this.count);
    this.pipeTo = new Int32Array(this.count);
    this.pipeMedium = new Uint8Array(this.count);
    this.pipeDn = new Uint16Array(this.count);
    this.done = new Uint8Array(this.count);
    this.windowSeen = new Int32Array(this.count).fill(-1);

    const stepX = this.worldW / this.cols;
    const stepY = this.worldH / Math.max(1, this.rows);
    for (let i = 0; i < symbols; i++) {
      const col = i % this.cols;
      const row = (i / this.cols) | 0;
      const kindIndex = (i * 7 + ((i / 13) | 0)) % KIND_NAMES.length;
      const preset = WATER_SYMBOL_PRESETS[KIND_NAMES[kindIndex]];
      const sx = col * stepX + ((i * 29) % 17);
      const sy = row * stepY + ((i * 43) % 13);
      this.type[i] = ITEM_SYMBOL;
      this.kind[i] = kindIndex;
      this.x[i] = sx;
      this.y[i] = sy;
      this.w[i] = preset.width;
      this.h[i] = preset.height;

      const li = symbols + i;
      this.type[li] = ITEM_LABEL;
      this.kind[li] = kindIndex;
      this.labelOf[li] = i;
      this.x[li] = sx;
      this.y[li] = sy + preset.height; // 标在符号下方（与 IED 的派生部件一致）
      this.w[li] = 90;
      this.h[li] = 14;
    }

    /**
     * 管线**第二趟**再算盒（第一趟只铺符号与标注的坐标）。
     *
     * 为什么必须分两趟：管线连的是"同列的下一行"（`i + cols`），那条符号这时还没写坐标 ——
     * 一趟写完会拿到 `(0,0)`，于是管线盒横跨整个世界（实测 6 万条 → 索引节点 3000 万、
     * 236MB、11.8fps）。虚拟化的前提是"图元的盒别跨全图"，这是文档生成必须守的纪律。
     */
    if (withPipes) {
      for (let i = 0; i < symbols; i++) {
        const pi = symbols * 2 + i;
        const target = i + this.cols < symbols ? i + this.cols : i;
        this.type[pi] = ITEM_PIPE;
        this.pipeFrom[pi] = i;
        this.pipeTo[pi] = target;
        this.pipeMedium[pi] = i % MEDIUM_NAMES.length;
        this.pipeDn[pi] = 100 + (i % 9) * 50;
        if (target !== i) {
          const a = this.pipeBox(pi, this.scratch);
          this.x[pi] = a[0];
          this.y[pi] = a[1];
          this.w[pi] = a[2] - a[0];
          this.h[pi] = a[3] - a[1];
        } else {
          // 末行的退化管线：零尺寸，既不进索引也不落墨（见 `__degenerate`）
          this.x[pi] = this.x[i];
          this.y[pi] = this.y[i];
          this.w[pi] = 0;
          this.h[pi] = 0;
        }
      }
    }

    // 空间索引（网格 + 链表，节点是"条目×格子"对）
    this.cell = 128;
    this.gw = Math.max(1, Math.ceil(this.worldW / this.cell) + 1);
    this.gh = Math.max(1, Math.ceil(this.worldH / this.cell) + 1);
    this.head = new Int32Array(this.gw * this.gh).fill(-1);
    this.nodePrim = new Int32Array(this.count * 2).fill(-1);
    this.nodeNext = new Int32Array(this.count * 2).fill(-1);
    for (let i = 0; i < this.count; i++) {
      if (this.type[i] === ITEM_LABEL) continue; // 标注不进索引（点到标注 → 归它的符号）
      if (this.__degenerate(i)) continue; // 末行的自连管线（零尺寸）
      const cx0 = Math.max(0, Math.min(this.gw - 1, (this.x[i] / this.cell) | 0));
      const cx1 = Math.max(0, Math.min(this.gw - 1, ((this.x[i] + this.w[i]) / this.cell) | 0));
      const cy0 = Math.max(0, Math.min(this.gh - 1, (this.y[i] / this.cell) | 0));
      const cy1 = Math.max(0, Math.min(this.gh - 1, ((this.y[i] + this.h[i]) / this.cell) | 0));
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) this.__addNode(cy * this.gw + cx, i);
      }
    }

    this.__mintSprites();
  }

  // ------------------------------------------------------------------ 空间索引
  private __addNode(cellIdx: number, i: number): void {
    if (this.nodeCount >= this.nodePrim.length) {
      const np = new Int32Array(this.nodeCount * 2).fill(-1);
      np.set(this.nodePrim);
      this.nodePrim = np;
      const nn = new Int32Array(this.nodeCount * 2).fill(-1);
      nn.set(this.nodeNext);
      this.nodeNext = nn;
    }
    this.nodePrim[this.nodeCount] = i;
    this.nodeNext[this.nodeCount] = this.head[cellIdx];
    this.head[cellIdx] = this.nodeCount++;
  }

  public boxAt(i: number, out: Float64Array): void {
    out[0] = this.x[i];
    out[1] = this.y[i];
    out[2] = this.x[i] + this.w[i];
    out[3] = this.y[i] + this.h[i];
  }

  /** 窗口遍历：网格候选 + 精确盒相交（标注也在内 —— 窗口同步要用它）。 */
  public forEachInBox(x0: number, y0: number, x1: number, y1: number, visit: (i: number) => void): void {
    const cx0 = Math.max(0, Math.min(this.gw - 1, (x0 / this.cell) | 0));
    const cx1 = Math.max(0, Math.min(this.gw - 1, (x1 / this.cell) | 0));
    const cy0 = Math.max(0, Math.min(this.gh - 1, (y0 / this.cell) | 0));
    const cy1 = Math.max(0, Math.min(this.gh - 1, (y1 / this.cell) | 0));
    const stamp = ++this.windowStamp;
    for (let cy = cy0; cy <= cy1; cy++) {
      const rowBase = cy * this.gw;
      for (let cx = cx0; cx <= cx1; cx++) {
        let node = this.head[rowBase + cx];
        while (node !== -1) {
          const i = this.nodePrim[node];
          if (this.windowSeen[i] !== stamp) {
            this.windowSeen[i] = stamp;
            if (this.x[i] + this.w[i] >= x0 && this.x[i] <= x1 && this.y[i] + this.h[i] >= y0 && this.y[i] <= y1) {
              visit(i);
            }
          }
          node = this.nodeNext[node];
        }
      }
    }
  }

  private windowStamp = 0;
  private readonly windowSeen: Int32Array;
  /** 退化条目（末行的自连管线、零尺寸）：不进索引、不落墨。 */
  private __degenerate(i: number): boolean {
    return this.type[i] === ITEM_PIPE && this.pipeFrom[i] === this.pipeTo[i];
  }

  // ------------------------------------------------------------------ 命中
  public hitTest(lx: number, ly: number): number {
    const cx = Math.max(0, Math.min(this.gw - 1, (lx / this.cell) | 0));
    const cy = Math.max(0, Math.min(this.gh - 1, (ly / this.cell) | 0));
    let node = this.head[cy * this.gw + cx];
    while (node !== -1) {
      const i = this.nodePrim[node];
      if (this.__hitPrecise(i, lx, ly)) return i;
      node = this.nodeNext[node];
    }
    return -1;
  }

  private __hitPrecise(i: number, lx: number, ly: number): boolean {
    const x0 = this.x[i];
    const y0 = this.y[i];
    if (lx < x0 || ly < y0 || lx > x0 + this.w[i] || ly > y0 + this.h[i]) return false;
    if (this.type[i] === ITEM_SYMBOL) return true; // 符号：方框内即命中（精灵的透明边缘忽略）
    // 管线：点到线段距离（正交路由的两段折线，见 pipeBox）
    const a = this.pipeFrom[i];
    const b = this.pipeTo[i];
    const ax = this.x[a] + this.w[a] / 2;
    const ay = this.y[a] + this.h[a] / 2;
    const bx = this.x[b] + this.w[b] / 2;
    const by = this.y[b] + this.h[b] / 2;
    const midX = ax + (bx - ax) * 0.5;
    const tol = 4;
    return (
      this.__segDist(lx, ly, ax, ay, midX, ay) <= tol ||
      this.__segDist(lx, ly, midX, ay, midX, by) <= tol ||
      this.__segDist(lx, ly, midX, by, bx, by) <= tol
    );
  }

  private __segDist(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((px - x0) * dx + (py - y0) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const qx = x0 + t * dx;
    const qy = y0 + t * dy;
    return Math.hypot(px - qx, py - qy);
  }

  // ------------------------------------------------------------------ 批量落墨
  public paint(ctx: any, view: VirtualChildView): boolean {
    this.drawCalls = 0;
    this.lastView = view;
    this.forEachInBox(view.x0, view.y0, view.x1, view.y1, (i) => {
      const t = this.type[i];
      if (t === ITEM_LABEL) return; // 标注走窗口内物化（ICEText）
      if (this.__degenerate(i)) return;
      if (this.done[i]) return; // 已物化成真组件的，批量层让位
      if (t === ITEM_SYMBOL) {
        const sprite = this.sprites[this.kind[i]];
        if (sprite) {
          ctx.drawImage(sprite.canvas, this.x[i] - sprite.ox, this.y[i] - sprite.oy, sprite.w, sprite.h);
          this.drawCalls++;
        }
      } else {
        this.__strokePipe(ctx, i);
        this.drawCalls++;
      }
    });
    if (this.syncLabelsOnPaint) this.syncLabels(view);
    return true;
  }

  /** 绑定虚拟层：标注的物化 / 回收要用引擎的助手（幂等物化 + 回收）。 */
  public attachLayer(layer: any): void {
    this.layer = layer;
  }

  /**
   * **窗口内标注的物化 / 回收**（混合策略的应用侧循环）。
   *
   * 为什么标注不批量画：符号的位号是**每个实例都不同**的字符串，烤成精灵等于每个符号一张图；
   * 而物化成真 `ICEText` 之后，引擎的**文本位图缓存**会把"同字号同内容的文字"复用起来
   * （见引擎的 `ObjectCache`），窗口里几百个标注的实际成本远低于逐帧 `fillText`。
   */
  public syncLabels(view: VirtualChildView = this.lastView as VirtualChildView): void {
    if (!view || !this.layer) return;
    const keep = new Set<number>();
    /**
     * **从符号反推它的标注下标**（`labelIndexOfSymbol`）：标注自己不进空间索引
     * （点到标注要归它的符号，不该把标注当成可命中的独立图元），所以这里不能"扫窗口里的标注"。
     */
    this.windowItems(view, (i) => {
      if (this.type[i] !== ITEM_SYMBOL) return;
      const li = this.labelIndexOfSymbol(i);
      if (li < 0) return;
      keep.add(li);
      materializeVirtualChild(this.layer, li);
    });
    for (const i of materializedIndices(this.layer)) {
      if (this.type[i] === ITEM_LABEL && !keep.has(i)) releaseVirtualChild(this.layer, i);
    }
  }

  /** 符号下标 → 它的标注下标（-1 = 这个文档没给标注留位）。 */
  public labelIndexOfSymbol(symbolIndex: number): number {
    const li = this.symbolCount + symbolIndex;
    return li < this.count && this.type[li] === ITEM_LABEL ? li : -1;
  }

  private __strokePipe(ctx: any, i: number): void {
    const a = this.pipeFrom[i];
    const b = this.pipeTo[i];
    const style = WATER_MEDIUM_STYLES[MEDIUM_NAMES[this.pipeMedium[i]]];
    const ax = this.x[a] + this.w[a] / 2;
    const ay = this.y[a] + this.h[a] / 2;
    const bx = this.x[b] + this.w[b] / 2;
    const by = this.y[b] + this.h[b] / 2;
    const midX = ax + (bx - ax) * 0.5;
    ctx.save();
    ctx.strokeStyle = style.color;
    ctx.lineWidth = 1.4;
    ctx.setLineDash(style.lineType === 'dashed' ? [5, 5] : style.lineType === 'dashdot' ? [9, 4, 2, 4] : []);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(midX, ay);
    ctx.lineTo(midX, by);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.restore();
  }

  /** 每次 paint 真正落墨的条目数（探针用） */
  public drawCalls = 0;

  // ------------------------------------------------------------------ 物化
  /**
   * 造一个真组件（**不挂树** —— 引擎的 `materializeVirtualChild` 负责挂进虚拟层）。
   *
   * 契约：必须在这里把 `done[i]` 置位，否则批量层会再画一遍。
   */
  public materialize(i: number): any {
    this.done[i] = 1;
    const t = this.type[i];
    if (t === ITEM_SYMBOL) {
      const node = new WaterSymbol({
        kind: KIND_NAMES[this.kind[i]] as any,
        id: `vs-${i}`,
        left: this.x[i],
        top: this.y[i],
        name: this.nameOf(i),
        tag: this.tagOf(i),
      });
      return node;
    }
    if (t === ITEM_LABEL) {
      const owner = this.labelOf[i];
      return new ICEText({
        left: this.x[i],
        top: this.y[i],
        width: 90,
        text: `${this.tagOf(owner)} ${this.nameOf(owner)}`,
        // 颜色走领域色板（`water_shapes` 的 `WATER_STYLE`），不在虚拟文档里写死色值 ——
        // 本仓有"取色预算棘轮"门禁（`tests/theme/color-budget.test.ts`）
        style: { fontSize: WATER_STYLE.tagFontSize, fillStyle: WATER_STYLE.tagColor },
      });
    }
    const pipe = new WaterPipe({
      id: `vp-${i}`,
      medium: MEDIUM_NAMES[this.pipeMedium[i]],
      dn: `DN${this.pipeDn[i]}`,
    } as any);
    pipe.setState({ left: 0, top: 0 } as any);
    return pipe;
  }

  /** 窗口内标注的物化 / 回收（应用侧的"混合策略"循环；引擎只提供两个助手）。 */
  public windowItems(view: VirtualChildView, visit: (i: number) => void): void {
    const pad = this.labelSyncPad;
    this.forEachInBox(view.x0 - pad, view.y0 - pad, view.x1 + pad, view.y1 + pad, visit);
  }

  /** 管线的世界盒（正交路由：横 → 竖 → 横） */
  private pipeBox(i: number, out: Float64Array): Float64Array {
    const a = this.pipeFrom[i];
    const b = this.pipeTo[i];
    const ax = this.x[a] + this.w[a] / 2;
    const ay = this.y[a] + this.h[a] / 2;
    const bx = this.x[b] + this.w[b] / 2;
    const by = this.y[b] + this.h[b] / 2;
    const midX = ax + (bx - ax) * 0.5;
    out[0] = Math.min(ax, midX, bx);
    out[1] = Math.min(ay, by);
    out[2] = Math.max(ax, midX, bx);
    out[3] = Math.max(ay, by);
    return out;
  }

  /** 文档占用的"真数据"字节数（探针 / 反馈报告用） */
  public get bytes(): number {
    return (
      this.type.byteLength +
      this.x.byteLength +
      this.y.byteLength +
      this.w.byteLength +
      this.h.byteLength +
      this.kind.byteLength +
      this.labelOf.byteLength +
      this.pipeFrom.byteLength +
      this.pipeTo.byteLength +
      this.pipeMedium.byteLength +
      this.pipeDn.byteLength +
      this.done.byteLength +
      this.head.byteLength +
      this.nodePrim.byteLength +
      this.nodeNext.byteLength +
      this.windowSeen.byteLength
    );
  }

  // ------------------------------------------------------------------ 精灵
  /**
   * 每种 kind 渲染一张离屏位图（**rs=2**，缩放贴图时不至于太糊）。
   *
   * 为什么走精灵而不是共享 `Path2D`：IED 的 `WaterSymbol` 是**复合组件**（矩形 + 栅条 / 曝气盘 / 刮泥桥…），
   * 它的外观不是一条路径 —— 组件的离屏位图才是它的正确"批量表示"。
   */
  private __mintSprites(): void {
    const rs = 2;
    for (let k = 0; k < KIND_NAMES.length; k++) {
      const kind = KIND_NAMES[k];
      const preset = WATER_SYMBOL_PRESETS[kind];
      const tpl: any = new WaterSymbol({ kind: kind as any, left: 0, top: 0, name: '', tag: '' } as any);
      this.ice.addChild(tpl);
      tpl.refreshParams();
      tpl.composeMatrix();
      const box = tpl.getMinBoundingBox().getMinAndMaxPoint();
      const pad = 2;
      const dx = Math.floor(box.minX * rs) - pad;
      const dy = Math.floor(box.minY * rs) - pad;
      const pw = Math.max(1, Math.ceil(box.maxX * rs) - dx + pad);
      const ph = Math.max(1, Math.ceil(box.maxY * rs) - dy + pad);
      const canvas = document.createElement('canvas');
      canvas.width = pw;
      canvas.height = ph;
      const ctx = canvas.getContext('2d')!;
      // world → bitmap：先按 rs 缩放再平移到以 (dx,dy) 为原点（与引擎 ObjectCache 同一套约定）
      tpl.renderTo(ctx, [rs, 0, 0, rs, -dx, -dy]);
      this.ice.removeChild(tpl);
      this.sprites[k] = { canvas, w: preset.width, h: preset.height, ox: (0 - dx) / rs, oy: (0 - dy) / rs };
    }
  }
}

export default WaterVirtualDoc;
