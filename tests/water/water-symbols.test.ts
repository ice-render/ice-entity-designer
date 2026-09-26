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
  WATER_VALVE_KINDS,
  WATER_STYLE,
  estimateWaterTextWidth,
  isWaterValveKind,
} from '../../src/water/water_shapes';
import { composePipeLabel, dashPatternOf } from '../../src/water/WaterProcessDesigner';

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

  it('阀门类图元：手动阀与电动阀在"通不通"上等价（流径分析与开闭都按它判）', () => {
    expect(WATER_VALVE_KINDS).toEqual(['valve', 'motorValve']);
    expect(isWaterValveKind('valve')).toBe(true);
    expect(isWaterValveKind('motorValve')).toBe(true);
    expect(isWaterValveKind('checkValve')).toBe(false); // 止回阀不可开闭（只有单向）
    expect(isWaterValveKind('pump')).toBe(false);
  });

  it('介质样式齐备：污水 / 污泥 / 空气 / 药剂 / 出水 / 回流 / 信号 / 动力', () => {
    ['sewage', 'sludge', 'air', 'chemical', 'effluent', 'recycle', 'returnSludge', 'signal', 'power'].forEach(
      (medium) => {
        const style = (WATER_MEDIUM_STYLES as any)[medium];
        expect(style).toBeTruthy();
        expect(style.color).toMatch(/^#/);
        expect(['solid', 'dashed', 'dashdot']).toContain(style.lineType);
      }
    );
    // 信号与动力是电气/信号回路：点划线，且颜色和水管明显区分
    expect(WATER_MEDIUM_STYLES.signal.lineType).toBe('dashdot');
    expect(WATER_MEDIUM_STYLES.power.lineType).toBe('dashdot');
    expect(WATER_MEDIUM_STYLES.signal.color).not.toBe(WATER_MEDIUM_STYLES.sewage.color);
  });

  it('线型映射：点划线给的是「长划 + 点」，实线给空数组', () => {
    expect(dashPatternOf('solid', 1.4)).toEqual([]);
    expect(dashPatternOf('dashed', 2)).toEqual([8, 8]);
    const dashdot = dashPatternOf('dashdot', 2);
    expect(dashdot.length).toBe(4);
    expect(dashdot[0]).toBeGreaterThan(dashdot[2]); // 长划比点长
  });

  it('信号 / 动力线不是管道：标注不带管径', () => {
    expect(composePipeLabel('signal', '')).toBe('仪表信号');
    expect(composePipeLabel('power', '')).toBe('动力回路');
    expect(composePipeLabel('sewage', 'DN400')).toBe('DN400 污水');
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

  /**
   * ★ **顶边 / 底边被连线占用时，位号与名称要让开端口柱**。
   *
   * 端口取的是形状盒**边中点**（`FlowDesigner.__slotPoint()` → `box.tc` / `box.bc`），
   * 而位号 / 名称也居中画在同一条中轴线上 —— 谁都没错，合起来就是
   * "上下进线连着箭头一起穿过文字"（实测：缺氧池 A 的 `AX-101` 被穿成 `AX⊥01`）。
   * 让开的量按**估算字宽**算（`V-101` 与 `混凝沉淀池` 差好几倍，拍常数必然一头松一头紧）。
   *
   * 水平端口（L / R）不受影响 —— 它们不在标签那条中轴线上，位号 / 名称照旧居中。
   */
  it('★ 顶边 / 底边被占用 → 位号与名称右移让开；水平端口不影响；松开后回位', () => {
    const symbol: any = new WaterSymbol({
      kind: 'anoxicTank',
      id: 'anx',
      name: '缺氧池 A',
      tag: 'AX-101',
    });
    const boxLeft = (text: string) => symbol.part(`text:${text}`).state.left;
    const tag0 = boxLeft('AX-101');
    const name0 = boxLeft('缺氧池 A');
    // 没连线的位置 = 标签盒居中（`labelLeft = cx - labelWidth / 2`）
    const w = symbol.state.width;
    expect(tag0).toBeCloseTo(w / 2 - Math.max(w + 24, 90) / 2);

    // 水平进出线：不在中轴线上 → 一动不动
    symbol.setOccupiedPorts(['L', 'R']);
    expect(boxLeft('AX-101')).toBeCloseTo(tag0);
    expect(boxLeft('缺氧池 A')).toBeCloseTo(name0);

    // 顶边被占（例如混合液回流从上面下来）→ 位号让开，名称不动
    symbol.setOccupiedPorts(['L', 'T']);
    const tagShift = boxLeft('AX-101') - tag0;
    expect(tagShift).toBeCloseTo(estimateWaterTextWidth('AX-101', WATER_STYLE.tagFontSize) / 2 + 8);
    expect(tagShift).toBeGreaterThan(0);
    expect(boxLeft('缺氧池 A')).toBeCloseTo(name0);

    // 底边也被占（下方进线）→ 名称同样让开
    symbol.setOccupiedPorts(['T', 'B']);
    expect(boxLeft('缺氧池 A') - name0).toBeCloseTo(
      estimateWaterTextWidth('缺氧池 A', WATER_STYLE.nameFontSize) / 2 + 8
    );

    // 边拆掉之后回位（不是"只挪不还"）
    symbol.setOccupiedPorts([]);
    expect(boxLeft('AX-101')).toBeCloseTo(tag0);
    expect(boxLeft('缺氧池 A')).toBeCloseTo(name0);
  });

  it('估算字宽：CJK / 全角按一个字宽，拉丁数字按 0.55 个字宽（用于让开量）', () => {
    expect(estimateWaterTextWidth('', 10)).toBe(0);
    expect(estimateWaterTextWidth('ABC', 10)).toBeCloseTo(16.5);
    expect(estimateWaterTextWidth('缺氧池', 10)).toBeCloseTo(30);
    expect(estimateWaterTextWidth('AX-101', 9.5)).toBeCloseTo(9.5 * 0.55 * 6);
  });
});
