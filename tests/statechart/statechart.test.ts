/**
 * 状态机（statechart）域包规格测试 —— 第二个 domain pack。
 *
 * 用它验证「域包配方」的边际成本：形状 + 应用层 + 校验 全部复用引擎与 FlowDesigner，
 * 不另造序列化 / 选择 / 历史 / 导出。记法参考 UML 状态机与 PlantUML 状态图语法：
 *
 * - 伪状态：初始（实心圆）、终止（同心圆）
 * - 状态：圆角矩形 + 名字；**复合状态是容器**（内部可放子状态，拖动父状态子状态跟着走）
 * - 转移：实线 + 实心箭头，标签是 `事件 [守卫] / 动作`
 */
import { ICE, EventBus } from 'ice-render';
import StateNode, { STATECHART_NODE_KINDS } from '../../src/statechart/StateNode';
import StateTransition from '../../src/statechart/StateTransition';
import StatechartDesigner from '../../src/statechart/StatechartDesigner';

function makeDesigner() {
  const ice: any = new ICE();
  ice.evtBus = new EventBus();
  ice.childNodes = [];
  ice.toolNodes = [];
  const designer = new StatechartDesigner(ice);
  return { ice, designer };
}

function childTexts(component: any): string[] {
  return (component.childNodes || [])
    .filter((child: any) => typeof child.state.text === 'string')
    .map((child: any) => child.state.text);
}

describe('状态机域包 · 伪状态与状态', () => {
  it('四种节点：初始/终止/状态/复合状态，各自有可辨识的内部形状', () => {
    expect(STATECHART_NODE_KINDS).toEqual(['initial', 'final', 'state', 'composite']);

    const initial = new StateNode({ kind: 'initial' });
    const final = new StateNode({ kind: 'final' });
    const state = new StateNode({ kind: 'state', title: '待支付' });
    const composite = new StateNode({ kind: 'composite', title: '订单处理' });

    // 初始/终止是伪状态（不显示名字），状态/复合状态显示名字
    expect(childTexts(initial)).toEqual([]);
    expect(childTexts(final)).toEqual([]);
    expect(childTexts(state)).toEqual(['待支付']);
    expect(childTexts(composite)).toEqual(['订单处理']);
    // 终止是同心圆：有内圈
    expect((final as any).innerRingComponent).toBeTruthy();
  });

  it('状态尺寸：伪状态是固定小圆，状态用给定尺寸（缺省有默认值）', () => {
    const initial = new StateNode({ kind: 'initial' });
    expect(initial.state.width).toBeLessThanOrEqual(32);
    expect(initial.state.height).toBeLessThanOrEqual(32);
    const state = new StateNode({ kind: 'state', title: 'A', width: 180, height: 70 });
    expect([state.state.width, state.state.height]).toEqual([180, 70]);
  });
});

describe('状态机域包 · 转移', () => {
  it('转移线：实线 + 实心箭头 + 标签 = 事件 [守卫] / 动作', () => {
    const transition = new StateTransition({
      points: [
        [0, 0],
        [100, 0],
      ],
      event: '支付成功',
      guard: '金额 > 0',
      action: '生成订单',
    });
    expect(transition.state.arrow).toBe('end');
    expect(transition.state.arrowStyle).toBe('filled');
    expect(transition.state.label).toBe('支付成功 [金额 > 0] / 生成订单');
  });

  it('只有事件时标签保持简洁（不出现空括号/斜杠）', () => {
    const transition = new StateTransition({
      points: [
        [0, 0],
        [50, 0],
      ],
      event: '超时',
    });
    expect(transition.state.label).toBe('超时');
  });
});

