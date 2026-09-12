import type { EntityDesignerErrorPayload } from './types';

/**
 * 载入快照失败时上报给 onError（默认 console.error）。
 *
 * React 绑定层的两处 loadProject / load 都走这里兜底：非法 / 版本不兼容的快照
 * 只会被上报，不会把异常抛进 React 渲染树（挂载期抛错会直接崩掉整棵子树）。
 */
export function reportLoadError(
  handler: ((payload: EntityDesignerErrorPayload) => void) | undefined,
  phase: EntityDesignerErrorPayload['phase'],
  snapshot: string,
  error: unknown
): void {
  const normalized = error instanceof Error ? error : new Error(String(error));
  if (handler) {
    handler({ phase, snapshot, error: normalized });
    return;
  }
  if (typeof console !== 'undefined' && console.error) {
    console.error(`[ice-entity-designer] ${phase} 快照载入失败：`, normalized);
  }
}
