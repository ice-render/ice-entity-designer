/**
 * 给水排水工艺流程图应用层：建图、管线（介质 + 管径）、工艺校验、流径分析、快照往返。
 *
 * 这一层卖的不是"画得像"，而是**画完之后能说清工艺上对不对**：
 * 处理单元有没有进出水、出水管线上有没有在线监测、污泥有没有出路、AAO 有没有内回流、
 * 关掉某个阀门之后全厂还能不能从进水走到出水。
 */
import { ICE, EventBus } from 'ice-render';
import WaterProcessDesigner, { WaterPipe } from '../../src/water/WaterProcessDesigner';
import WaterSymbol from '../../src/water/water_shapes';

function makeDesigner(): any {
  const ice: any = new ICE();
  ice.evtBus = new EventBus();
  ice.childNodes = [];
  ice.toolNodes = [];
  return new WaterProcessDesigner(ice);
}

/** 一条最小可用的 AAO 主线（进水 → 出水），带在线监测 */
function buildMinimalPlant(d: any): any {
  d.createSymbol('inlet', { id: 'in', name: '进水', tag: 'IN' });
  d.createSymbol('barScreen', { id: 'screen', name: '细格栅', tag: 'GR-101' });
  d.createSymbol('anaerobicTank', { id: 'ana', name: '厌氧池', tag: 'AT-101' });
  d.createSymbol('anoxicTank', { id: 'anx', name: '缺氧池', tag: 'AX-101' });
  d.createSymbol('aerobicTank', { id: 'aer', name: '好氧池', tag: 'AE-101' });
  d.createSymbol('secondaryClarifier', { id: 'sec', name: '二沉池', tag: 'SC-101' });
  d.createSymbol('analyzer', { id: 'cod', name: '在线监测（COD/氨氮）', tag: 'AIT-101' });
  d.createSymbol('outlet', { id: 'out', name: '出水', tag: 'OUT' });

  const pipe = (id: string, sourceId: string, targetId: string, extra: any = {}) =>
    d.createPipe({ id, sourceId, targetId, medium: 'sewage', dn: 'DN400', ...extra });

  pipe('p1', 'in', 'screen');
  pipe('p2', 'screen', 'ana');
  pipe('p3', 'ana', 'anx');
  pipe('p4', 'anx', 'aer');
  pipe('p5', 'aer', 'sec');
  pipe('p6', 'sec', 'cod', { medium: 'effluent', dn: 'DN500' });
  pipe('p7', 'cod', 'out', { medium: 'effluent', dn: 'DN500' });
  // AAO 的两条回流
  pipe('r1', 'aer', 'anx', { medium: 'recycle', dn: 'DN300' }); // 内回流（混合液）
  pipe('r2', 'sec', 'ana', { medium: 'returnSludge', dn: 'DN200' }); // 回流污泥（RAS）二沉池 → 厌氧池
  return d;
}

describe('给水排水应用层 · 建图', () => {
  it('建出来的是 WaterSymbol / WaterPipe，不是流程图的 FlowNode / FlowEdge', () => {
    const d = makeDesigner();
    const pump = d.createSymbol('pump', { name: '1#提升泵' });
    const valve = d.createSymbol('valve', { name: '电动阀' });
    const pipe = d.createPipe({ sourceId: pump.state.id, targetId: valve.state.id, medium: 'sewage', dn: 'DN300' });
    expect(pump instanceof WaterSymbol).toBe(true);
    expect(pipe instanceof WaterPipe).toBe(true);
  });

  it('管线带介质与管径，并据此着色/定线型', () => {
    const d = makeDesigner();
    const a = d.createSymbol('inlet', { name: '进水' });
    const b = d.createSymbol('outlet', { name: '出水' });
    const sewage = d.createPipe({ sourceId: a.state.id, targetId: b.state.id, medium: 'sewage', dn: 'DN400' });
    expect(sewage.state.medium).toBe('sewage');
    expect(sewage.state.dn).toBe('DN400');
    expect(sewage.state.label).toContain('DN400');

    const sludge = d.createPipe({ sourceId: a.state.id, targetId: b.state.id, medium: 'sludge', dn: 'DN200' });
    expect(sludge.state.style.strokeStyle).not.toBe(sewage.state.style.strokeStyle);
  });

  it('未知介质按污水处理（不抛错）', () => {
    const d = makeDesigner();
    const a = d.createSymbol('inlet', {});
    const b = d.createSymbol('outlet', {});
    expect(() => d.createPipe({ sourceId: a.state.id, targetId: b.state.id, medium: 'unknown', dn: '' })).not.toThrow();
  });
});

