import { createContext, useContext } from 'react';
import type { EntityDesigner } from '../index';

/**
 * React 绑定层上下文：承载当前画布对应的 EntityDesigner 实例。
 * 由 <EntityDesignerCanvas> 提供，供子树内的 useEntityDesigner() 读取。
 */
export const EntityDesignerContext = createContext<EntityDesigner | null>(null);

/**
 * 读取当前 <EntityDesignerCanvas> 的 EntityDesigner 实例。
 * 只能在 <EntityDesignerCanvas> 的子树中使用；未就绪或不在树中时返回 null。
 */
export function useEntityDesigner(): EntityDesigner | null {
  return useContext(EntityDesignerContext);
}
