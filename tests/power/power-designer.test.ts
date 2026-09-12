/**
 * 电力一次系统图 · 应用层（建图 / 拓扑 / 语义校验 / 运行态）。
 *
 * 校验规则里第 5、6 条是**行业里的「五防」**直接相关的：
 * 禁止带电合接地刀闸、禁止带接地线合闸送电 —— 这两条不是形式校验，
 * 是电力现场真会出人身/设备事故的地方，所以做成 error。
 */
import { ICE, EventBus } from 'ice-render';
import PowerDesigner, { PowerLine } from '../../src/power/PowerDesigner';
import PowerSymbol from '../../src/power/power_shapes';
import { POWER_VOLTAGE_LEVELS, voltageColorOf } from '../../src/power/power_voltage';

function makeDesigner() {
  const ice: any = new ICE();
  ice.evtBus = new EventBus();
  ice.childNodes = [];
  ice.toolNodes = [];
  const designer = new PowerDesigner(ice);
  return { ice, designer };
}

/**
 * 最小的「电源 → 断路器 → 母线」接线：
 *   G(电源点) — QF1011 — 母线 #1M
 */
function buildSimpleBus(designer: any, options: { breakerClosed?: boolean } = {}) {
  const source = designer.createSymbol('generator', { name: 'G1', voltageLevel: '110kV', left: 100, top: 100 });
  const breaker = designer.createSymbol('breaker', { name: '1011', voltageLevel: '110kV', left: 100, top: 220 });
  const busbar = designer.createSymbol('busbar', {
    name: '#1M',
    voltageLevel: '110kV',
    left: 100,
    top: 340,
    width: 260,
  });
  designer.createLine({ sourceId: source.state.id, targetId: breaker.state.id });
  designer.createLine({ sourceId: breaker.state.id, targetId: busbar.state.id });
  designer.setEnergizedSource(source.state.id, true);
  if (options.breakerClosed) {
    designer.setSwitchState(breaker.state.id, 'closed');
  }
  return { source, breaker, busbar };
}

describe('电力应用层 · 建图', () => {
  it('建出来的图元是 PowerSymbol / PowerLine，不是流程图的 FlowNode / FlowEdge', () => {
    const { designer } = makeDesigner();
    const { breaker } = buildSimpleBus(designer);

    expect(breaker.constructor.typeId).toBe('PowerSymbol');
    expect(designer.nodes.length).toBe(3);
    expect(designer.edges.length).toBe(2);
    expect(designer.edges[0].constructor.typeId).toBe('PowerLine');
  });

  it('导体的颜色跟电压等级走；母线/设备也按色标着色', () => {
    const { designer } = makeDesigner();
    // 断路器合位 → 母线带电，才按电压等级色标着色（不带电时会变灰，见拓扑那一组用例）
    const { busbar } = buildSimpleBus(designer, { breakerClosed: true });
    const expected = voltageColorOf('110kV');
    expect(designer.edges[0].state.style.strokeStyle).toBe(expected);
    expect(busbar.part('busbar').state.style.fillStyle).toBe(expected);
  });

  it('可以按公司规范覆盖色标', () => {
    const { designer } = makeDesigner();
    designer.setVoltageColors({ '110kV': '#123456' });
    const { busbar } = buildSimpleBus(designer, { breakerClosed: true });
    expect(busbar.part('busbar').state.style.fillStyle).toBe('#123456');
  });

  it('只有开关电器能改分合状态（静止设备会报错）', () => {
    const { designer } = makeDesigner();
    const { busbar, breaker } = buildSimpleBus(designer);
    expect(() => designer.setSwitchState(busbar.state.id, 'closed')).toThrow();
    expect(designer.setSwitchState(breaker.state.id, 'closed').state.switchState).toBe('closed');
  });
});

