/**
 * Copyright (c) 2022 大漠穷秋.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
export { default as Entity } from './er-component/Entity';
export { default as Relation } from './er-component/Relation';
export { default as EntityDesigner } from './designer/EntityDesigner';
export type { ProjectLoadReport, ProjectLoadSkippedNode } from './designer/EntityDesigner';
export { toSchemaObject, toSchemaString } from './utils/serialization_util';
export { validateSchema } from './utils/schema_validator';
export { PROJECT_SCHEMA_VERSION, validateProjectSnapshot } from './utils/project_schema';

// 流程图（与 ER 并列的第二类领域图元与应用层）
export { default as FlowNode, FLOW_NODE_KINDS } from './flow/FlowNode';
export type { FlowNodeKind, FlowNodePreset } from './flow/FlowNode';
export { default as FlowEdge } from './flow/FlowEdge';
export type { FlowPort } from './flow/FlowEdge';
export { default as FlowDesigner, validateFlowSnapshot } from './flow/FlowDesigner';
export type { FlowSnapshot, FlowLoadReport, FlowSnapshotValidationResult } from './flow/FlowDesigner';
export { FlowDiamond, FlowParallelogram } from './flow/flow_shapes';

// BPMN 2.0（复用流程图机制：同一套 FlowNode/FlowEdge/FlowDesigner，只扩语义与记法）
export { default as BpmnDesigner } from './bpmn/BpmnDesigner';
export { validateBpmn } from './bpmn/bpmn_validate';
export type { BpmnIssue } from './bpmn/bpmn_validate';
export { toBpmnXml, fromBpmnXml } from './bpmn/bpmn_xml';
export type { BpmnImportResult } from './bpmn/bpmn_xml';

// UML 类图（domain pack：形状 + 应用层 + 校验；快照/导出/容器等全部复用引擎）
export { default as UmlClass } from './uml/UmlClass';
export type { UmlClassKind } from './uml/UmlClass';
export { default as UmlRelation, UML_RELATION_KINDS, UML_RELATION_STYLE } from './uml/UmlRelation';
export type { UmlRelationKind, UmlMarker } from './uml/UmlRelation';
export { default as UmlDesigner } from './uml/UmlDesigner';
export type { UmlIssue } from './uml/UmlDesigner';
// 状态机（domain pack：伪状态/状态/复合状态 + 转移 + 语义校验；复合状态复用容器能力）
export { default as StateNode, STATECHART_NODE_KINDS } from './statechart/StateNode';
export type { StatechartNodeKind } from './statechart/StateNode';
export { default as StateTransition } from './statechart/StateTransition';
export { default as StatechartDesigner } from './statechart/StatechartDesigner';
export type { StatechartIssue } from './statechart/StatechartDesigner';

// 甘特图（domain pack：时间轴刻度 + 拖拽按天吸附 + 依赖）
export { default as GanttTask } from './gantt/GanttTask';
export { default as GanttDependency } from './gantt/GanttDependency';
export { default as GanttRuler } from './gantt/GanttRuler';
export type { GanttRulerOptions } from './gantt/GanttRuler';
export { default as GanttDesigner } from './gantt/GanttDesigner';
export type { GanttIssue, GanttTaskInput } from './gantt/GanttDesigner';
export { parseDate, formatDate, addDays, diffDays, eachDay, tickLabel } from './gantt/gantt_date';

// 文本互操作：PlantUML / Mermaid 类图语法子集（导入导出）
export { toPlantUml, fromPlantUml, arrowOf, detectUmlDialect } from './uml/uml_text';
export type { UmlTextImportResult } from './uml/uml_text';

/**
 * 引擎内核（ice-render）在构建时已被打包进本包，这里一并导出。
 *
 * 调用方只需安装 ice-entity-designer 一个包即可：
 *
 * ```js
 * import { ICE, EntityDesigner } from 'ice-entity-designer';
 * const ice = new ICE().init(canvas);
 * const designer = new EntityDesigner(ice);
 * ```
 *
 * 之所以在这里再导出一次（而不是让调用方各自安装 ice-render），是为了保证
 * ICE 实例与 Entity / Relation 组件来自**同一份内核实例**，避免两份内核导致的类型不匹配。
 */
export * from 'ice-render';
