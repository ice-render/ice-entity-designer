import { ICE } from 'ice-render';
import { EntityDesigner } from '../index';

export type DesignerSessionOptions = {
  /** 渲染模式，默认 dirty-rect */
  renderMode?: 'dirty-rect' | 'full';
  /** 初始项目快照，等价于 loadProject(initialProject) */
  initialProject?: string;
  /** 模型变更回调 */
  onChange?: (snapshot: string) => void;
};

export type DesignerSession = {
  ice: any;
  designer: EntityDesigner;
  /** 销毁会话：退订 + dispose designer + destroy ICE（可重复调用） */
  destroy(): void;
};

/**
 * 在给定的 canvas 元素上创建「ICE + EntityDesigner」会话。
 *
 * React 绑定层用它实现「挂载即初始化、卸载即销毁」；非 React 场景也可直接复用。
 * 由于 ICE.init() 是幂等的、ICE.destroy() 会解绑全局监听与事件总线，因此
 * React StrictMode 的「挂载 → 卸载 → 再挂载」不会累积监听或帧循环。
 */
export function createDesignerSession(canvas: any, options: DesignerSessionOptions = {}): DesignerSession {
  const ice = new ICE();
  ice.init(canvas, { renderMode: options.renderMode === 'full' ? 'full' : 'dirty-rect' });

  const designer = new EntityDesigner(ice);
  const unsubscribe = options.onChange ? designer.subscribe(options.onChange) : null;

  if (options.initialProject) {
    designer.loadProject(options.initialProject);
  }

  let destroyed = false;
  return {
    ice,
    designer,
    destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      if (unsubscribe) {
        unsubscribe();
      }
      designer.dispose();
      ice.destroy();
    },
  };
}

/**
 * 受控模式：判断是否需要把外部 `value` 同步进画布。
 *
 * 内部变更会经 onChange 把同一份快照回传给外部（外部的 value 随之变成它），
 * 此时 lastApplied 已经等于该值，因此这里返回 false，避免「onChange → setState → 再 loadProject」的回环。
 */
export function shouldApplyControlledValue(value: string | undefined, lastApplied: string | null | undefined): boolean {
  return value !== undefined && value !== lastApplied;
}
