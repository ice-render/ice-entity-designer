/**
 * 电力一次系统图（单线图）符号库规格测试。
 *
 * 这些断言是**对着 JB/T 5872-1991《高压开关设备电气图形及文字符号》的图例**写的：
 * 符号的「含义」靠**可辨识的构成要素**锁住（断路器有灭弧叉、隔离开关有静触头横杠、
 * 负荷开关有顶端小圆、接地开关/接地有三横接地符号、TA 有圆+电流方向折线、TV/TM 是相扣圆…），
 * 而不是靠像素坐标 —— 外观可以调，记法不能错。
 */
import { ICE, EventBus } from 'ice-render';
import PowerSymbol, { POWER_SYMBOL_KINDS, POWER_SYMBOL_PRESETS, POWER_STYLE } from '../../src/power/power_shapes';

function makeSymbol(kind: string, props: any = {}) {
  const ice: any = new ICE();
  ice.evtBus = new EventBus();
  ice.childNodes = [];
  ice.toolNodes = [];
  const symbol = new PowerSymbol({ kind, ...props });
  ice.addChild(symbol);
  return symbol;
}

function roles(symbol: any): string[] {
  return symbol.parts.map((item: any) => item.role);
}

function roleCount(symbol: any, role: string): number {
  return symbol.parts.filter((item: any) => item.role === role).length;
}

describe('电力符号库 · 文字符号（JB/T 5872 / GB/T 7159 口径）', () => {
  it('符号清单覆盖一次系统图的核心设备，文字符号逐个对应', () => {
    const expected: Record<string, string> = {
      busbar: 'W',
      breaker: 'QF',
      disconnector: 'QS',
      loadSwitch: 'QL',
      earthingSwitch: 'QE',
      earth: 'E',
      currentTransformer: 'TA',
      voltageTransformer: 'TV',
      transformer: 'TM',
      fuse: 'FU',
      arrester: 'F',
      reactor: 'L',
      generator: 'G',
      motor: 'M',
    };
    Object.keys(expected).forEach((kind) => {
      expect(POWER_SYMBOL_PRESETS[kind as any].tag).toBe(expected[kind]);
    });
    // 清单本身也要包含这些 kind（防止 preset 与 kind 列表脱节）
    Object.keys(expected).forEach((kind) => {
      expect(POWER_SYMBOL_KINDS).toContain(kind as any);
    });
  });
});

describe('电力符号库 · 开关电器：靠可辨识要素区分 QF / QS / QL / QE', () => {
  it('断路器 QF：有灭弧叉（×）+ 斜刀臂；没有静触头横杠', () => {
    const breaker = makeSymbol('breaker');
    expect(roleCount(breaker, 'arcMark')).toBe(2); // × 由两条交叉线构成
    expect(roles(breaker)).toContain('blade');
    expect(roles(breaker)).not.toContain('contactBar');
    expect(roles(breaker)).not.toContain('earth');
  });

  it('隔离开关 QS：有静触头横杠（可见断口）；没有灭弧叉', () => {
    const disconnector = makeSymbol('disconnector');
    expect(roles(disconnector)).toContain('contactBar');
    expect(roles(disconnector)).toContain('blade');
    expect(roleCount(disconnector, 'arcMark')).toBe(0);
    expect(roles(disconnector)).not.toContain('contactCircle');
  });

  it('负荷开关 QL：顶端是空心小圆（既不是灭弧叉，也不是静触头横杠）', () => {
    const loadSwitch = makeSymbol('loadSwitch');
    expect(roles(loadSwitch)).toContain('contactCircle');
    expect(roleCount(loadSwitch, 'arcMark')).toBe(0);
    expect(roles(loadSwitch)).not.toContain('contactBar');
  });

  it('接地开关 QE：开关本体 + 接地符号（三条递减横线）', () => {
    const earthingSwitch = makeSymbol('earthingSwitch');
    expect(roles(earthingSwitch)).toContain('blade');
    expect(roleCount(earthingSwitch, 'earth')).toBe(3);
  });

  it('接地 E：只有接地符号，没有刀臂（它不是开关）', () => {
    const earth = makeSymbol('earth');
    expect(roleCount(earth, 'earth')).toBe(3);
    expect(roles(earth)).not.toContain('blade');
  });

  it('符号按「无激励、无外力」的正常状态绘制：刀臂是断开的斜线，不是闭合的竖线', () => {
    const breaker = makeSymbol('breaker');
    const blade = breaker.part('blade');
    const [start, end] = blade.state.points;
    // 断开状态：刀臂起点与终点在 x 上有明显偏移（闭合状态会是同一竖直线上）
    expect(Math.abs(start[0] - end[0])).toBeGreaterThan(4);
  });
});

