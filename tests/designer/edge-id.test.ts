/**
 * 连线 / 关系的 id 必须由调用方决定。
 *
 * 应用层（DSL、Agent 生成的文档）用 id 引用图元，`createEdge({ id })` 如果被忽略，
 * 往返一次 id 就变成随机 UUID —— 文档与实例对不上，「AI 产出可编辑的工程产物」这条链就断了。
 * 这里把六个域包的建线路径一次钉死（BPMN 复用 FlowDesigner.createEdge）。
 */
import { ICE, EventBus } from 'ice-render';
import FlowDesigner from '../../src/flow/FlowDesigner';
import UmlDesigner from '../../src/uml/UmlDesigner';
import StatechartDesigner from '../../src/statechart/StatechartDesigner';
import GanttDesigner from '../../src/gantt/GanttDesigner';
import PowerDesigner from '../../src/power/PowerDesigner';
import SecondaryDesigner from '../../src/secondary/SecondaryDesigner';
import BpmnDesigner from '../../src/bpmn/BpmnDesigner';

function makeIce(): any {
  const ice: any = new ICE();
  ice.evtBus = new EventBus();
  ice.childNodes = [];
  ice.toolNodes = [];
  return ice;
}

describe('图元的 id 由调用方决定', () => {
  it('流程图 / BPMN：createEdge 保留传入的 id', () => {
    const flow: any = new FlowDesigner(makeIce());
    flow.createNode('process', { id: 'a', left: 0, top: 0 });
    flow.createNode('process', { id: 'b', left: 300, top: 0 });
    const edge = flow.createEdge({ id: 'flow-1', sourceId: 'a', targetId: 'b' });
    expect(edge.state.id).toBe('flow-1');
    expect(flow.edges.map((item: any) => item.state.id)).toEqual(['flow-1']);

    const bpmn: any = new BpmnDesigner(makeIce());
    bpmn.createNode('bpmnTask', { id: 't1', left: 0, top: 0 });
    bpmn.createNode('bpmnTask', { id: 't2', left: 300, top: 0 });
    const bpmnEdge = bpmn.createEdge({ id: 'bpmn-flow-1', sourceId: 't1', targetId: 't2' });
    expect(bpmnEdge.state.id).toBe('bpmn-flow-1');
  });

  it('UML / 状态机：关系与转移保留传入的 id', () => {
    const uml: any = new UmlDesigner(makeIce());
    uml.createClass({ id: 'child', title: 'Child', left: 0, top: 0 });
    uml.createClass({ id: 'parent', title: 'Parent', left: 300, top: 0 });
    const relation = uml.createRelation({
      id: 'rel-1',
      sourceId: 'child',
      targetId: 'parent',
      relationKind: 'inheritance',
    });
    expect(relation.state.id).toBe('rel-1');

    const sc: any = new StatechartDesigner(makeIce());
    sc.createState({ id: 's1', left: 0, top: 0 });
    sc.createState({ id: 's2', left: 300, top: 0 });
    const transition = sc.createTransition({ id: 'tr-1', sourceId: 's1', targetId: 's2' });
    expect(transition.state.id).toBe('tr-1');
  });

  it('甘特 / 电力 / 二次：依赖、导体、导线保留传入的 id', () => {
    const gantt: any = new GanttDesigner(makeIce());
    gantt.createTask({ id: 'g1', title: 'A' });
    gantt.createTask({ id: 'g2', title: 'B' });
    const dependency = gantt.createDependency({ id: 'dep-1', sourceId: 'g1', targetId: 'g2' });
    expect(dependency.state.id).toBe('dep-1');

    const power: any = new PowerDesigner(makeIce());
    power.createSymbol('breaker', { id: 'qf1', left: 0, top: 0 });
    power.createSymbol('busbar', { id: 'bus1', left: 0, top: 200 });
    const line = power.createLine({ id: 'conductor-1', sourceId: 'qf1', targetId: 'bus1' });
    expect(line.state.id).toBe('conductor-1');

    const secondary: any = new SecondaryDesigner(makeIce());
    secondary.createSymbol('contactNO', { id: 'c1', left: 0, top: 0 });
    secondary.createSymbol('indicatorLamp', { id: 'l1', left: 300, top: 0 });
    const wire = secondary.createWire({ id: 'wire-1', sourceId: 'c1', targetId: 'l1', circuitNo: 'A411' });
    expect(wire.state.id).toBe('wire-1');
  });

  it('不给 id 时仍然自动生成（既有行为不变）', () => {
    const flow: any = new FlowDesigner(makeIce());
    flow.createNode('process', { id: 'a', left: 0, top: 0 });
    flow.createNode('process', { id: 'b', left: 300, top: 0 });
    const edge = flow.createEdge({ sourceId: 'a', targetId: 'b' });
    expect(typeof edge.state.id).toBe('string');
    expect(edge.state.id.length).toBeGreaterThan(0);
  });
});
