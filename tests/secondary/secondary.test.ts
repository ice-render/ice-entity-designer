/**
 * 电力二次回路域包（简化版第一刀）规格测试。
 *
 * 记法与范围见 `docs/power-secondary-spec.md`：
 * 二次图是**回路图**（一条线 = 一个具体回路），元素记法按 GB/T 4728.7（等同 IEC 60617-7），
 * 文字符号用 IEEE C37.2 功能编号（52/43/88/49/33/63…），导线带回路编号（A411/B411/C411/N411）。
 */
import { ICE, EventBus } from 'ice-render';
import SecondarySymbol, { TerminalStrip } from '../../src/secondary/secondary_shapes';
import SecondaryDesigner from '../../src/secondary/SecondaryDesigner';

function makeDesigner() {
  const ice: any = new ICE();
  ice.evtBus = new EventBus();
  ice.childNodes = [];
  ice.toolNodes = [];
  const designer = new SecondaryDesigner(ice);
  return { ice, designer };
}

function makeSymbol(kind: string, props: any = {}) {
  return new SecondarySymbol({ kind, ...props });
}

function roles(symbol: any): string[] {
  return symbol.parts.map((item: any) => item.role);
}

describe('二次元件 · 记法', () => {
  it('常开接点：动触点**不接触**右引线（一眼看出断开）', () => {
    const contact = makeSymbol('contactNO');
    expect(roles(contact)).toEqual(expect.arrayContaining(['leadLeft', 'fixedContact', 'movingContact', 'leadRight']));
    const moving = contact.part('movingContact').state.points;
    const rightLead = contact.part('leadRight').state.points;
    // 动触点的末端在右引线起点之前 → 不接触
    expect(moving[1][0]).toBeLessThanOrEqual(rightLead[0][0]);
  });

  it('常闭接点：引线是连通的（接触），另有竖的固定触点', () => {
    const contact = makeSymbol('contactNC');
    const left = contact.part('leadLeft').state.points;
    const right = contact.part('leadRight').state.points;
    // 左右引线首尾相接 → 回路连通
    expect(Math.round(left[1][0])).toBe(Math.round(right[0][0]));
    expect(Math.round(left[1][1])).toBe(Math.round(right[0][1]));
    expect(roles(contact)).toContain('fixedContact');
  });

  it('压板（连接片）：断开时连接片是斜的，接通时是直的', () => {
    const open = makeSymbol('linkPlate');
    const openPlate = open.part('plate').state.points;
    expect(Math.abs(openPlate[1][1] - openPlate[0][1])).toBeGreaterThan(4);

    const closed = makeSymbol('linkPlate', { switchState: 'closed' });
    const closedPlate = closed.part('plate').state.points;
    expect(Math.round(closedPlate[1][1] - closedPlate[0][1])).toBe(0);
  });

  it('信号灯：圆 + 圆内「×」（GB/T 4728 的信号灯记法）', () => {
    const lamp = makeSymbol('indicatorLamp');
    expect(roles(lamp)).toEqual(expect.arrayContaining(['lamp', 'lampCrossA', 'lampCrossB', 'leadTop', 'leadBottom']));
  });

  it('端子 / 互感器二次绕组 / 装置方框 / 切换开关 / 按钮 都有各自的辨识要素', () => {
    expect(roles(makeSymbol('terminal'))).toContain('terminalCircle');
    // 二次绕组画成线圈（三段半圆），不是矩形框
    const winding = makeSymbol('ctWinding');
    expect(roles(winding).filter((role) => role === 'winding').length).toBe(3);
    expect(roles(winding)).toEqual(expect.arrayContaining(['leadTop', 'leadBottom']));
    expect(roles(makeSymbol('relayDevice'))).toEqual(
      expect.arrayContaining(['deviceBody', 'deviceTitle', 'deviceModel'])
    );
    expect(roles(makeSymbol('switchRemoteLocal'))).toEqual(
      expect.arrayContaining(['switchBody', 'lever', 'positionText'])
    );
    expect(roles(makeSymbol('pushButton'))).toEqual(
      expect.arrayContaining(['actuator', 'actuatorCap', 'movingContact'])
    );
  });

  it('二次元件同样只允许拖动（不可变换）', () => {
    ['contactNO', 'pushButton', 'relayDevice', 'terminal', 'earth'].forEach((kind) => {
      const symbol = makeSymbol(kind);
      expect(symbol.state.transformable).toBe(false);
      expect(symbol.state.draggable).toBe(true);
    });
  });
});