describe('状态机域包 · 设计器（复用 FlowDesigner）', () => {
  it('createState / createTransition 建图元；转移两端必须是状态', () => {
    const { designer } = makeDesigner();
    const idle = designer.createState({ title: '空闲' });
    const busy = designer.createState({ title: '处理中' });
    designer.createTransition({ sourceId: idle.state.id, targetId: busy.state.id, event: '开始' });

    expect(designer.nodes.length).toBe(2);
    expect(designer.edges.length).toBe(1);
    expect(designer.edges[0].state.label).toBe('开始');
    expect(() => designer.createTransition({ sourceId: idle.state.id, targetId: 'ghost' })).toThrow();
  });

  it('复合状态是容器：子状态嵌进来，拖动父状态子状态跟着走（引擎容器能力）', () => {
    const { designer } = makeDesigner();
    const composite = designer.createState({
      kind: 'composite',
      title: '订单处理',
      left: 120,
      top: 120,
      width: 320,
      height: 220,
    });
    const child = designer.createState({ title: '校验中', left: 160, top: 190, width: 160, height: 60 });

    expect(child.parentNode).toBe(composite);
    const before = child.getMinBoundingBox(true).tl.slice();
    composite.setPosition(composite.state.left + 100, composite.state.top + 50);
    const after = child.getMinBoundingBox(true).tl.slice();
    expect(after[0] - before[0]).toBeCloseTo(100, 1);
    expect(after[1] - before[1]).toBeCloseTo(50, 1);
  });

  it('语义校验：终态无出边、不可达状态', () => {
    const { designer } = makeDesigner();
    const initial = designer.createState({ kind: 'initial', left: 80, top: 80 });
    const idle = designer.createState({ title: '空闲', left: 200, top: 80 });
    const done = designer.createState({ kind: 'final', left: 420, top: 80 });
    designer.createTransition({ sourceId: initial.state.id, targetId: idle.state.id });
    designer.createTransition({ sourceId: idle.state.id, targetId: done.state.id });
    expect(designer.validateStatechart()).toEqual([]);

    // 终态不该有出边
    designer.createTransition({ sourceId: done.state.id, targetId: idle.state.id, event: '非法' });
    expect(
      designer
        .validateStatechart()
        .map((issue: any) => issue.message)
        .join(' | ')
    ).toContain('终止状态不应有出边');

    // 孤立状态（没有任何转移）与「连了但从初始状态走不到」要分开提示
    designer.createState({ title: '孤儿', left: 80, top: 260 });
    expect(
      designer
        .validateStatechart()
        .map((issue: any) => issue.message)
        .join(' | ')
    ).toContain('孤立节点');

    // 两个互相连着的状态，但没有任何路径从初始状态到这里 → 不可达（不是孤立）
    const lost1 = designer.createState({ title: '失联A', left: 80, top: 420 });
    const lost2 = designer.createState({ title: '失联B', left: 320, top: 420 });
    designer.createTransition({ sourceId: lost1.state.id, targetId: lost2.state.id, event: 'a' });
    const messages = designer
      .validateStatechart()
      .map((issue: any) => issue.message)
      .join(' | ');
    expect(messages).toContain('从初始状态不可达');
    expect(messages).toContain('失联A');
  });

  it('快照往返：状态与转移原样恢复（含标签）', () => {
    const { designer } = makeDesigner();
    const a = designer.createState({ kind: 'initial', left: 80, top: 80 });
    const b = designer.createState({ title: '运行', left: 220, top: 80 });
    designer.createTransition({ sourceId: a.state.id, targetId: b.state.id, event: '启动' });

    const snapshot = designer.serialize();
    const reloaded = makeDesigner();
    reloaded.designer.load(snapshot);
    expect(reloaded.designer.nodes.length).toBe(2);
    expect(reloaded.designer.nodes.find((node: any) => node.state.title === '运行')).toBeTruthy();
    expect(reloaded.designer.edges[0].state.label).toBe('启动');
  });

  it('导出 SVG：状态名与转移标签都进矢量产物', () => {
    const { designer } = makeDesigner();
    const a = designer.createState({ kind: 'initial', left: 60, top: 60 });
    const b = designer.createState({ title: '运行中', left: 220, top: 60 });
    designer.createTransition({ sourceId: a.state.id, targetId: b.state.id, event: '启动', action: '打日志' });
    const svg = designer.toSvg({ padding: 12, background: '#ffffff' });
    expect(svg).toContain('运行中');
    expect(svg).toContain('启动 / 打日志');
    expect(svg).toContain('<path');
  });
});

describe('状态机域包 · 复合状态的可达性语义', () => {
  it('转移画在子状态上时，复合状态算可达（不再误报孤立）', () => {
    const { designer } = makeDesigner();
    const initial = designer.createState({ kind: 'initial', left: 80, top: 80 });
    const composite = designer.createState({
      kind: 'composite',
      title: '订单处理',
      left: 200,
      top: 60,
      width: 400,
      height: 260,
    });
    const inner = designer.createState({ title: '库存校验', left: 260, top: 150, width: 160, height: 60 });
    const done = designer.createState({ kind: 'final', left: 700, top: 150 });

    designer.createTransition({ sourceId: initial.state.id, targetId: inner.state.id, event: '进入' });
    designer.createTransition({ sourceId: inner.state.id, targetId: done.state.id, event: '完成' });

    // 子状态被嵌进复合状态；复合状态自己没有转移，但有可达的子状态
    expect(inner.parentNode).toBe(composite);
    expect(designer.validateStatechart()).toEqual([]);
  });

  it('复合状态里放一个完全孤立的状态，仍然会报出来', () => {
    const { designer } = makeDesigner();
    const initial = designer.createState({ kind: 'initial', left: 80, top: 80 });
    const done = designer.createState({ kind: 'final', left: 380, top: 80 });
    designer.createTransition({ sourceId: initial.state.id, targetId: done.state.id });
    designer.createState({ kind: 'composite', title: '空的复合状态', left: 180, top: 260, width: 320, height: 200 });
    const messages = designer
      .validateStatechart()
      .map((issue: any) => issue.message)
      .join(' | ');
    expect(messages).toContain('空的复合状态');
  });
});
