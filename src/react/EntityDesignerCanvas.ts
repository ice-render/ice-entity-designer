import { createElement, forwardRef, Fragment, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { EntityDesignerProvider } from './context';
import { createDesignerSession, shouldApplyControlledValue } from './session';
import type { DesignerSession } from './session';
import { reportLoadError } from './reportLoadError';
import type { EntityDesignerCanvasProps, EntityDesignerHandle } from './types';

/** 把会话包装成对外的命令式句柄；会话为空时各方法安全空转 */
function createHandle(session: DesignerSession | null): EntityDesignerHandle {
  const d = session ? session.designer : null;
  return {
    ice: session ? session.ice : null,
    designer: d,
    addEntity: (p?: any) => (d ? d.createEntity(p) : null),
    connect: (p: any) => (d ? d.createRelation(p) : null),
    updateEntity: (id: string, patch: any) => (d ? d.updateEntity(id, patch) : null),
    updateRelation: (id: string, patch: any) => (d ? d.updateRelation(id, patch) : null),
    remove: (id: string) => {
      if (d) {
        d.removeComponent(id);
      }
    },
    loadProject: (json: string) =>
      d ? d.loadProject(json) : { loaded: false, entities: 0, relations: 0, unknownTypes: [], skipped: [] },
    undo: () => {
      if (d) {
        d.undo();
      }
    },
    redo: () => {
      if (d) {
        d.redo();
      }
    },
    toSchemaObject: () => (d ? d.toSchemaObject() : []),
    toSchemaString: () => (d ? d.toSchemaString() : '[]'),
    validate: () => (d ? d.validate() : []),
    serializeProject: () => (d ? d.serializeProject() : ''),
  };
}

/**
 * <EntityDesignerCanvas> —— 在 React 中承载 ER 图设计器的画布组件。
 *
 * - 挂载时自动创建 ICE + EntityDesigner 会话，卸载时销毁（StrictMode 双挂载安全）。
 * - 受控 / 非受控两种用法：
 *     非受控：`defaultValue` 作初始快照；
 *     受控：  `value` 变化时同步进画布，内部变更通过 `onChange` 向上汇报（带循环保护）。
 * - 通过 ref 暴露命令式 API；子节点渲染在上下文内，可直接 useEntityDesigner()。
 */
const EntityDesignerCanvas = forwardRef<any, EntityDesignerCanvasProps>(function EntityDesignerCanvas(props, ref) {
  const canvasRef = useRef<any>(null);
  const sessionRef = useRef<DesignerSession | null>(null);
  const [designer, setDesigner] = useState<any>(null);

  // 回调放进 ref，避免它们变化导致画布重建
  const onChangeRef = useRef(props.onChange);
  onChangeRef.current = props.onChange;
  const onReadyRef = useRef(props.onReady);
  onReadyRef.current = props.onReady;
  const onErrorRef = useRef(props.onError);
  onErrorRef.current = props.onError;

  /** 最近一次「已同步进画布」的快照，用于受控模式的循环保护 */
  const lastAppliedRef = useRef<string | null>(null);

  const width = props.width || 1200;
  const height = props.height || 800;
  const initialProject = props.value !== undefined ? props.value : props.defaultValue;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    // 注意：initialProject 不交给 createDesignerSession —— 它会在返回之前就 loadProject 并触发一次
    // 变更广播，而那时局部变量 session 还没赋值，回调里引用它会抛
    // "Cannot access 'session' before initialization"（TDZ，只有跑真实构建产物才会暴露）。
    const session = createDesignerSession(canvas, {
      renderMode: props.renderMode,
      onChange: (snapshot) => {
        lastAppliedRef.current = snapshot;
        const callback = onChangeRef.current;
        const current = sessionRef.current; // 用 ref 而不是闭包变量，避免初始化期被引用
        if (callback && current) {
          callback({ snapshot, schema: current.designer.toSchemaObject() });
        }
      },
    });

    sessionRef.current = session;
    // 会话就绪后再载入初始快照，保证上面回调里拿得到实例
    if (initialProject !== undefined) {
      lastAppliedRef.current = initialProject;
      try {
        session.designer.loadProject(initialProject);
      } catch (error) {
        // 初始快照非法时保留空白项目继续可用，只上报错误。
        // 仍然记下 lastApplied，避免受控 effect 立刻用同一个 value 再报一次。
        reportLoadError(onErrorRef.current, 'load-initial', initialProject, error);
      }
    } else {
      lastAppliedRef.current = null;
    }

    setDesigner(session.designer);
    if (onReadyRef.current) {
      onReadyRef.current(createHandle(session));
    }

    return () => {
      session.destroy();
      sessionRef.current = null;
      setDesigner(null);
    };
    // 只在挂载/卸载时执行；renderMode / 初始快照属于初始参数，不参与重建
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 受控模式：外部 value 变化时同步进画布。
  // 由内部变更触发的那次 onChange 会把 lastApplied 更新为同一值，因此这里会跳过，不会形成回环。
  useEffect(() => {
    if (!designer) {
      return;
    }
    if (!shouldApplyControlledValue(props.value, lastAppliedRef.current)) {
      return;
    }
    const value = props.value as string;
    lastAppliedRef.current = value;
    try {
      designer.loadProject(value);
    } catch (error) {
      reportLoadError(onErrorRef.current, 'load-controlled', value, error);
    }
  }, [props.value, designer]);

  // designer 是刻意的依赖：句柄从 ref 里取实例，只有 designer 变化时才需要重建，
  // 否则它会在挂载时（ref 还是 null）被固化成一个全部空转的句柄。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useImperativeHandle(ref, () => createHandle(sessionRef.current), [designer]);

  return createElement(
    Fragment,
    null,
    createElement(
      'div',
      {
        className: props.className,
        style: { position: 'relative', width, height, ...(props.style || {}) },
      },
      createElement('canvas', {
        ref: canvasRef,
        width,
        height,
        style: { display: 'block' },
      })
    ),
    // children 渲染在上下文内部，可直接用 useEntityDesigner() 操控同一实例；
    // 放在画布盒子之外，方便把工具条 / 侧栏排布在画布周围。
    createElement(EntityDesignerProvider, { designer, children: props.children })
  );
});

export default EntityDesignerCanvas;