describe('给水排水应用层 · 工艺校验', () => {
  it('完整的最小 AAO 主线：校验干净', () => {
    const d = buildMinimalPlant(makeDesigner());
    expect(d.validateWater()).toEqual([]);
  });

  it('设备位号重复 → error', () => {
    const d = makeDesigner();
    d.createSymbol('pump', { name: '1#泵', tag: 'P-101' });
    d.createSymbol('pump', { name: '2#泵', tag: 'P-101' });
    const issues = d.validateWater();
    expect(issues.some((item: any) => item.code === 'duplicate-tag' && item.level === 'error')).toBe(true);
  });

  it('处理单元没有任何管线 → warning', () => {
    const d = buildMinimalPlant(makeDesigner());
    d.createSymbol('filterBed', { id: 'lonely', name: '闲置滤池', tag: 'FL-999' });
    const issues = d.validateWater();
    expect(issues.some((item: any) => item.code === 'isolated-symbol' && item.id === 'lonely')).toBe(true);
  });

  it('管线缺介质或缺管径 → warning（图纸审查常见问题）', () => {
    const d = makeDesigner();
    const a = d.createSymbol('inlet', { id: 'a', name: '进水', tag: 'IN' });
    const b = d.createSymbol('outlet', { id: 'b', name: '出水', tag: 'OUT' });
    d.createSymbol('analyzer', { id: 'ai', name: '在线监测', tag: 'AIT-1' });
    d.createPipe({ id: 'p1', sourceId: 'a', targetId: 'b', medium: 'sewage', dn: '' });
    void a;
    void b;
    const issues = d.validateWater();
    expect(issues.some((item: any) => item.code === 'pipe-missing-dn')).toBe(true);
  });

  it('出水管线上没有在线监测 → error（排污许可要求联网）', () => {
    const d = makeDesigner();
    d.createSymbol('inlet', { id: 'in', name: '进水', tag: 'IN' });
    d.createSymbol('outlet', { id: 'out', name: '出水', tag: 'OUT' });
    d.createPipe({ id: 'p1', sourceId: 'in', targetId: 'out', medium: 'sewage', dn: 'DN400' });
    const issues = d.validateWater();
    expect(issues.some((item: any) => item.code === 'outlet-without-analyzer' && item.level === 'error')).toBe(true);
  });

  it('有污泥产生但没有污泥处理/外运 → warning', () => {
    const d = buildMinimalPlant(makeDesigner());
    // 二沉池排「剩余污泥」（区别于回流污泥），但图上没有浓缩 / 脱水 / 外运
    const returnPipe = d.edges.find((edge: any) => edge.state.medium === 'returnSludge');
    returnPipe.setMedium('sludge', 'DN200');
    const issues = d.validateWater();
    expect(issues.some((item: any) => item.code === 'sludge-without-disposal')).toBe(true);
  });

  it('AAO 缺少内回流（好氧 → 缺氧）→ warning', () => {
    const d = buildMinimalPlant(makeDesigner());
    d.edges.filter((edge: any) => edge.state.medium === 'recycle').forEach((edge: any) => d.remove(edge.state.id));
    const issues = d.validateWater();
    expect(issues.some((item: any) => item.code === 'aao-missing-recycle')).toBe(true);
  });
});

describe('给水排水应用层 · 流径分析（运行工况）', () => {
  it('完整流程：从进水能走到出水', () => {
    const d = buildMinimalPlant(makeDesigner());
    const trace = d.traceFlow();
    expect(trace.connected).toBe(true);
    expect(trace.path[0]).toBe('in');
    expect(trace.path[trace.path.length - 1]).toBe('out');
  });

  it('关掉主线上的阀门 → 断流，并报出断点位置', () => {
    const d = buildMinimalPlant(makeDesigner());
    const valve = d.createSymbol('valve', { id: 'v1', name: '出水阀', tag: 'V-101' });
    void valve;
    d.remove('p6');
    d.createPipe({ id: 'p6a', sourceId: 'sec', targetId: 'v1', medium: 'effluent', dn: 'DN500' });
    d.createPipe({ id: 'p6b', sourceId: 'v1', targetId: 'cod', medium: 'effluent', dn: 'DN500' });
    expect(d.traceFlow().connected).toBe(true);

    d.setValveState('v1', 'closed');
    const trace = d.traceFlow();
    expect(trace.connected).toBe(false);
    expect(trace.blockedAt).toBe('v1');
  });
});

describe('给水排水应用层 · 快照往返', () => {
  it('serialize → load 后符号、管线、介质与文字符号都在', () => {
    const d = buildMinimalPlant(makeDesigner());
    const json = d.serialize();
    const restored = makeDesigner();
    restored.load(json);
    expect(restored.nodes.length).toBe(d.nodes.length);
    expect(restored.edges.length).toBe(d.edges.length);
    expect(restored.validateWater()).toEqual([]);
    const kinds = restored.nodes.map((node: any) => node.state.kind).sort();
    expect(kinds).toContain('aerobicTank');
    expect(kinds).toContain('analyzer');
  });
});
