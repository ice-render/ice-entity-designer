/**
 * ice-entity-designer 的 React 绑定入口。
 *
 * 用法：
 *   import { EntityDesignerCanvas, useEntityDesigner } from 'ice-entity-designer/react';
 *
 * 该入口自包含：核心 API（Entity / Relation / toSchemaObject / toSchemaString / validateSchema）
 * 也一并从这里导出，React 项目只需这一个导入点。
 */
export { default as EntityDesignerCanvas } from './EntityDesignerCanvas';
export { EntityDesignerContext, EntityDesignerProvider, useEntityDesigner } from './context';
export type { EntityDesignerProviderProps } from './context';
export { createDesignerSession, shouldApplyControlledValue } from './session';
export type { DesignerSession, DesignerSessionOptions } from './session';
export type { EntityDesignerCanvasProps, EntityDesignerChangePayload, EntityDesignerHandle } from './types';

// 流程图（FlowDesigner）的 React 绑定
export { default as FlowDesignerCanvas } from './FlowDesignerCanvas';
export { FlowDesignerContext, FlowDesignerProvider, useFlowDesigner } from './context';
export type { FlowDesignerProviderProps } from './context';
export { createFlowSession } from './session';
export type { FlowSession, FlowSessionOptions } from './session';
export type { FlowDesignerCanvasProps, FlowDesignerChangePayload, FlowDesignerHandle } from './types';

// 复用核心能力
export {
  Entity,
  Relation,
  FlowNode,
  FlowEdge,
  FlowDesigner,
  FLOW_NODE_KINDS,
  toSchemaObject,
  toSchemaString,
  validateSchema,
} from '../index';
// 流程图相关类型（供调用方标注 kind / port / 快照）
export type { FlowNodeKind, FlowNodePreset, FlowPort, FlowSnapshot, FlowLoadReport } from '../index';
