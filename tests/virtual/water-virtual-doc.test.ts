/**
 * 虚拟文档（`WaterVirtualDoc`）单测（2026-09-26 覆盖率补齐）。
 *
 * 这一层是"2 万符号的大图纸"的地基：列存 + 网格索引 + 窗口批量落墨 + 窗口内物化。
 * 浏览器里的回归在 `e2e/water-large.spec.ts`，但那份跑一次要几十秒、且只覆盖"正常路径"；
 * 这里用 node 直测**几何与状态机**：索引、命中精度、退化条目、编辑回流、序列化往返。
 *
 * ⚠️ 注意两个口径（都曾被线上问题验证过）：
 * ① 管线盒**不许跨全图** —— 第一趟没算坐标就写盒会得到"横跨世界"的盒，索引节点会炸到几千万；
 * ② 物化必须置 `done[i]`，否则批量层会把它再画一遍。
 */
import { ICE, EventBus, setChildSourceFor, materializeVirtualChild, restoreVirtualSource } from 'ice-render';
import WaterVirtualDoc, {
  ITEM_LABEL,
  ITEM_PIPE,
  ITEM_SYMBOL,
  WATER_VIRTUAL_DOC_TYPE,
} from '../../src/virtual/WaterVirtualDoc';
import WaterSymbol from '../../src/water/water_shapes';

/* eslint-disable @typescript-eslint/no-empty-function -- 桩：这些 CanvasRenderingContext2D 方法必须存在，但不需要行为 */

