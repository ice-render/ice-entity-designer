/**
 * 跨域包铁律：**派生部件一律不可连接、不可交互**。
 *
 * 引擎的 `ICELinkSlotManager` 会**拉平整棵树**去找 `state.linkable` 的组件（`ICELinkSlotManager.ts`），
 * 而组件默认 `linkable: true`。派生部件（位号 / 名称 / 内部形状）如果不显式标 false，
 * 拖连线时插槽就会吸附到"细格栅"这三个字上，而不是符号本体。
 *
 * 这条铁律跟「记法不可变换」是同级的：新加域包时最容易漏，所以在这里一次钉死全部包。
 */
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
import WaterSymbol from '../../src/water/water_shapes';
import { WaterPipe } from '../../src/water/WaterProcessDesigner';
import SecondarySymbol from '../../src/secondary/secondary_shapes';

/** 有派生部件的图元：它们的每个子节点都不该是连线端点 */
const SYMBOLS: Array<[string, () => any]> = [
  ['ER 实体', () => new Entity({ entityName: 'User' })],
  ['流程图节点', () => new FlowNode({ kind: 'process', title: '处理' })],
  ['BPMN 任务', () => new FlowNode({ kind: 'bpmnTask', title: '审批' })],
  ['UML 类框', () => new UmlClass({ className: 'User' })],
  ['状态机状态', () => new StateNode({ kind: 'state', title: '待支付' })],
  ['状态机复合状态', () => new StateNode({ kind: 'composite', title: '订单处理' })],
  ['甘特任务条', () => new GanttTask({ title: '需求评审', start: '2026-03-02', days: 4 })],
  ['电力断路器', () => new PowerSymbol({ kind: 'breaker', name: '1101', tag: 'QF' })],
  ['电力母线', () => new PowerSymbol({ kind: 'busbar', name: '#1M' })],
  ['电力变压器', () => new PowerSymbol({ kind: 'transformer', name: '1#主变', tag: 'TM' })],
  ['给排水处理单元', () => new WaterSymbol({ kind: 'aerobicTank', name: '好氧池', tag: 'AE-101' })],
  ['给排水设备', () => new WaterSymbol({ kind: 'pump', name: '1#提升泵', tag: 'P-101' })],
  ['给排水在线仪表', () => new WaterSymbol({ kind: 'analyzer', name: '在线监测', tag: 'AIT-101' })],
  ['二次元件', () => new SecondarySymbol({ kind: 'contactNO', name: '52a', tag: '52a' })],
];

/** 连线类型：本体一律不可连接（引擎在 ICEPolyLine 里已统一处理） */
const LINES: Array<[string, () => any]> = [
  ['ER 关系线', () => new Relation({ label: '1:N' })],
  ['流程图连线', () => new FlowEdge({})],
  ['UML 关系线', () => new UmlRelation({ relationKind: 'inheritance' })],
  ['状态转移', () => new StateTransition({ event: '支付成功' })],
  ['甘特依赖线', () => new GanttDependency({})],
  ['电力导体', () => new PowerLine({})],
  ['给排水管线', () => new WaterPipe({})],
];

describe('跨域包 · 派生部件不可连接', () => {
  it('所有符号的派生部件都不能作为连线端点（位号 / 名称 / 内部形状）', () => {
    SYMBOLS.forEach(([name, build]) => {
      const symbol: any = build();
      const children = symbol.childNodes || [];
      // 派生部件必须存在（否则这条断言就成了空转）
      expect({ name, hasParts: children.length > 0 }).toEqual({ name, hasParts: true });
      const linkableOffenders: string[] = [];
      const interactiveOffenders: string[] = [];
      children.forEach((child: any, index: number) => {
        if (child.state.linkable !== false)
          linkableOffenders.push(`${name}[${index}]:${child.constructor.typeId}:${child.state.kind}`);
        if (child.state.interactive !== false) interactiveOffenders.push(`${name}[${index}]`);
      });
      expect({ name, linkableOffenders }).toEqual({ name, linkableOffenders: [] });
      expect({ name, interactiveOffenders }).toEqual({ name, interactiveOffenders: [] });
      // 符号本体仍然可以连线（管线/关系线的端点就是它）
      expect({ name, linkable: symbol.state.linkable }).toEqual({ name, linkable: true });
    });
  });

  it('所有连线类型的本体也不能互相连接', () => {
    LINES.forEach(([name, build]) => {
      const line: any = build();
      expect({ name, linkable: line.state.linkable }).toEqual({ name, linkable: false });
    });
  });
});