describe('二次回路 · 端子排（容器）', () => {
  it('端子排的端子是真实子节点：拖动端子排端子跟着走，且快照往返不丢端子', () => {
    const { designer } = makeDesigner();
    const { strip, terminals } = designer.createTerminalStrip({
      title: '1D 端子排',
      left: 200,
      top: 200,
      terminals: [{ no: '201' }, { no: '202' }, { no: '203' }, { no: '204' }],
    });
    expect(terminals.length).toBe(4);
    expect(terminals[0].parentNode).toBe(strip);
    expect(strip.constructor.typeId).toBe(TerminalStrip.typeId);

    // 拖动端子排 → 端子跟随
    const before = terminals[0].getMinBoundingBox(true).tl.slice();
    strip.setPosition(strip.state.left + 60, strip.state.top + 30);
    const after = terminals[0].getMinBoundingBox(true).tl.slice();
    expect(Math.round(after[0] - before[0])).toBe(60);
    expect(Math.round(after[1] - before[1])).toBe(30);

    // 快照往返：端子仍在（容器不声明 hasDerivedChildren，子节点进文档）
    const json = designer.serialize();
    designer.load(json);
    expect(designer.terminals.length).toBe(4);
    expect(designer.terminals.map((item: any) => item.state.name).sort()).toEqual(['201', '202', '203', '204']);
  });
});

describe('二次回路 · 语义校验', () => {
  function buildCurrentCircuit(designer: any) {
    const windings = ['A', 'B', 'C'].map((phase, index) =>
      designer.createSymbol('ctWinding', { name: `1LH${phase.toLowerCase()}`, left: 160, top: 160 + index * 90 })
    );
    const { terminals } = designer.createTerminalStrip({
      title: '1D 端子排',
      left: 460,
      top: 160,
      terminals: [{ no: '201' }, { no: '202' }, { no: '203' }, { no: '204' }],
    });
    const device = designer.createSymbol('relayDevice', {
      name: '线路保护',
      tag: 'RCS-941A',
      left: 700,
      top: 220,
    });
    const earth = designer.createSymbol('earth', { name: 'N411 接地', left: 460, top: 420 });
    ['A', 'B', 'C'].forEach((phase, index) => {
      designer.createWire({
        sourceId: windings[index].state.id,
        targetId: terminals[index].state.id,
        circuitNo: `${phase}411`,
        cableNo: `1D${index + 1}`,
      });
      designer.createWire({
        sourceId: terminals[index].state.id,
        targetId: device.state.id,
        circuitNo: `${phase}411`,
        cableNo: `1D${index + 4}`,
      });
    });
    designer.createWire({
      sourceId: terminals[3].state.id,
      targetId: earth.state.id,
      circuitNo: 'N411',
      cableNo: '1D8',
    });
    return { windings, terminals, device, earth };
  }

  it('完整的三相电流回路：校验无问题', () => {
    const { designer } = makeDesigner();
    buildCurrentCircuit(designer);
    expect(designer.validateSecondary()).toEqual([]);
  });

  it('导线缺回路编号 → error', () => {
    const { designer } = makeDesigner();
    const device = designer.createSymbol('relayDevice', { name: '装置', tag: 'RCS-941A' });
    const terminal = designer.createSymbol('terminal', { name: '201' });
    designer.createWire({ sourceId: terminal.state.id, targetId: device.state.id });
    const issues = designer.validateSecondary();
    expect(issues.some((issue) => issue.level === 'error' && issue.message.includes('缺少回路编号'))).toBe(true);
  });

  it('电流回路缺相 → error（三相必须成组）', () => {
    const { designer } = makeDesigner();
    const windings = ['A', 'B'].map((phase, index) =>
      designer.createSymbol('ctWinding', { name: `1LH${phase.toLowerCase()}`, left: 160, top: 160 + index * 90 })
    );
    const device = designer.createSymbol('relayDevice', { name: '装置', tag: 'RCS-941A', left: 600, top: 200 });
    designer.createSymbol('earth', { name: '接地', left: 400, top: 400 });
    ['A', 'B'].forEach((phase, index) => {
      designer.createWire({
        sourceId: windings[index].state.id,
        targetId: device.state.id,
        circuitNo: `${phase}411`,
      });
    });
    const issues = designer.validateSecondary();
    expect(issues.some((issue) => issue.message.includes('缺相') && issue.message.includes('C411'))).toBe(true);
  });

  it('端子号重复 → error；没有接地 → warning', () => {
    const { designer } = makeDesigner();
    designer.createSymbol('terminal', { name: '201' });
    designer.createSymbol('terminal', { name: '201' });
    const issues = designer.validateSecondary();
    expect(issues.some((issue) => issue.message.includes('端子号重复'))).toBe(true);
    expect(issues.some((issue) => issue.level === 'warning' && issue.message.includes('没有接地'))).toBe(true);
  });
});
