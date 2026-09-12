import { createElement, forwardRef, Fragment, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { FlowDesignerProvider } from './context';
import { createFlowSession, shouldApplyControlledValue } from './session';
import type { FlowSession } from './session';
import { reportLoadError } from './reportLoadError';
import type { FlowDesignerCanvasProps, FlowDesignerHandle } from './types';

const EMPTY_FLOW = '{"version":1,"kind":"flowchart","nodes":[],"edges":[]}';

/** 把会话包装成对外的命令式句柄；会话为空时各方法安全空转 */
function createHandle(session: FlowSession | null): FlowDesignerHandle {
  const d = session ? session.designer : null;
  return {
    ice: session ? session.ice : null,
    designer: d,
    addNode: (kind, props) => (d ? d.createNode(kind, props) : null),
    connect: (props: any) => (d ? d.createEdge(props) : null),
    updateNode: (id: string, patch: any) => (d ? d.updateNode(id, patch) : null),
    updateEdge: (id: string, patch: any) => (d ? d.updateEdge(id, patch) : null),
    remove: (id: string) => {
      if (d) {
        d.remove(id);
      }
    },
    load: (json: string) => (d ? d.load(json) : { loaded: false, nodes: 0, edges: 0, skipped: [] }),
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
    serialize: () => (d ? d.serialize() : EMPTY_FLOW),
    toSnapshot: () => (d ? d.toSnapshot() : JSON.parse(EMPTY_FLOW)),
    fitViewport: (padding?: number) => {
      if (d) {
        d.fitViewport(padding);
      }
    },
  };
}

/**
 * <FlowDesignerCanvas> —— 在 React 中承载流程图编辑器的画布组件。
 *
 * 与 <EntityDesignerCanvas> 同构：挂载创建 ICE + FlowDesigner 会话、卸载销毁；
 * 支持受控 value / 非受控 defaultValue、onChange（含画布拖拽节点）、onError 与命令式 ref。
 *
 * ```tsx
 * const ref = useRef<FlowDesignerHandle>(null);
 * <FlowDesignerCanvas ref={ref} defaultValue={flowJson} onChange={({ snapshot }) => save(snapshot)} />
 * ```
 */
const FlowDesignerCanvas = forwardRef<any, FlowDesignerCanvasProps>(function FlowDesignerCanvas(props, ref) {
  const canvasRef = useRef<any>(null);
  const sessionRef = useRef<FlowSession | null>(null);
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
  const initialFlow = props.value !== undefined ? props.value : props.defaultValue;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    // 与 ER 画布同理：初始快照不交给 createFlowSession —— 它在返回之前就会
    // load() 并广播一次变更，而那时 session 局部变量还没赋值（TDZ）。
    const session = createFlowSession(canvas, {
      renderMode: props.renderMode,
      onChange: (snapshot) => {
        lastAppliedRef.current = snapshot;
        const callback = onChangeRef.current;
        const current = sessionRef.current;
        if (callback && current) {
          callback({
            snapshot,
            counts: { nodes: current.designer.nodes.length, edges: current.designer.edges.length },
          });
        }
      },
    });

    sessionRef.current = session;
    if (initialFlow !== undefined) {
      lastAppliedRef.current = initialFlow;
      try {
        session.designer.load(initialFlow);
      } catch (error) {
        // 初始快照非法时保留空画布继续可用；记下 lastApplied 避免受控 effect 立刻重复上报
        reportLoadError(onErrorRef.current, 'load-initial', initialFlow, error);
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

  // 受控模式：外部 value 变化时同步进画布
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
      designer.load(value);
    } catch (error) {
      reportLoadError(onErrorRef.current, 'load-controlled', value, error);
    }
  }, [props.value, designer]);

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
    createElement(FlowDesignerProvider, { designer, children: props.children })
  );
});

export default FlowDesignerCanvas;
