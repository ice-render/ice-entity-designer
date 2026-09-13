// BPMN 可连接性（2026-09-13 修）：泳道 / 池 / 注释 / 数据对象都不是**顺序流**的端点。
//
// 引擎的 linkable 是"能不能作为任何连线端点"的单一开关；本设计器目前只实现顺序流，
// 因此按顺序流语义取默认值。将来支持消息流 / 关联时，要按连线类型判断（池可被消息流连接）。
import FlowNode from '../../src/flow/FlowNode';
import { ICE, EventBus } from 'ice-render';

function makeNode(kind: string) {
  const ice: any = new ICE();
  ice.evtBus = new EventBus();
  ice.childNodes = [];
  ice.toolNodes = [];
  const node: any = new FlowNode({ kind });
  ice.addChild(node);
  return node;
}

describe('BPMN 图元的可连接性（linkable）', () => {
  it('流元素可连接：事件 / 任务 / 网关 / 子流程', () => {
    for (const kind of ['bpmnEvent', 'bpmnTask', 'bpmnGateway', 'bpmnSubprocess']) {
      expect({ kind, linkable: makeNode(kind).state.linkable }).toEqual({ kind, linkable: true });
    }
  });

  it('非流元素不可连接：泳道 / 池 / 注释 / 数据对象', () => {
    for (const kind of ['bpmnLane', 'bpmnPool', 'bpmnAnnotation', 'bpmnDataObject']) {
      expect({ kind, linkable: makeNode(kind).state.linkable }).toEqual({ kind, linkable: false });
    }
  });

  it('调用方可以显式覆盖（例如以后为消息流放开池）', () => {
    const node: any = new FlowNode({ kind: 'bpmnPool', linkable: true });
    expect(node.state.linkable).toBe(true);
  });
});
