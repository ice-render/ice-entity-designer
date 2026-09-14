/**
 * 给水排水工艺流程图（水厂 / 污水厂）符号库。
 *
 * **记法依据**：GB/T 50106《建筑给水排水制图标准》的图例体系（管道、阀门、仪表等通用图例），
 * 工艺单元（格栅、沉砂池、生物池、二沉池…）按工艺专业通行画法自绘。
 * 与其它域包同一条铁律：**记法不可变换**（符号尺寸与朝向是记法的一部分，只能拖动）。
 */
import { ICE, EventBus } from 'ice-render';
import WaterSymbol, {
  WATER_SYMBOL_KINDS,
  WATER_SYMBOL_PRESETS,
  WATER_MEDIUM_STYLES,
  WATER_UNIT_KINDS,
  WATER_EQUIPMENT_KINDS,
} from '../../src/water/water_shapes';

describe('给水排水符号库 · 预设', () => {
  it('每个 kind 都有中文名、默认尺寸与文字符号，且覆盖主流 AAO 工艺链', () => {
    WATER_SYMBOL_KINDS.forEach((kind) => {
      const preset = WATER_SYMBOL_PRESETS[kind];
      expect(preset).toBeTruthy();
      expect(preset.label.length).toBeGreaterThan(0);
      expect(preset.width).toBeGreaterThan(0);
      expect(preset.height).toBeGreaterThan(0);
    });
    // AAO 主线必须在库里
    [
      'barScreen',
      'gritChamber',
      'primaryClarifier',
      'anaerobicTank',
      'anoxicTank',
      'aerobicTank',
      'secondaryClarifier',
      'disinfectionTank',
    ].forEach((kind) => expect(WATER_SYMBOL_KINDS).toContain(kind));
    // 污泥线必须在库里
    ['sludgeThickener', 'dewateringMachine', 'sludgeOut'].forEach((kind) => expect(WATER_SYMBOL_KINDS).toContain(kind));
  });

  it('处理单元 / 设备 / 边界三类分得开（校验规则要用）', () => {
    WATER_UNIT_KINDS.forEach((kind) => expect(WATER_SYMBOL_KINDS).toContain(kind));
    WATER_EQUIPMENT_KINDS.forEach((kind) => expect(WATER_SYMBOL_KINDS).toContain(kind));
    expect(WATER_UNIT_KINDS).not.toContain('pump');
    expect(WATER_EQUIPMENT_KINDS).toContain('pump');
  });

  it('介质样式齐备：污水 / 污泥 / 空气 / 药剂 / 出水 / 回流', () => {
    ['sewage', 'sludge', 'air', 'chemical', 'effluent', 'recycle'].forEach((medium) => {
      const style = (WATER_MEDIUM_STYLES as any)[medium];
      expect(style).toBeTruthy();
      expect(style.color).toMatch(/^#/);
      expect(['solid', 'dashed']).toContain(style.lineType);
    });
  });
});

describe('给水排水符号库 · 组件契约', () => {
  function makeIce(): any {
    const ice: any = new ICE();
    ice.evtBus = new EventBus();
    ice.childNodes = [];
    ice.toolNodes = [];
    return ice;
  }

  it('稳定 typeId（序列化靠它，不靠类名）', () => {
    expect(WaterSymbol.typeId).toBe('ice-entity-designer:WaterSymbol');
  });

  it('记法不可变换：只允许拖动', () => {
    const symbol = new WaterSymbol({ kind: 'aerobicTank', name: '好氧池' });
    expect(symbol.state.transformable).toBe(false);
    expect(symbol.state.draggable).toBe(true);
  });

  it('内部形状是派生的（不进文档），但真实子节点要能序列化', () => {
    const symbol = new WaterSymbol({ kind: 'pump', name: '1#提升泵' });
    expect(symbol.hasDerivedChildren()).toBe(true);
    expect(typeof symbol.getSerializableChildren).toBe('function');
    expect(symbol.getSerializableChildren().length).toBe(0);
    expect(symbol.parts.length).toBeGreaterThan(0);
  });

  it('改 kind / 尺寸会重建派生形状，文字符号跟着走', () => {
    const ice = makeIce();
    const symbol: any = new WaterSymbol({ kind: 'pump', name: '1#提升泵', tag: 'P-101' });
    ice.addChild(symbol);
    const before = symbol.parts.length;
    symbol.setState({ kind: 'blower', tag: 'B-201' });
    expect(symbol.parts.length).toBeGreaterThan(0);
    expect(symbol.state.kind).toBe('blower');
    expect(typeof before).toBe('number');
  });
});
