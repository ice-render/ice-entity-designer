/**
 * 状态机**复合状态（容器）的快照往返**回归。
 *
 * `StateNode` 与 BPMN 的 `FlowNode` 是同一类组件：**既是复合组件（形状/名字由 state 派生）
 * 又是容器（复合状态里装子状态）**。只声明 `hasDerivedChildren()` 会让序列化把真实子节点
 * 一起跳过 —— 实测「按一次撤销」就把复合状态里的子状态整套删掉（撤销 = 恢复上一个快照）。
 * 引擎为此提供 `getSerializableChildren()` 钩子，这里锁住「往返不丢子状态、嵌套关系还在」。
 */
import { ICE, EventBus } from 'ice-render';
import StatechartDesigner from '../../src/statechart/StatechartDesigner';

function makeDesigner() {
  const ice: any = new ICE();
  ice.evtBus = new EventBus();
  ice.childNodes = [];
  ice.toolNodes = [];
  return new StatechartDesigner(ice);
}

describe('状态机 · 复合状态快照往返', () => {
  it('serialize → load 后子状态不丢、嵌套仍在（回归）', () => {
    const designer = makeDesigner();
    const composite = designer.createState({
      kind: 'composite',
      title: '订单处理',
      left: 560,
      top: 300,
      width: 520,
      height: 280,
    });
    designer.createState({ title: '库存校验', left: 620, top: 380, width: 160, height: 60 });
    designer.createState({ title: '安排发货', left: 850, top: 380, width: 160, height: 60 });

    const report = designer.load(designer.serialize());
    expect(report.nodes).toBe(3);
    expect(designer.nodes.map((node: any) => node.state.title).sort()).toEqual(['安排发货', '库存校验', '订单处理']);

    const restoredComposite = designer.nodes.find((node: any) => node.state.kind === 'composite');
    expect(restoredComposite.childNodes.length).toBeGreaterThanOrEqual(3); // 形状 + 名字 + 子状态
    const restoredChild = designer.nodes.find((node: any) => node.state.title === '库存校验');
    expect(restoredChild.parentNode).toBe(restoredComposite);
    expect(composite.state.id).toBeDefined();
  });

  it('同一份数据两次序列化结果一致（派生部件不重复挂载）', () => {
    const designer = makeDesigner();
    designer.createState({ kind: 'composite', title: '订单处理', left: 560, top: 300, width: 520, height: 280 });
    designer.createState({ title: '库存校验', left: 620, top: 380, width: 160, height: 60 });
    const first = designer.serialize();
    designer.load(first);
    expect(designer.serialize()).toBe(first);
  });
});
