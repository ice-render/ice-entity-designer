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

  it('关闸门 / 关堰门同样断流（闸门是启闭水道的构筑物，与阀门同一口径）', () => {
    const d = buildMinimalPlant(makeDesigner());
    d.createSymbol('gate', { id: 'g1', name: '出水闸门', tag: 'GT-101' });
    d.remove('p6');
    d.createPipe({ id: 'p6a', sourceId: 'sec', targetId: 'g1', medium: 'effluent', dn: 'DN500' });
    d.createPipe({ id: 'p6b', sourceId: 'g1', targetId: 'cod', medium: 'effluent', dn: 'DN500' });
    expect(d.traceFlow().connected).toBe(true);

    d.setValveState('g1', 'closed');
    const trace = d.traceFlow();
    expect(trace.connected).toBe(false);
    expect(trace.blockedAt).toBe('g1');
  });

  it('拍门是单向件：不参与"人为开闭"', () => {
    const d = buildMinimalPlant(makeDesigner());
    d.createSymbol('flapGate', { id: 'f1', name: '出水拍门', tag: 'FG-101' });
    d.remove('p6');
    d.createPipe({ id: 'p6a', sourceId: 'sec', targetId: 'f1', medium: 'effluent', dn: 'DN500' });
    d.createPipe({ id: 'p6b', sourceId: 'f1', targetId: 'cod', medium: 'effluent', dn: 'DN500' });
    // 拍门不阻塞流径（它跟着水流开），也不能被"关"
    expect(d.traceFlow().connected).toBe(true);
    expect(() => d.setValveState('f1', 'closed')).toThrow();
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

  it('快照往返保留仪表功能代号与第二批新增介质', () => {
    const d = makeDesigner();
    d.createSymbol('inlet', { id: 'in', name: '进水', tag: 'IN' });
    d.createSymbol('analyzer', { id: 'do1', name: '溶解氧', tag: 'AIT-101', analyzerCode: 'DO' });
    d.createSymbol('outlet', { id: 'out', name: '出水', tag: 'OUT' });
    const backwash = d.createPipe({ id: 'x1', sourceId: 'in', targetId: 'do1', medium: 'backwash', dn: 'DN200' });
    const reclaimed = d.createPipe({ id: 'x2', sourceId: 'do1', targetId: 'out', medium: 'reclaimed', dn: 'DN200' });
    // 两种新介质各自按自己的样式着色（不是 fallback 到污水）
    expect(backwash.state.style.strokeStyle).not.toBe(reclaimed.state.style.strokeStyle);
    expect(backwash.state.label).toContain('反冲洗水');
    expect(reclaimed.state.label).toContain('中水');

    const restored = makeDesigner();
    restored.load(d.serialize());
    const analyzer = restored.nodes.filter((node: any) => node.state.id === 'do1')[0];
    expect(analyzer.state.analyzerCode).toBe('DO');
    const media = restored.edges.map((edge: any) => edge.state.medium).sort();
    expect(media).toEqual(['backwash', 'reclaimed']);
    const restoredBackwash = restored.edges.filter((edge: any) => edge.state.medium === 'backwash')[0];
    expect(restoredBackwash.state.style.strokeStyle).toBe(backwash.state.style.strokeStyle);
  });
});

/**
 * ★ **端口占用 → 位号 / 名称侧移**的应用层接线（2026-09-26）
 *
 * 符号层只管"被占用的端口是哪些"（见 `water-symbols.test.ts`），**谁把占用推给它**是这一层的事：
 * 边是唯一真相，所以增删管线 / 删图元（基类会级联删连线）/ 载入快照之后都要重算。
 * 这三条路各自踩过的坑不同 —— 尤其是"删管线"，只盯被删的那条边会漏掉级联删掉的那些。
 */