/** 极简 canvas 桩：只保证"铸精灵"这条路径在 node 下能跑完（不校验像素）。 */
function installCanvasStub(): void {
  const makeCtx = (canvas: any): any => ({
    canvas,
    measureText: (text: string) => ({ width: String(text || '').length * 6 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    setLineDash() {},
    save() {},
    restore() {},
    translate() {},
    scale() {},
    rotate() {},
    transform() {},
    setTransform() {},
    resetTransform() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    bezierCurveTo() {},
    quadraticCurveTo() {},
    arc() {},
    arcTo() {},
    ellipse() {},
    rect() {},
    fill() {},
    stroke() {},
    clip() {},
    fillRect() {},
    strokeRect() {},
    clearRect() {},
    fillText() {},
    strokeText() {},
    drawImage() {},
  });
  (globalThis as any).document = {
    createElement: (tag: string) => {
      if (tag !== 'canvas') return {};
      const canvas: any = { width: 1, height: 1, style: {} };
      canvas.getContext = () => makeCtx(canvas);
      return canvas;
    },
  };
}

function makeIce(): any {
  const ice: any = new ICE();
  ice.evtBus = new EventBus();
  ice.childNodes = [];
  ice.toolNodes = [];
  return ice;
}

/** 小尺寸文档：24 个符号 / 4 列 → 6 行，够验证"末行自连管线"这条退化路径。 */
function makeDoc(overrides: any = {}): WaterVirtualDoc {
  installCanvasStub();
  return new WaterVirtualDoc(makeIce(), { symbols: 24, cols: 4, worldW: 400, worldH: 300, ...overrides });
}

/**
 * 宽松布局的文档：`world / cols` 大于最宽的预设（140）与最高的预设（140），
 * 于是符号盒两两不重叠 —— 几何断言（命中归属、窗口遍历）只有在不重叠时才有唯一答案。
 */
function makesSpaciousDoc(): WaterVirtualDoc {
  installCanvasStub();
  return new WaterVirtualDoc(makeIce(), { symbols: 16, cols: 4, worldW: 1200, worldH: 900 });
}

const centerOf = (doc: WaterVirtualDoc, i: number): [number, number] => [
  doc.x[i] + doc.w[i] / 2,
  doc.y[i] + doc.h[i] / 2,
];

/** 假 sink：把 `paintToSvg` 的三类调用分别记下来。 */
function makeSink(): any {
  return {
    defs: [] as Array<[string, string]>,
    uses: [] as Array<[string, number, number]>,
    raws: [] as string[],
    define(id: string, body: string) {
      this.defs.push([id, body]);
    },
    use(id: string, x: number, y: number) {
      this.uses.push([id, x, y]);
    },
    raw(text: string) {
      this.raws.push(text);
    },
  };
}

describe('虚拟文档 · 列存与布局', () => {
  it('条目布局：符号 → 标注 → 管线，标注跟着自己的符号', () => {
    const doc = makeDoc();
    expect(doc.documentType).toBe(WATER_VIRTUAL_DOC_TYPE);
    expect(doc.symbolCount).toBe(24);
    expect(doc.count).toBe(72); // 24 符号 + 24 标注 + 24 管线
    expect(doc.version).toBe(1);
    expect(doc.bytes).toBeGreaterThan(0);

    expect(doc.type[0]).toBe(ITEM_SYMBOL);
    expect(doc.type[24]).toBe(ITEM_LABEL);
    expect(doc.type[48]).toBe(ITEM_PIPE);
    expect(doc.labelOf[0]).toBe(-1); // 符号自己不带归属
    expect(doc.labelOf[24]).toBe(0); // 标注归属第 0 个符号
    expect(doc.labelIndexOfSymbol(3)).toBe(27);
    // 标注紧贴符号下方（与 `materialize` 的排版口径一致）
    expect(doc.y[27]).toBe(doc.y[3] + doc.h[3]);
    expect(doc.x[27]).toBe(doc.x[3]);
  });

  it('位号 / 名称按符号下标算，且取自上游预设', () => {
    const doc = makeDoc();
    // 位号 = 预设代号 + 下标（零填充到 5 位：`GR-00000`）
    expect(doc.tagOf(0)).toMatch(/^[A-Z-]+-\d{5}$/);
    expect(doc.tagOf(12)).not.toBe(doc.tagOf(0));
    expect(doc.tagOf(12)).toMatch(/-00012$/);
    expect(doc.nameOf(0).length).toBeGreaterThan(0);
    expect(doc.kind[0]).toBeLessThan(38);
  });

  it('★ 管线盒不跨全图（第一趟不算坐标就会得到横跨世界的盒，索引节点会炸）', () => {
    const doc = makeDoc();
    const pi = doc.symbolCount * 2; // 第一条管线
    expect(doc.type[pi]).toBe(ITEM_PIPE);
    expect(doc.pipeFrom[pi]).toBe(0);
    expect(doc.pipeTo[pi]).toBe(4); // 同列的下一行
    expect(doc.w[pi]).toBeLessThan(doc.worldW / 2);
    expect(doc.h[pi]).toBeLessThanOrEqual(doc.worldH);
  });

  it('末行的自连管线是退化条目：零尺寸、进不了索引', () => {
    const doc = makeDoc();
    const lastSymbol = doc.symbolCount - 1;
    const pi = doc.symbolCount * 2 + lastSymbol;
    expect(doc.pipeFrom[pi]).toBe(doc.pipeTo[pi]);
    expect(doc.w[pi]).toBe(0);
    expect(doc.h[pi]).toBe(0);
    const seen: number[] = [];
    doc.forEachInBox(0, 0, doc.worldW, doc.worldH, (i) => seen.push(i));
    expect(seen).not.toContain(pi);
  });

  it('关掉管线选项时条目数只有符号 + 标注', () => {
    const doc = makeDoc({ pipes: false });
    expect(doc.count).toBe(48);
    expect(doc.type[47]).toBe(ITEM_LABEL);
  });

  it('参数进载荷：serializeDocument 记的是可复原的参数', () => {
    const doc = makeDoc();
    const payload = doc.serializeDocument();
    expect(payload.v).toBe(1);
    expect(payload.params).toEqual({ symbols: 24, cols: 4, worldW: 400, worldH: 300, pipes: true });
    expect(payload.edits).toEqual([]);
    expect(WATER_VIRTUAL_DOC_TYPE).toBe('ied:water-virtual-doc');
  });
});

describe('虚拟文档 · 空间索引与命中', () => {
  it('窗口遍历：只收窗口内相交的条目，且同一项不重复访问', () => {
    const doc = makeDoc();
    const all: number[] = [];
    doc.forEachInBox(0, 0, doc.worldW, doc.worldH, (i) => all.push(i));
    // 全窗口 = 全部非退化条目（标注不进索引，所以它是"符号数 + 有效管线数"）
    let degenerate = 0;
    for (let pi = doc.symbolCount * 2; pi < doc.count; pi++) {
      if (doc.pipeFrom[pi] === doc.pipeTo[pi]) degenerate++;
    }
    // 栅格列数从管线目标反推（`cols` 是私有的）：第 0 条有效管线的目标就是"同列下一行"
    const cols = doc.pipeTo[doc.symbolCount * 2];
    expect(degenerate).toBe(doc.symbolCount % cols === 0 ? cols : doc.symbolCount % cols); // 末行整行自连
    expect(all.length).toBe(doc.symbolCount + (doc.symbolCount - degenerate));
    expect(new Set(all).size).toBe(all.length);
    expect(all.some((i) => doc.type[i] === ITEM_LABEL)).toBe(false);
  });

  it('窗口遍历：盯住一个符号的盒，命中的符号只有它自己（管线的盒含它的中心，会一起被收进来）', () => {
    const doc = makesSpaciousDoc();
    const target = 5;
    const hit: number[] = [];
    doc.forEachInBox(doc.x[target], doc.y[target], doc.x[target] + doc.w[target], doc.y[target] + doc.h[target], (i) =>
      hit.push(i)
    );
    expect(hit).toContain(target);
    expect(hit.filter((i) => doc.type[i] === ITEM_SYMBOL)).toEqual([target]);
    hit
      .filter((i) => doc.type[i] === ITEM_PIPE)
      .forEach((i) => expect([doc.pipeFrom[i], doc.pipeTo[i]]).toContain(target));
  });

  it('命中：符号盒的角落点中它自己；世界之外返回 -1', () => {
    const doc = makesSpaciousDoc();
    expect(doc.hitTest(doc.x[7] + 2, doc.y[7] + 2)).toBe(7);
    expect(doc.hitTest(doc.worldW + 5000, doc.worldH + 5000)).toBe(-1);
    // 中心点是"符号中心"，而它的出线正是从中心出发的 —— 点到中心允许命中那条管线
    const [cx, cy] = centerOf(doc, 7);
    const atCenter = doc.hitTest(cx, cy);
    expect(
      atCenter === 7 ||
        (doc.type[atCenter] === ITEM_PIPE && (doc.pipeFrom[atCenter] === 7 || doc.pipeTo[atCenter] === 7))
    ).toBe(true);
  });

  it('命中：标注不进索引，点到标注的坐标只可能归它的符号或相邻管线（不会命中标注本身）', () => {
    const doc = makesSpaciousDoc();
    const labelY = doc.y[doc.symbolCount + 7];
    const at = doc.hitTest(doc.x[7] + 30, labelY + 2);
    // 命中不到任何东西、或命中它的符号 / 管线，但**绝不是标注本身**
    expect(at === -1 || doc.type[at] !== ITEM_LABEL).toBe(true);
  });

  it('命中：管线的正交路由上点得中（横 → 竖 → 横）', () => {
    const doc = makeDoc();
    const pi = doc.symbolCount * 2;
    const a = doc.pipeFrom[pi];
    const b = doc.pipeTo[pi];
    const ax = doc.x[a] + doc.w[a] / 2;
    const ay = doc.y[a] + doc.h[a] / 2;
    const bx = doc.x[b] + doc.w[b] / 2;
    const by = doc.y[b] + doc.h[b] / 2;
    const midX = ax + (bx - ax) * 0.5;
    expect(doc.hitTest(midX, (ay + by) / 2)).toBe(pi);
  });

  it('重建索引是幂等的（载入快照贴完编辑会再跑一次）', () => {
    const doc = makeDoc();
    const before: number[] = [];
    doc.forEachInBox(0, 0, doc.worldW, doc.worldH, (i) => before.push(i));
    doc.rebuildIndex();
    const after: number[] = [];
    doc.forEachInBox(0, 0, doc.worldW, doc.worldH, (i) => after.push(i));
    expect(after.sort()).toEqual(before.sort());
  });

  it('boxAt 给出世界盒；条目跨多格时索引节点数组会按需扩容', () => {
    const doc = makeDoc();
    const out = new Float64Array(4);
    doc.boxAt(1, out);
    expect([out[0], out[1], out[2], out[3]]).toEqual([doc.x[1], doc.y[1], doc.x[1] + doc.w[1], doc.y[1] + doc.h[1]]);

    // 高瘦世界：管线要跨好几行，每条落进几十个格子 → 节点数超过初始容量（`count * 2`），
    // 逼出 `__addNode` 的扩容分支；扩容之后链表仍然不重不漏
    const tall = makeDoc({ symbols: 200, cols: 10, worldW: 10000, worldH: 100000 });
    const seen: number[] = [];
    tall.forEachInBox(0, 0, tall.worldW, tall.worldH, (i) => seen.push(i));
    expect(seen.length).toBeGreaterThan(0);
    expect(new Set(seen).size).toBe(seen.length);
  });
});

describe('虚拟文档 · 批量落墨与物化', () => {
  it('paint：窗口内的符号与管线落墨，标注不批量画', () => {
    const doc = makeDoc();
    const drawn: string[] = [];
    const ctx: any = {
      save() {},
      restore() {},
      setLineDash() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      stroke() {},
      drawImage() {
        drawn.push('sprite');
      },
    };
    const view = { x0: 0, y0: 0, x1: doc.worldW, y1: doc.worldH, scale: 1 };
    expect(doc.paint(ctx, view)).toBe(true);
    expect(doc.lastView).toBe(view);
    expect(doc.drawCalls).toBeGreaterThan(0);
    expect(drawn.length).toBeGreaterThan(0);
  });

  it('★ 物化后批量层让位（done 不置位就会画两遍）', () => {
    const doc = makeDoc();
    doc.syncLabelsOnPaint = false;
    const ctx: any = {
      save() {},
      restore() {},
      setLineDash() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      stroke() {},
      drawImage() {},
    };
    const view = { x0: 0, y0: 0, x1: doc.worldW, y1: doc.worldH, scale: 1 };
    doc.paint(ctx, view);
    const before = doc.drawCalls;

    const symbol = doc.materialize(9) as WaterSymbol;
    expect(symbol.state.id).toBe('vs-9');
    expect(symbol.state.tag).toBe(doc.tagOf(9));
    expect(symbol.state.name).toBe(doc.nameOf(9));
    expect(doc.done[9]).toBe(1);
    expect(doc.liveComponents.get(9)).toBe(symbol);
    doc.paint(ctx, view);
    expect(doc.drawCalls).toBeLessThan(before);
  });

  it('物化标注 → ICEText（位号 + 名称），物化管线 → WaterPipe（带介质与管径）', () => {
    const doc = makeDoc();
    const label = doc.materialize(doc.symbolCount + 2) as any;
    expect(label.state.text).toBe(`${doc.tagOf(2)} ${doc.nameOf(2)}`);
    expect(doc.done[doc.symbolCount + 2]).toBe(1);

    const pi = doc.symbolCount * 2 + 2;
    const pipe = doc.materialize(pi) as any;
    expect(pipe.state.id).toBe(`vp-${pi}`);
    expect(String(pipe.state.dn)).toMatch(/^DN\d+/);
    expect(pipe.state.medium).toBeTruthy();
  });

  it('挂上虚拟层：引擎侧已物化的子项要被认领（否则拖动写不回列存）', () => {
    const doc = makeDoc();
    const container: any = {
      childNodes: [],
      addChild(child: any) {
        child.parentNode = this;
        this.childNodes.push(child);
      },
      removeChild(child: any) {
        this.childNodes = this.childNodes.filter((item: any) => item !== child);
      },
    };
    setChildSourceFor(container, doc);
    const child = materializeVirtualChild(container, 4);
    expect(child).toBeTruthy();
    expect(doc.done[4]).toBe(1);

    // 换一个文档实例模拟"从快照读回"：attachLayer 要把引擎那份映射捡回来
    const reopened = makeDoc();
    reopened.attachLayer(container);
    expect(reopened.liveComponents.get(4)).toBe(child);
  });

  it('窗口内的标注同步：没有层时安全返回，有层时按滞后带扫描', () => {
    const doc = makeDoc();
    expect(() => doc.syncLabels({ x0: 0, y0: 0, x1: 100, y1: 100, scale: 1 } as any)).not.toThrow();

    const container: any = { childNodes: [], addChild() {}, removeChild() {} };
    doc.attachLayer(container);
    const visited: number[] = [];
    doc.windowItems({ x0: 0, y0: 0, x1: 60, y1: 60, scale: 1 } as any, (i) => visited.push(i));
    expect(visited.length).toBeGreaterThan(0);
    expect(() => doc.syncLabels({ x0: 0, y0: 0, x1: 60, y1: 60, scale: 1 } as any)).not.toThrow();
  });
});

describe('虚拟文档 · 编辑回流与快照往返', () => {
  it('applyPatch 挪符号时标注跟着走，越界下标返回 false', () => {
    const doc = makeDoc();
    const labelIndex = doc.symbolCount + 6;
    expect(doc.applyPatch(6, { left: 123, top: 45 })).toBe(true);
    expect(doc.x[6]).toBe(123);
    expect(doc.y[6]).toBe(45);
    expect(doc.x[labelIndex]).toBe(123);
    expect(doc.y[labelIndex]).toBe(45 + doc.h[6]);
    expect(doc.version).toBe(2);

    expect(doc.applyPatch(-1, { left: 1 })).toBe(false);
    expect(doc.applyPatch(doc.count, { left: 1 })).toBe(false);
    expect(doc.applyPatch(6, { name: '只改名字' })).toBe(true); // 不认识的位置字段 → 不动位置
  });

  it('onChildPatched 是 applyPatch 的回流入口（引擎拖动 / 属性面板改完调它）', () => {
    const doc = makeDoc();
    doc.onChildPatched(8, { left: 42, top: 24 });
    expect(doc.x[8]).toBe(42);
    expect(doc.y[8]).toBe(24);
    expect(doc.y[doc.symbolCount + 8]).toBe(24 + doc.h[8]);
  });

  it('物化组件被拖动后写回列存，并记进 edits', () => {
    const doc = makeDoc();
    const symbol: any = doc.materialize(11);
    symbol.setState({ left: 777, top: 555 });
    doc.syncEditsFromComponents();
    expect(doc.x[11]).toBe(777);
    expect(doc.y[11]).toBe(555);
    const payload = doc.serializeDocument();
    expect(payload.edits).toEqual([[11, 777, 555]]);
  });

  it('★ 载荷往返：列存按参数确定性重建，编辑贴回去、索引重建', () => {
    // 用宽松布局：符号盒不重叠，"新位置能命中该符号"才有唯一答案
    const doc = makesSpaciousDoc();
    doc.applyPatch(3, { left: 111.234, top: 222.567 });
    const payload = doc.serializeDocument();
    // 坐标按两位小数入载荷（可读、可 diff）
    expect(payload.edits).toEqual([[3, 111.23, 222.57]]);

    const reopened = WaterVirtualDoc.fromPayload(payload, makeIce());
    expect(reopened.count).toBe(doc.count);
    // 载荷里的坐标是两位小数的（可读、可 diff），所以复原的是取整后的值
    const [, editX, editY] = payload.edits[0];
    expect(editX).toBe(111.23);
    expect(editY).toBe(222.57);
    expect(reopened.x[3]).toBeCloseTo(editX, 2);
    expect(reopened.x[reopened.symbolCount + 3]).toBeCloseTo(editX, 2);
    expect(reopened.y[reopened.symbolCount + 3]).toBeCloseTo(editY + reopened.h[3], 2);
    // 重建过索引 → 新位置能找到该符号
    expect(reopened.hitTest(editX + 2, editY + 2)).toBe(3);
    // 非法编辑（下标越界）被忽略
    const ignored = WaterVirtualDoc.fromPayload({ params: payload.params, edits: [[999, 1, 2]] }, makeIce());
    expect(ignored.edits).toEqual([]);
  });

  it('文档包围盒就是生成用的世界尺寸', () => {
    const doc = makeDoc();
    const out = new Float64Array(4);
    expect(doc.documentBounds(out)).toBe(true);
    expect([out[0], out[1], out[2], out[3]]).toEqual([0, 0, 400, 300]);
  });
});

describe('虚拟文档 · 全量 SVG 导出', () => {
  it('每个 kind 一份 def + 每个实例一条 use；管线与标注直接写', () => {
    const doc = makeDoc();
    const sink = makeSink();
    expect(doc.paintToSvg(sink)).toBe(true);
    // def 按 kind 惰性生成，且同一 kind 只定义一次
    const ids = sink.defs.map((item: any) => item[0]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(sink.defs.length).toBeGreaterThan(0);
    expect(sink.uses.length).toBe(doc.symbolCount);
    // 管线（非退化）+ 标注各一条 raw
    expect(sink.raws.length).toBeGreaterThan(doc.symbolCount);
    expect(sink.raws.some((text: string) => text.indexOf('<polyline') === 0)).toBe(true);
    expect(sink.raws.some((text: string) => text.indexOf('<text') === 0)).toBe(true);
  });

  it('已物化的条目交给引擎自己导出，虚拟层不重复写', () => {
    const doc = makeDoc();
    doc.materialize(2);
    const labelIndex = doc.symbolCount + 2;
    // 标注那条单独物化（引擎导出的是真组件）
    doc.done[labelIndex] = 1;
    const sink = makeSink();
    doc.paintToSvg(sink);
    expect(sink.uses.length).toBe(doc.symbolCount - 1);
    expect(sink.raws.filter((text: string) => text.indexOf('<text') === 0).length).toBe(doc.symbolCount - 1);
  });

  it('标注里的 XML 特殊字符要转义（导出的是文档，不能把 & < > " 原样塞进 SVG）', () => {
    const doc = makeDoc();
    (doc as any).tagOf = () => 'A&B';
    (doc as any).nameOf = () => '<泵>"1"';
    const sink = makeSink();
    doc.paintToSvg(sink);
    const texts = sink.raws.filter((text: string) => text.indexOf('<text') === 0);
    expect(texts.length).toBe(doc.symbolCount);
    expect(texts[0]).toContain('A&amp;B');
    expect(texts[0]).toContain('&lt;泵&gt;&quot;1&quot;');
    expect(texts[0]).not.toContain('<泵>');
  });
});

describe('虚拟文档 · 与引擎的注册 / 反序列化接缝', () => {
  it('★ 文档载荷 → 反序列化：工厂在模块加载时已注册，列存按参数重建并接回容器', () => {
    const doc = makeDoc();
    doc.applyPatch(2, { left: 55, top: 66 });
    // 与引擎 `virtualBlockOf()` 写出的形状一致（该函数没在包根导出，这里按契约手工构造）
    const block = {
      type: WATER_VIRTUAL_DOC_TYPE,
      count: doc.count,
      version: doc.version,
      payload: doc.serializeDocument(),
    };
    expect(block.payload.params.symbols).toBe(24);

    const reopenedContainer: any = { childNodes: [], addChild() {}, removeChild() {} };
    const restored = restoreVirtualSource(reopenedContainer, block, makeIce()) as WaterVirtualDoc;
    expect(restored).toBeTruthy();
    expect(restored.count).toBe(doc.count);
    expect(restored.x[2]).toBeCloseTo(55, 2);
    // 未注册的类型：跳过并告警（不抛）
    expect(restoreVirtualSource(reopenedContainer, { type: 'ied:not-registered' }, makeIce())).toBeNull();
    // 没有 ice 上下文时工厂安全返回 null（不抛）
    expect(restoreVirtualSource(reopenedContainer, block, null as any)).toBeNull();
  });
});
