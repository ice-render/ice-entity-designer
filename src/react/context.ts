import { createContext, createElement, useContext } from 'react';
import type { EntityDesigner, FlowDesigner } from '../index';

/**
 * React 绑定层上下文：承载当前画布对应的 EntityDesigner 实例。
 * 由 <EntityDesignerCanvas>（或 <EntityDesignerProvider>）提供，供子树内的 useEntityDesigner() 读取。
 */
export const EntityDesignerContext = createContext<EntityDesigner | null>(null);

export type EntityDesignerProviderProps = {
  /** 要共享的 EntityDesigner 实例（通常来自 createDesignerSession） */
  designer: EntityDesigner | null;
  children?: any;
};

/**
 * 手动提供上下文。适用于「自己创建会话」的场景：
 *
 * ```ts
 * const session = createDesignerSession(canvasEl);
 * // <EntityDesignerProvider designer={session.designer}>…工具条…</EntityDesignerProvider>
 * ```
 */
export function EntityDesignerProvider(props: EntityDesignerProviderProps) {
  return createElement(EntityDesignerContext.Provider, { value: props.designer }, props.children);
}

/**
 * 读取当前画布的 EntityDesigner 实例。
 * 只能在 <EntityDesignerCanvas> / <EntityDesignerProvider> 的子树中使用；未就绪或不在树中时返回 null。
 */
export function useEntityDesigner(): EntityDesigner | null {
  return useContext(EntityDesignerContext);
}

/**
 * 流程图上下文：承载当前画布对应的 FlowDesigner 实例。
 * 由 <FlowDesignerCanvas>（或 <FlowDesignerProvider>）提供，供子树内的 useFlowDesigner() 读取。
 */
export const FlowDesignerContext = createContext<FlowDesigner | null>(null);

export type FlowDesignerProviderProps = {
  /** 要共享的 FlowDesigner 实例（通常来自 createFlowSession） */
  designer: FlowDesigner | null;
  children?: any;
};

/** 手动提供流程图上下文。适用于「自己创建会话」的场景。 */
export function FlowDesignerProvider(props: FlowDesignerProviderProps) {
  return createElement(FlowDesignerContext.Provider, { value: props.designer }, props.children);
}

/**
 * 读取当前画布的 FlowDesigner 实例。
 * 只能在 <FlowDesignerCanvas> / <FlowDesignerProvider> 的子树中使用；未就绪或不在树中时返回 null。
 */
export function useFlowDesigner(): FlowDesigner | null {
  return useContext(FlowDesignerContext);
}
