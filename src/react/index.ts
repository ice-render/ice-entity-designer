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
export { EntityDesignerContext, useEntityDesigner } from './context';
export { createDesignerSession } from './session';
export type { DesignerSession, DesignerSessionOptions } from './session';
export type { EntityDesignerCanvasProps, EntityDesignerChangePayload, EntityDesignerHandle } from './types';

// 复用核心能力
export { Entity, Relation, toSchemaObject, toSchemaString, validateSchema } from '../index';