describe('电力应用层 · 拓扑与运行态', () => {
  it('断路器合位：母线带电；分位：母线不带电，但断路器自身算带电（一端接电源）', () => {
    const closed = makeDesigner();
    const a = buildSimpleBus(closed.designer, { breakerClosed: true });
    const topologyClosed = closed.designer.topology();
    expect(topologyClosed.energized).toContain(a.busbar.state.id);

    const open = makeDesigner();
    const b = buildSimpleBus(open.designer, { breakerClosed: false });
    const topologyOpen = open.designer.topology();
    expect(topologyOpen.energized).toContain(b.breaker.state.id);
    expect(topologyOpen.energized).not.toContain(b.busbar.state.id);
  });

  it('applyTopology 把带电状态写回节点，供色标使用：不带电的部分变灰', () => {
    const { designer } = makeDesigner();
    const { busbar } = buildSimpleBus(designer, { breakerClosed: false });
    designer.applyTopology();
    expect(busbar.state.energized).toBe(false);
    expect(busbar.part('busbar').state.style.fillStyle).toBe('#94a3b8');

    designer.setSwitchState(designer.nodes.find((node: any) => node.state.kind === 'breaker').state.id, 'closed');
    designer.applyTopology();
    expect(busbar.state.energized).toBe(true);
    expect(busbar.part('busbar').state.style.fillStyle).toBe(voltageColorOf('110kV'));
  });

  it('连通域按「开关全合」算：分位的开关不会把图切成两个连通域', () => {
    const { designer } = makeDesigner();
    buildSimpleBus(designer, { breakerClosed: false });
    const topology = designer.topology();
    expect(topology.islands.length).toBe(1);
    expect(topology.islands[0].length).toBe(3);
  });
});