describe('电力符号库 · 互感器与变压器', () => {
  it('电流互感器 TA：导线穿过一个圆 + 电流方向折线标记', () => {
    const ct = makeSymbol('currentTransformer');
    expect(roles(ct)).toContain('winding');
    expect(roles(ct)).toContain('polarityMark');
    // 一次导线是贯穿的
    const lead = ct.part('leadTop');
    expect(lead.state.points[0][1]).toBe(0);
    expect(lead.state.points[1][1]).toBe(ct.state.height);
  });

  it('电压互感器 TV：两个相扣的圆（一次 / 二次绕组）', () => {
    const pt = makeSymbol('voltageTransformer');
    expect(roles(pt)).toContain('windingPrimary');
    expect(roles(pt)).toContain('windingSecondary');
    expect(roles(pt)).not.toContain('polarityMark');
  });

  it('变压器 TM：两个相扣圆 + 绕组联结标记（上 △ 下 Y）', () => {
    const transformer = makeSymbol('transformer');
    expect(roles(transformer)).toContain('windingPrimary');
    expect(roles(transformer)).toContain('windingSecondary');
    expect(transformer.part('windingMarkHigh').state.text).toBe('△');
    expect(transformer.part('windingMarkLow').state.text).toBe('Y');
  });
});

describe('电力符号库 · 其余一次设备', () => {
  it('熔断器 FU：细长矩形套在导线上', () => {
    const fuse = makeSymbol('fuse');
    const body = fuse.part('fuseBody');
    expect(roles(fuse)).toContain('fuseBody');
    expect(body.state.height).toBeGreaterThan(body.state.width);
  });

  it('避雷器 F：矩形 + 内部放电箭头', () => {
    const arrester = makeSymbol('arrester');
    expect(roles(arrester)).toContain('arresterBody');
    expect(roles(arrester)).toContain('dischargeArrow');
    expect(roles(arrester)).toContain('dischargeArrowHead');
  });

  it('电抗器 L：线圈（半圆弧）—— 不是矩形也不是圆', () => {
    const reactor = makeSymbol('reactor');
    expect(roleCount(reactor, 'coil')).toBe(2);
    expect(roles(reactor)).not.toContain('fuseBody');
    expect(roles(reactor)).not.toContain('body');
  });

  it('发电机 G / 电动机 M：圆 + 圆内字母', () => {
    const generator = makeSymbol('generator');
    expect(roles(generator)).toContain('body');
    expect(generator.part('letter').state.text).toBe('G');

    const motor = makeSymbol('motor');
    expect(roles(motor)).toContain('body');
    expect(motor.part('letter').state.text).toBe('M');
  });

  it('母线 W：加粗实线（比普通符号线宽粗）', () => {
    const busbar = makeSymbol('busbar');
    expect(roles(busbar)).toContain('busbar');
    // 画出来的是「加粗实线」：矩形高度 = heavyLineWidth，比普通符号线宽粗
    expect(busbar.part('busbar').state.height).toBe(POWER_STYLE.heavyLineWidth);
    expect(POWER_STYLE.heavyLineWidth).toBeGreaterThan(POWER_STYLE.lineWidth);
    expect(busbar.state.width).toBeGreaterThan(200);
  });
});

