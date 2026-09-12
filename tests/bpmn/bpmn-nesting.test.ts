/**
 * BPMN 池 / 泳道 / 节点的**快照往返**回归。
 *
 * FlowNode 既是复合组件（形状 / 标题 / 角标由 state 派生）**又是容器**（池装泳道、泳道装节点）。
 * 只声明 `hasDerivedChildren()` 会让序列化把真实子节点也一起跳过 ——
 * 实测 `serialize() → load()` 后 3 个元素只剩 1 个（池在、泳道和节点没了）。
 * 引擎补了 `getSerializableChildren()` 钩子后，这里锁住「往返不丢元素、嵌套还在」。
 */
import { ICE, EventBus } from 'ice-render';
import BpmnDesigner from '../../src/bpmn/BpmnDesigner';

function makeDesigner() {
  const ice: any = new ICE();
  ice.evtBus = new EventBus();
  ice.childNodes = [];
  ice.toolNodes = [];
  return new BpmnDesigner(ice);
}

describe('BPMN · 池/泳道快照往返', () => {
  it('serialize → load 后元素不丢、嵌套仍在（回归）', () => {
    const designer = makeDesigner();
    const pool = designer.createNode('bpmnPool', { title: '银行', left: 40, top: 40, width: 600, height: 300 });
    const lane = designer.createNode('bpmnLane', { title: '受理岗', left: 40, top: 72, width: 600, height: 130 });
    designer.createNode('bpmnTask', { title: '审批', left: 200, top: 120 });

    const report = designer.load(designer.serialize());
    expect(report.nodes).toBe(3);
    expect(designer.nodes.map((node: any) => node.state.kind).sort()).toEqual(['bpmnLane', 'bpmnPool', 'bpmnTask']);

    // 嵌套关系（容器语义）也要还原
    const restoredPool = designer.nodes.find((node: any) => node.state.kind === 'bpmnPool');
    const restoredLane = designer.nodes.find((node: any) => node.state.kind === 'bpmnLane');
    expect(restoredLane.parentNode).toBe(restoredPool);
    expect(restoredPool.childNodes.length).toBeGreaterThan(0);
    expect(pool.state.id).toBeDefined();
    expect(lane.state.id).toBeDefined();
  });

  it('同一份数据两次序列化结果一致（派生部件不重复挂载、zIndex 不抖）', () => {
    const designer = makeDesigner();
    designer.createNode('bpmnPool', { title: '银行', left: 40, top: 40, width: 600, height: 300 });
    designer.createNode('bpmnLane', { title: '受理岗', left: 40, top: 72, width: 600, height: 130 });
    const first = designer.serialize();
    designer.load(first);
    expect(designer.serialize()).toBe(first);
  });
});