describe('给水排水应用层 · 端口占用与标签让位', () => {
  const tagLeft = (d: any, symbolId: string, tag: string) =>
    d.nodes.find((node: any) => node.state.id === symbolId).part(`text:${tag}`).state.left;

  it('★ 管线接到顶边 → 那一端位号让开；删掉管线（含级联）之后回位', () => {
    const d = makeDesigner();
    d.createSymbol('aerobicTank', { id: 'aer', name: '好氧池 A', tag: 'AE-101' });
    d.createSymbol('blower', { id: 'blower', name: '鼓风机', tag: 'B-201' });
    const centered = tagLeft(d, 'aer', 'AE-101');

    const pipe = d.createPipe({
      id: 'air1',
      sourceId: 'blower',
      targetId: 'aer',
      medium: 'air',
      dn: 'DN200',
      targetPort: 'T',
    });
    const shifted = tagLeft(d, 'aer', 'AE-101');
    expect(shifted).toBeGreaterThan(centered);
    // 占用照实记在符号上（属性面板 / 测试都能问）
    expect(d.nodes.find((node: any) => node.state.id === 'aer').getOccupiedPorts()).toEqual(['T']);

    d.remove(pipe.state.id);
    expect(tagLeft(d, 'aer', 'AE-101')).toBeCloseTo(centered);
    expect(d.nodes.find((node: any) => node.state.id === 'aer').getOccupiedPorts()).toEqual([]);
  });

  it('★ 删掉**图元**（基类会级联删掉两端管线）之后也要回位，不能残留让位', () => {
    const d = makeDesigner();
    d.createSymbol('aerobicTank', { id: 'aer', name: '好氧池 A', tag: 'AE-101' });
    d.createSymbol('blower', { id: 'blower', name: '鼓风机', tag: 'B-201' });
    const centered = tagLeft(d, 'aer', 'AE-101');
    d.createPipe({ id: 'air1', sourceId: 'blower', targetId: 'aer', medium: 'air', dn: 'DN200', targetPort: 'T' });
    expect(tagLeft(d, 'aer', 'AE-101')).toBeGreaterThan(centered);

    d.remove('blower'); // 级联带走 air1
    expect(d.edges.length).toBe(0);
    expect(tagLeft(d, 'aer', 'AE-101')).toBeCloseTo(centered);
  });

  it('水平进出线（L / R）不让位 —— 标签本来就不在端口那条中轴线上', () => {
    const d = makeDesigner();
    d.createSymbol('anaerobicTank', { id: 'ana', name: '厌氧池 A', tag: 'AT-101' });
    d.createSymbol('anoxicTank', { id: 'anx', name: '缺氧池 A', tag: 'AX-101' });
    const centered = tagLeft(d, 'anx', 'AX-101');
    // ⚠️ 端口必须显式给：本设计器 `createPipe` 自己的默认是 `B → T`（下游 DSL 才兜 R → L）
    d.createPipe({
      id: 'p1',
      sourceId: 'ana',
      targetId: 'anx',
      medium: 'sewage',
      dn: 'DN700',
      sourcePort: 'R',
      targetPort: 'L',
    });
    expect(tagLeft(d, 'anx', 'AX-101')).toBeCloseTo(centered);
    expect(d.nodes.find((node: any) => node.state.id === 'anx').getOccupiedPorts()).toEqual(['L']);
  });

  it('快照往返之后让位照旧：占用是派生数据，载入时从管线重算出来', () => {
    const d = makeDesigner();
    d.createSymbol('aerobicTank', { id: 'aer', name: '好氧池 A', tag: 'AE-101' });
    d.createSymbol('blower', { id: 'blower', name: '鼓风机', tag: 'B-201' });
    d.createPipe({ id: 'air1', sourceId: 'blower', targetId: 'aer', medium: 'air', dn: 'DN200', targetPort: 'T' });
    const before = tagLeft(d, 'aer', 'AE-101');

    const restored = makeDesigner();
    restored.load(d.serialize());
    expect(tagLeft(restored, 'aer', 'AE-101')).toBeCloseTo(before);
    expect(restored.nodes.find((node: any) => node.state.id === 'aer').getOccupiedPorts()).toEqual(['T']);
  });

  /**
   * ★ **过路折线压字**（2026-09-26 补）：别人的管线从我的位号 / 名称上方经过 ——
   * 那根线跟我没有连接关系，所以"端口被占"那条规则管不到它。
   * 实测下游（ice-agent-console）线上残留 4 处就是这一类，且放大图元间距无效
   * （折线与符号的相对位置是尺度无关的）。
   *
   * 判据是纯几何：逐条折线与符号的**文字带**（`labelBands()`）做线段 × 矩形相交。
   */
  it('★ 过路管线穿过某符号的位号带 → 那个符号的位号让开（与它自己有没有连线无关）', () => {
    const d = makeDesigner();
    d.createSymbol('anoxicTank', { id: 'anx', name: '缺氧池 A', tag: 'AX-101' });
    d.createSymbol('pump', { id: 'p1', name: '泵', tag: 'P-1', left: 2000, top: 2000 });
    d.createSymbol('pump', { id: 'p2', name: '泵', tag: 'P-2', left: 2600, top: 2000 });
    const anx = d.nodes.find((node: any) => node.state.id === 'anx');
    const centered = anx.part('text:AX-101').state.left;
    expect(anx.getLabelBlocked()).toEqual({ tag: false, name: false });

    // 一条**跟 anx 毫无连接**的管线，把它的折线改到"横穿 anx 位号带"的位置
    const pipe = d.createPipe({ id: 'far', sourceId: 'p1', targetId: 'p2', medium: 'sewage', dn: 'DN300' });
    const band = anx.labelBands().tag;
    expect(band).toBeTruthy();
    const y = (band.minY + band.maxY) / 2;
    // ⚠️ `state.points` 是**边的局部坐标**，而 `labelBands()` 是世界坐标 —— 要减掉边的 left/top
    const px = Number(pipe.state.left) || 0;
    const py = Number(pipe.state.top) || 0;
    pipe.setState({
      points: [
        [band.minX - 50 - px, y - py],
        [band.maxX + 50 - px, y - py],
      ],
    });
    d.refreshLabelPlacement();

    expect(anx.getLabelBlocked()).toEqual({ tag: true, name: false });
    expect(anx.part('text:AX-101').state.left).toBeGreaterThan(centered);

    // 折线挪走（不再经过）→ 回位
    pipe.setState({
      points: [
        [band.minX - 50 - px, band.maxY + 200 - py],
        [band.maxX + 50 - px, band.maxY + 200 - py],
      ],
    });
    d.refreshLabelPlacement();
    expect(anx.getLabelBlocked()).toEqual({ tag: false, name: false });
    expect(anx.part('text:AX-101').state.left).toBeCloseTo(centered);
  });

  it('不经过文字带的折线不触发让位（别把正常的管线当成压字）', () => {
    const d = makeDesigner();
    d.createSymbol('aerobicTank', { id: 'aer', name: '好氧池 A', tag: 'AE-101' });
    d.createSymbol('pump', { id: 'p1', name: '泵', tag: 'P-1', left: 2000, top: 2000 });
    d.createSymbol('pump', { id: 'p2', name: '泵', tag: 'P-2', left: 2600, top: 2000 });
    const aer = d.nodes.find((node: any) => node.state.id === 'aer');
    const centered = aer.part('text:AE-101').state.left;
    const pipe = d.createPipe({ id: 'far', sourceId: 'p1', targetId: 'p2', medium: 'sewage', dn: 'DN300' });
    const band = aer.labelBands().tag;
    // 放在位号带**下方 400px**（完全够不着）；points 是局部坐标，要减掉边的 left/top
    const px = Number(pipe.state.left) || 0;
    const py = Number(pipe.state.top) || 0;
    pipe.setState({
      points: [
        [band.minX - 50 - px, band.maxY + 400 - py],
        [band.maxX + 50 - px, band.maxY + 400 - py],
      ],
    });
    d.refreshLabelPlacement();
    expect(aer.getLabelBlocked()).toEqual({ tag: false, name: false });
    expect(aer.part('text:AE-101').state.left).toBeCloseTo(centered);
  });
});
