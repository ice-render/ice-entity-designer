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
export type { FlowNodeKind, FlowNodePreset, FlowNodeSnapshot } from './flow/FlowNode';
export { default as FlowEdge } from './flow/FlowEdge';
export type { FlowPort, FlowEdgeSnapshot } from './flow/FlowEdge';
export { default as FlowDesigner, validateFlowSnapshot } from './flow/FlowDesigner';
export type { FlowSnapshot, FlowLoadReport, FlowSnapshotValidationResult } from './flow/FlowDesigner';
export { FlowDiamond, FlowParallelogram } from './flow/flow_shapes';

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
