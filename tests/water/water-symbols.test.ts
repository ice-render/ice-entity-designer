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

  it('自控与仪表的补充图元齐备（电动阀 / 止回阀 / 液位计 / 压力表 / 变频器 / 潜污泵 / 螺杆泵）', () => {
    const extra = [
      'submersiblePump',
      'screwPump',
      'motorValve',
      'checkValve',
      'levelGauge',
      'pressureGauge',
      'vfd',
      'storageTank',
      'sludgeSilo',
      'deodorizer',
    ];
    extra.forEach((kind) => expect(WATER_SYMBOL_KINDS).toContain(kind));
    // 串联在管线上的要标 inline（画法与端口都用它）：电动阀 / 止回阀是通路上的元件
    expect(WATER_SYMBOL_PRESETS.motorValve.inline).toBe(true);
    expect(WATER_SYMBOL_PRESETS.checkValve.inline).toBe(true);
    // 仪表与在线设备不占据管线（挂在池体 / 管道旁）
    expect(WATER_SYMBOL_PRESETS.levelGauge.inline).toBe(false);
    expect(WATER_SYMBOL_PRESETS.pressureGauge.inline).toBe(false);
    // 位号代号按行业习惯
    expect(WATER_SYMBOL_PRESETS.motorValve.tag).toBe('MOV');
    expect(WATER_SYMBOL_PRESETS.checkValve.tag).toBe('CV');
    expect(WATER_SYMBOL_PRESETS.levelGauge.tag).toBe('LT');
    expect(WATER_SYMBOL_PRESETS.pressureGauge.tag).toBe('PT');
    expect(WATER_SYMBOL_PRESETS.vfd.tag).toBe('VFD');
  });

  it('新增图元都画得出来（派生形状 ≥ 2 个），且泥线单元走污泥配色', () => {
    const ice: any = new ICE();
    const bus = new EventBus();
    ice.evtBus = bus;
    const extra = [
      'submersiblePump',
      'screwPump',
      'motorValve',
      'checkValve',
      'levelGauge',
      'pressureGauge',
      'vfd',
      'storageTank',
      'sludgeSilo',
      'deodorizer',
    ];
    extra.forEach((kind) => {
      const symbol: any = new WaterSymbol({ kind, left: 0, top: 0 });
      ice.addChild(symbol);
      expect(symbol.parts.length).toBeGreaterThanOrEqual(2);
    });
    // 料仓与螺杆泵属于泥线（浅黄填充）
    const silo: any = new WaterSymbol({ kind: 'sludgeSilo', left: 0, top: 0 });
    ice.addChild(silo);
    const filled = (silo.parts || []).map(
      (item: any) => item.component && item.component.state && item.component.state.style
    );
    expect(JSON.stringify(filled)).toContain('fef3c7');
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

  it('派生部件一律不可连接、不可交互 —— 只有符号本体能作为连线端点', () => {
    WATER_SYMBOL_KINDS.forEach((kind) => {
      const symbol: any = new WaterSymbol({ kind, name: '测试', tag: 'T-101' });
      expect(symbol.parts.length).toBeGreaterThan(0);
      symbol.parts.forEach(({ role, component }: any) => {
        // 引擎的 ICELinkSlotManager 会拉平整棵树找 linkable 组件：派生部件不标 false，
        // 拖连线时就会吸附到文字标签或内部形状上（位号、名称、气泡、栅条都会被吸附）。
        expect({ kind, role, linkable: component.state.linkable }).toEqual({ kind, role, linkable: false });
        expect(component.state.interactive).toBe(false);
      });
      // 符号本体仍然可以连线（管线端点就是它）
      expect(symbol.state.linkable).toBe(true);
    });
  });
});
