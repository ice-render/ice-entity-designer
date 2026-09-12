/**
 * 跨域包铁律：**图元记法不可变换，只允许拖动**。
 *
 * 各域包的图元尺寸与朝向都是记法的一部分（ER 表框、UML 三段式类框、状态圆角矩形、
 * 甘特任务条、流程图判定菱形 / 起止胶囊、BPMN 事件圆 / 网关菱形 / 池泳道、电力一次设备符号），
 * 拉伸或旋转会直接破坏记法与外观统一。图纸整体缩放走**视图缩放**（滚轮 / `ICE.zoomAt`），
 * 引擎把「视图缩放」与「图元缩放」严格分开（架构文档 11 号）。
 *
 * 这条规则曾经在电力域包上被漏掉（电力符号当时是 `transformable: true`，会给出缩放/旋转手柄），
 * 所以这里做一次**跨包断言**：任何新增域包只要忘了设，这个测试就会红。
 *
 * 例外只有「需要变尺寸」的元素（母线长度、BPMN 池 / 泳道、柜体宽高…），它们同样不可变换，
 * 尺寸由属性面板的数值输入或模型参数（如甘特条的「天数 × 每日像素」）决定。
 */
import { ICE, EventBus } from 'ice-render';
import Entity from '../../src/er-component/Entity';
import Relation from '../../src/er-component/Relation';
import FlowNode from '../../src/flow/FlowNode';
import FlowEdge from '../../src/flow/FlowEdge';
import UmlClass from '../../src/uml/UmlClass';
import UmlRelation from '../../src/uml/UmlRelation';
import StateNode from '../../src/statechart/StateNode';
import StateTransition from '../../src/statechart/StateTransition';
import GanttTask from '../../src/gantt/GanttTask';
import GanttDependency from '../../src/gantt/GanttDependency';
import PowerSymbol from '../../src/power/power_shapes';
import { PowerLine } from '../../src/power/PowerDesigner';

function makeIce() {
  const ice: any = new ICE();
  ice.evtBus = new EventBus();
  ice.childNodes = [];
  ice.toolNodes = [];
  return ice;
}

describe('跨域包 · 记法不可变换（只允许拖动）', () => {
  it('ER / UML / 状态机 / 甘特 / 流程图 / BPMN / 电力 的图元都不允许变换', () => {
    const ice = makeIce();
    const samples: Array<[string, any]> = [
      ['ER Entity', new Entity({ entityName: 'User' })],
      ['UML 类框', new UmlClass({ className: 'User' })],
      ['状态机状态', new StateNode({ kind: 'state', title: '待支付' })],
      ['甘特任务条', new GanttTask({ title: '需求评审', start: '2026-03-02', days: 4 })],
      ['流程图节点', new FlowNode({ kind: 'process', title: '处理' })],
      ['BPMN 任务', new FlowNode({ kind: 'bpmnTask', title: '审批' })],
      ['BPMN 池', new FlowNode({ kind: 'bpmnPool', title: '银行' })],
      ['电力断路器', new PowerSymbol({ kind: 'breaker', name: '1101' })],
      ['电力母线', new PowerSymbol({ kind: 'busbar', name: '#1M' })],
      ['ER 关系线', new Relation({ label: '1:N' })],
      ['UML 关系线', new UmlRelation({ relationKind: 'inheritance' })],
      ['状态转移', new StateTransition({ event: '支付成功' })],
      ['甘特依赖线', new GanttDependency({})],
      ['流程图连线', new FlowEdge({})],
      ['电力导体', new PowerLine({})],
    ];
    samples.forEach(([name, component]) => {
      // 关系/连线类组件由各自的基类保证；这里统一断言
      expect({ name, transformable: component.state.transformable }).toEqual({ name, transformable: false });
    });
    // 节点仍然可拖动、可点选
    const node = samples.find(([name]) => name === 'BPMN 任务')![1];
    ice.addChild(node);
    expect(node.state.draggable).toBe(true);
    expect(node.state.interactive).toBe(true);
  });
});