describe('电力符号库 · 外观统一与文档形态', () => {
  it('所有线性部件共用同一套描边色与线宽（外观统一是硬要求）', () => {
    POWER_SYMBOL_KINDS.forEach((kind: any) => {
      const symbol = makeSymbol(kind);
      // 只看线性部件（points 是折线的标识；圆/矩形的描边走 state.style 但另有几何字段）
      const lineParts = symbol.parts.filter((item: any) => !!item.component.state.points);
      lineParts.forEach((item: any) => {
        const style = item.component.state.style || {};
        expect(style.strokeStyle).toBe(POWER_STYLE.strokeStyle);
        expect(style.lineWidth).toBe(POWER_STYLE.lineWidth);
      });
    });
  });

  it('文字符号统一：位置在符号右下、字号 10、颜色一致', () => {
    POWER_SYMBOL_KINDS.forEach((kind: any) => {
      const symbol = makeSymbol(kind);
      const tag = symbol.part('tag');
      expect(tag).toBeTruthy();
      expect(tag.state.text).toBe(POWER_SYMBOL_PRESETS[kind].tag);
      expect(tag.state.style.fontSize).toBe(POWER_STYLE.tagFontSize);
      expect(tag.state.style.fillStyle).toBe(POWER_STYLE.tagColor);
    });
  });

  it('内部形状是派生部件：不进文档（hasDerivedChildren）', () => {
    const symbol = makeSymbol('breaker');
    expect(symbol.hasDerivedChildren()).toBe(true);
    expect((symbol as any).equalsWithProps).toBeUndefined();
  });

  it('改 kind 会重建记法（属性面板切换设备类型）', () => {
    const symbol = makeSymbol('breaker');
    expect(roleCount(symbol, 'arcMark')).toBe(2);
    symbol.applyPatch({ kind: 'disconnector' });
    expect(roleCount(symbol, 'arcMark')).toBe(0);
    expect(roles(symbol)).toContain('contactBar');
  });
});

/**
 * 第一批补齐的符号。记法出处：
 * - GB/T 4728.4-2005（基本无源元件）：电容器 = 两块平行板；
 * - GB/T 4728.6-2000（电能的发生与转换）：一个圆表示一个绕组 → 三绕组变压器 = 三个圆；
 * - GB/T 4728.3-1998（导体和连接器件）：电缆 = 导线 + 胶囊形包裹；电缆密封终端 = 导线 + 喇叭口；
 * - GB/T 4728.1-85（总则）：方框符号只表示设备/元件、不反映细节（GIS 间隔、开关柜整体）；
 * - JB/T 5872-1991：消弧线圈 = 线圈 + 接地符号。
 */
