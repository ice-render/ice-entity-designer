/**
 * Copyright (c) 2022 大漠穷秋.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import Entity from '../er-component/Entity';
import Relation from '../er-component/Relation';
import FlowNode from '../flow/FlowNode';
import FlowEdge from '../flow/FlowEdge';
import { FlowDiamond, FlowParallelogram } from '../flow/flow_shapes';
import {
  BpmnAnnotationShape,
  BpmnDataObjectShape,
  BpmnEventShape,
  BpmnFlowMarker,
  BpmnGatewayShape,
  BpmnLaneShape,
  BpmnSubprocessMarker,
  BpmnTaskIcon,
} from '../bpmn/bpmn_shapes';
import { SimTokenDot } from '../bpmn/BpmnSimulator';
import UmlClass from '../uml/UmlClass';
import UmlRelation from '../uml/UmlRelation';
import StateNode from '../statechart/StateNode';
import StateTransition from '../statechart/StateTransition';
import GanttTask from '../gantt/GanttTask';
import GanttDependency from '../gantt/GanttDependency';
import GanttRuler from '../gantt/GanttRuler';
import PowerSymbol from '../power/power_shapes';
import { PowerLine } from '../power/PowerDesigner';
import SecondarySymbol, { TerminalStrip } from '../secondary/secondary_shapes';
import { SecondaryWire } from '../secondary/SecondaryDesigner';
import WaterSymbol from '../water/water_shapes';
import { WaterPipe } from '../water/WaterProcessDesigner';

/** IED 的全部领域图元类型（顺序无关，注册是幂等的）。 */
const IED_TYPE_CLASSES: Array<{ typeId: string }> = [
  Entity,
  Relation,
  FlowNode,
  FlowEdge,
  FlowDiamond,
  FlowParallelogram,
  BpmnEventShape,
  BpmnGatewayShape,
  BpmnTaskIcon,
  BpmnSubprocessMarker,
  BpmnDataObjectShape,
  BpmnAnnotationShape,
  BpmnLaneShape,
  BpmnFlowMarker,
  SimTokenDot,
  UmlClass,
  UmlRelation,
  StateNode,
  StateTransition,
  GanttTask,
  GanttDependency,
  GanttRuler,
  PowerSymbol,
  PowerLine,
  SecondarySymbol,
  SecondaryWire,
  TerminalStrip,
  WaterSymbol,
  WaterPipe,
];

/**
 * 把 IED 的全部领域图元类型注册到某个 `ICE` 实例上（幂等，重复调用无副作用）。
 *
 * **为什么需要它**：类型注册是**按实例**的（`ice.registerType(typeId, Ctor)`），而 `Deserializer`
 * 完全靠这张注册表还原组件 —— 应用里那台 ICE 由各 Designer 的构造函数顺手注册（`FlowDesigner`
 * 注册 `FlowNode/FlowEdge`、`UmlDesigner` 注册 `UmlClass/UmlRelation`……）。
 *
 * 但 **worker 侧的镜像那台 ICE 没有任何 Designer**：它只做"按文档重建 + 渲染"。
 * 不注册的后果不是报错，而是**静默丢内容** —— 反序列化器会跳过整棵未注册的子树
 * （`MirrorTarget.applyScene()` 会把 `unknownTypes` 原样报回来，这正是那条上报存在的意义）。
 *
 * 用法（worker 脚本里，`importScripts` 引擎与 IED 两个 UMD 之后）：
 * ```js
 * ICE.init(offscreenCanvas.getContext('2d'));
 * IED.registerDesignerTypes(ice);
 * const target = new ICE.MirrorTarget(ice);
 * ```
 *
 * 不需要全部领域时，也可以只注册用到的那几个类（`iedTypeId('FlowNode')` → 直接 `ice.registerType`）。
 */
export function registerDesignerTypes(ice: any): number {
  if (!ice || typeof ice.registerType !== 'function') {
    throw new Error('[ice-entity-designer] registerDesignerTypes(ice)：需要一个已存在的 ICE 实例。');
  }
  let count = 0;
  for (let i = 0; i < IED_TYPE_CLASSES.length; i++) {
    const Clazz: any = IED_TYPE_CLASSES[i];
    if (!Clazz || !Clazz.typeId) continue;
    ice.registerType(Clazz.typeId, Clazz);
    count++;
  }
  return count;
}

/** 注册表里有哪些类型（调试 / 文档用）。 */
export function designerTypeIds(): string[] {
  return IED_TYPE_CLASSES.map((Clazz) => Clazz.typeId).sort();
}
