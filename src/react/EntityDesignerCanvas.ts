import { createElement, forwardRef, Fragment, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { EntityDesignerContext } from './context';
import { createDesignerSession } from './session';
import type { DesignerSession } from './session';
import type { EntityDesignerCanvasProps, EntityDesignerHandle } from './types';

/**
 * <EntityDesignerCanvas> —— 在 React 中承载 ER 图设计器的画布组件。
 *
 * - 挂载时自动创建 ICE + EntityDesigner 会话，卸载时销毁（StrictMode 双挂载安全）。
 * - 通过 ref 暴露命令式 API；通过 onChange 回调输出项目快照与 TypeORM Schema。
 * - 子节点渲染在上下文内，可直接 useEntityDesigner() 取到底层 EntityDesigner。
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

  const width = props.width || 1200;
  const height = props.height || 800;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    const session = createDesignerSession(canvas, {
      renderMode: props.renderMode,
      initialProject: props.defaultValue,
      onChange: (snapshot) => {
        const callback = onChangeRef.current;
        if (callback) {
          callback({ snapshot, schema: session.designer.toSchemaObject() });
        }
      },
    });

    sessionRef.current = session;
    setDesigner(session.designer);
    if (onReadyRef.current) {
      onReadyRef.current(createHandle(session));
    }

    return () => {
      session.destroy();
      sessionRef.current = null;
      setDesigner(null);
    };
    // 只在挂载/卸载时执行；renderMode / defaultValue 属于初始参数，不参与重建
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    createElement(EntityDesignerContext.Provider, { value: designer }, props.children)
  );
});

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
    loadProject: (json: string) => {
      if (d) {
        d.loadProject(json);
      }
    },
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

export default EntityDesignerCanvas;