describe('电力符号库 · 第一批补齐（电容器 / 消弧线圈 / 三绕组变 / 接地设备 / 电缆）', () => {
  it('并联电容器：两块平行板 + 上下引线（GB/T 4728.4 S00567）', () => {
    const capacitor = makeSymbol('capacitor');
    const top = capacitor.part('plateTop');
    const bottom = capacitor.part('plateBottom');
    expect(roles(capacitor)).toContain('leadTop');
    expect(roles(capacitor)).toContain('leadBottom');
    // 两块板都是水平线、等长，且上下分开
    expect(Math.round(top.state.points[0][1])).toBe(Math.round(top.state.points[1][1]));
    const topWidth = Math.abs(top.state.points[1][0] - top.state.points[0][0]);
    const bottomWidth = Math.abs(bottom.state.points[1][0] - bottom.state.points[0][0]);
    expect(topWidth).toBe(bottomWidth);
    expect(bottom.state.points[0][1]).toBeGreaterThan(top.state.points[0][1]);
  });

  it('消弧线圈：线圈（多段弧）+ 接地符号（JB/T 5872）', () => {
    const coil = makeSymbol('arcSuppressionCoil');
    expect(roleCount(coil, 'coil')).toBeGreaterThanOrEqual(3);
    expect(roleCount(coil, 'earth')).toBe(3);
    expect(roles(coil)).not.toContain('plateTop'); // 不是电容器
  });

  it('三绕组变压器：三个相扣圆（GB/T 4728.6「一个圆表示一个绕组」）', () => {
    const transformer = makeSymbol('threeWindingTransformer');
    expect(roles(transformer)).toContain('windingHigh');
    expect(roles(transformer)).toContain('windingMid');
    expect(roles(transformer)).toContain('windingLow');
    expect(roles(transformer)).toContain('leadTop');
    expect(roles(transformer)).toContain('leadBottom');
  });

  it('接地变 / 接地电阻：都带接地符号，但本体分别是「两圆」与「矩形」', () => {
    const groundingTransformer = makeSymbol('groundingTransformer');
    expect(roleCount(groundingTransformer, 'earth')).toBe(3);
    expect(roles(groundingTransformer)).toContain('windingPrimary');
    expect(roles(groundingTransformer)).toContain('windingSecondary');

    const groundingResistor = makeSymbol('groundingResistor');
    expect(roleCount(groundingResistor, 'earth')).toBe(3);
    expect(roles(groundingResistor)).toContain('resistorBody');
    expect(roles(groundingResistor)).not.toContain('windingPrimary');
  });

  it('电缆 / 电缆终端：导线 + 胶囊包裹 / 导线 + 喇叭口（GB/T 4728.3）', () => {
    const cable = makeSymbol('cable');
    expect(roles(cable)).toContain('cableEnvelope');
    const envelope = cable.part('cableEnvelope');
    // 胶囊是圆角矩形：宽 < 高、带 radius
    expect(envelope.state.width).toBeLessThan(envelope.state.height);
    expect(envelope.state.radius).toBeGreaterThan(0);
    // 导线是贯穿的
    expect(cable.part('leadTop').state.points[0][1]).toBe(0);

    const termination = makeSymbol('cableTermination');
    expect(roles(termination)).toContain('terminationFlare');
    // 喇叭口是折线，且末端比首端宽
    const flare = termination.part('terminationFlare').state.points;
    const startWidth = Math.abs(flare[1][0] - flare[0][0]);
    const endWidth = Math.abs(flare[3][0] - flare[2][0]);
    expect(endWidth).toBeGreaterThan(startWidth);
  });

  it('间隔 / 开关柜：方框符号（GB/T 4728.1）+ 内部分隔线', () => {
    const cubicle = makeSymbol('cubicle');
    expect(roles(cubicle)).toContain('cabinet');
    expect(roles(cubicle)).toContain('cabinetDivider');
    const cabinet = cubicle.part('cabinet');
    expect(cabinet.state.width).toBeGreaterThan(150); // 能装下内部设备/标注
    expect(cabinet.state.height).toBeGreaterThan(100);
  });

  it('新符号的文字符号也在列（C / TM / W / GIS）', () => {
    expect(POWER_SYMBOL_PRESETS.capacitor.tag).toBe('C');
    expect(POWER_SYMBOL_PRESETS.threeWindingTransformer.tag).toBe('TM');
    expect(POWER_SYMBOL_PRESETS.groundingTransformer.tag).toBe('TM');
    expect(POWER_SYMBOL_PRESETS.cable.tag).toBe('W');
    expect(POWER_SYMBOL_PRESETS.cubicle.tag).toBe('GIS');
  });
});

/**
 * 一次系统图的符号**只能拖动，不能变换**（缩放/旋转/斜切都不允许）。
 *
 * 理由：符号的尺寸与朝向是记法的一部分 —— 断路器刀臂的角度、变压器两圆的直径、
 * 母线的粗细都有统一比例，拉大拉小或旋转会直接破坏记法与外观统一；
 * 图纸整体的缩放走「视图缩放」（滚轮 / ICE.zoomAt），引擎把这两件事严格分开（架构文档 11 号）。
 * 需要变尺寸的元素（母线长度、柜体宽高）由属性面板的数值输入改，而不是拖变换手柄。
 */
describe('电力符号库 · 记法不可变换（只允许拖动）', () => {
  it('所有符号默认 transformable=false，但可拖动、可点选', () => {
    POWER_SYMBOL_KINDS.forEach((kind: any) => {
      const symbol = makeSymbol(kind);
      expect(symbol.state.transformable).toBe(false);
      expect(symbol.state.draggable).toBe(true);
      expect(symbol.state.interactive).toBe(true);
    });
  });

  it('拖动仍然生效（位置变化会派发 AFTER_MOVE，供连线跟随）', () => {
    const symbol = makeSymbol('breaker');
    const moved: string[] = [];
    symbol.on('AFTER_MOVE', () => moved.push('moved'));
    symbol.setPosition(symbol.state.left + 40, symbol.state.top + 20);
    expect(moved.length).toBeGreaterThan(0);
  });

  it('尺寸类符号（母线 / 柜体）靠参数改尺寸，而不是变换手柄', () => {
    const busbar = makeSymbol('busbar');
    expect(busbar.state.transformable).toBe(false);
    busbar.applyPatch({ width: 480 });
    expect(busbar.state.width).toBe(480);
    // 记法随之重建：母线画出来仍是「加粗实线」
    expect(busbar.part('busbar').state.height).toBe(POWER_STYLE.heavyLineWidth);
  });
});