describe('电力应用层 · 语义校验', () => {
  it('设备编号重复报错', () => {
    const { designer } = makeDesigner();
    const { breaker } = buildSimpleBus(designer, { breakerClosed: true });
    designer.createSymbol('breaker', { name: '1011', voltageLevel: '110kV', left: 400, top: 220 });
    const issues = designer.validatePower();
    expect(issues.some((issue: any) => issue.level === 'error' && issue.message.includes('编号重复'))).toBe(true);
    expect(breaker.state.name).toBe('1011');
  });

  it('电压等级不一致（直接相连且中间没有变压器）报错', () => {
    const { designer } = makeDesigner();
    const busbar110 = designer.createSymbol('busbar', { name: '#1M', voltageLevel: '110kV', left: 100, top: 100 });
    const busbar10 = designer.createSymbol('busbar', { name: '#2M', voltageLevel: '10kV', left: 100, top: 300 });
    designer.createLine({ sourceId: busbar110.state.id, targetId: busbar10.state.id });
    const issues = designer.validatePower();
    expect(issues.some((issue: any) => issue.message.includes('电压等级不一致'))).toBe(true);
  });

  it('变压器是电压等级的边界：两侧等级不同不算错', () => {
    const { designer } = makeDesigner();
    const busbar110 = designer.createSymbol('busbar', { name: '#1M', voltageLevel: '110kV', left: 100, top: 100 });
    const transformer = designer.createSymbol('transformer', {
      name: 'T1',
      voltageLevel: '110kV',
      left: 100,
      top: 260,
    });
    const busbar10 = designer.createSymbol('busbar', { name: '#2M', voltageLevel: '10kV', left: 100, top: 420 });
    designer.createLine({ sourceId: busbar110.state.id, targetId: transformer.state.id, voltageLevel: '110kV' });
    designer.createLine({ sourceId: transformer.state.id, targetId: busbar10.state.id, voltageLevel: '10kV' });
    const issues = designer.validatePower();
    expect(issues.some((issue: any) => issue.message.includes('电压等级不一致'))).toBe(false);
  });

  it('母线没有进线电源 → warning', () => {
    const { designer } = makeDesigner();
    const busbar = designer.createSymbol('busbar', { name: '#1M', voltageLevel: '110kV' });
    const breaker = designer.createSymbol('breaker', { name: '1011', voltageLevel: '110kV' });
    designer.createLine({ sourceId: busbar.state.id, targetId: breaker.state.id });
    const issues = designer.validatePower();
    expect(issues.some((issue: any) => issue.level === 'warning' && issue.message.includes('没有进线电源'))).toBe(true);
  });

  it('断路器两侧隔离开关不足 → warning；两侧都有就不报', () => {
    const missing = makeDesigner();
    const m = buildSimpleBus(missing.designer, { breakerClosed: true });
    missing.designer.createSymbol('disconnector', { name: '10116', voltageLevel: '110kV' });
    const issuesMissing = missing.designer.validatePower();
    expect(
      issuesMissing.some((issue: any) => issue.level === 'warning' && issue.message.includes('两侧隔离开关不足'))
    ).toBe(true);

    const ok = makeDesigner();
    const o = buildSimpleBus(ok.designer, { breakerClosed: true });
    const ds1 = ok.designer.createSymbol('disconnector', { name: '10116', voltageLevel: '110kV', left: 100, top: 160 });
    const ds2 = ok.designer.createSymbol('disconnector', { name: '10112', voltageLevel: '110kV', left: 100, top: 300 });
    // 重新接线：G — QS1 — QF — QS2 — 母线
    ok.designer.clear();
    const source = ok.designer.createSymbol('generator', { name: 'G1', voltageLevel: '110kV', left: 100, top: 100 });
    const breaker = ok.designer.createSymbol('breaker', { name: '1011', voltageLevel: '110kV', left: 100, top: 200 });
    const dsA = ok.designer.createSymbol('disconnector', { name: '10116', voltageLevel: '110kV', left: 100, top: 150 });
    const dsB = ok.designer.createSymbol('disconnector', { name: '10112', voltageLevel: '110kV', left: 100, top: 250 });
    const busbar = ok.designer.createSymbol('busbar', {
      name: '#1M',
      voltageLevel: '110kV',
      left: 100,
      top: 340,
      width: 260,
    });
    ok.designer.createLine({ sourceId: source.state.id, targetId: dsA.state.id });
    ok.designer.createLine({ sourceId: dsA.state.id, targetId: breaker.state.id });
    ok.designer.createLine({ sourceId: breaker.state.id, targetId: dsB.state.id });
    ok.designer.createLine({ sourceId: dsB.state.id, targetId: busbar.state.id });
    ok.designer.setEnergizedSource(source.state.id, true);
    const issuesOk = ok.designer.validatePower();
    expect(issuesOk.some((issue: any) => issue.message.includes('两侧隔离开关不足'))).toBe(false);
    expect([ds1, ds2].length).toBe(2); // 避免未使用变量
  });

  it('五防：带电合接地刀闸 → error', () => {
    const { designer } = makeDesigner();
    const { busbar } = buildSimpleBus(designer, { breakerClosed: true });
    // 母线上挂一把接地开关，合位 → 母线带电，属于「带电挂接地线」
    const earthing = designer.createSymbol('earthingSwitch', {
      name: '10119',
      voltageLevel: '110kV',
      left: 400,
      top: 340,
    });
    designer.createLine({ sourceId: busbar.state.id, targetId: earthing.state.id, voltageLevel: '110kV' });
    designer.setSwitchState(earthing.state.id, 'closed');
    const issues = designer.validatePower();
    expect(issues.some((issue: any) => issue.level === 'error' && issue.message.includes('带电合接地刀闸'))).toBe(true);

    // 接地开关断开时不报
    designer.setSwitchState(earthing.state.id, 'open');
    expect(designer.validatePower().some((issue: any) => issue.message.includes('带电合接地刀闸'))).toBe(false);
  });

  it('孤立设备 → warning', () => {
    const { designer } = makeDesigner();
    designer.createSymbol('motor', { name: 'M1', voltageLevel: '10kV' });
    const issues = designer.validatePower();
    expect(issues.some((issue: any) => issue.message.includes('孤立设备'))).toBe(true);
  });
});

describe('电力应用层 · 色标表', () => {
  it('默认色标覆盖 500kV / 220kV / 110kV / 35kV / 10kV / 6kV，且可覆盖', () => {
    const levels = POWER_VOLTAGE_LEVELS.map((item) => item.level);
    expect(levels).toEqual(['500kV', '220kV', '110kV', '35kV', '10kV', '6kV']);
    expect(voltageColorOf('110kV')).toBe('#e05252');
    expect(voltageColorOf('110kV', { '110kV': '#000000' })).toBe('#000000');
    expect(voltageColorOf('')).toBe('#1f2937');
    expect(voltageColorOf('不存在的等级')).toBe('#1f2937');
  });

  it('PowerSymbol / PowerLine 都有稳定 typeId（序列化靠它，不靠类名）', () => {
    expect(PowerSymbol.typeId).toBe('PowerSymbol');
    expect(PowerLine.typeId).toBe('PowerLine');
  });
});
