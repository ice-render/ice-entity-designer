/**
 * @jest-environment jsdom
 *
 * <FlowDesignerCanvas> 的挂载/卸载、受控同步、onChange 载荷与 onError 兜底。
 * 这里 mock 掉 ice-render 与核心入口，只验证组件的生命周期编排与受控逻辑。
 */

jest.mock('ice-render', () => {
  return {
    ICE: class MockICE {
      static instances: any[] = [];
      init = jest.fn();
      destroy = jest.fn();
      constructor() {
        (this.constructor as any).instances.push(this);
      }
    },
  };
});

jest.mock('../../src/index', () => {
  return {
    EntityDesigner: class MockEntityDesigner {},
    FlowDesigner: class MockFlowDesigner {
      static instances: any[] = [];
      static lastListener: any = null;
      nodes: any[] = [];
      edges: any[] = [];
      dispose = jest.fn();
      // 模拟真实引擎：load() 会触发一次变更广播（正是它在初始化期暴露了 TDZ 问题）
      load = jest.fn((json: string) => {
        if (json === '__invalid__') {
          throw new Error('Invalid flow snapshot');
        }
        const listener = (this.constructor as any).lastListener;
        if (listener) {
          // 真实实现广播的是当前快照，即刚载入的这一份
          listener(json);
        }
        return { loaded: true, nodes: 0, edges: 0, skipped: [] };
      });
      createNode = jest.fn(() => ({ state: { id: 'n1' } }));
      createEdge = jest.fn(() => ({ state: { id: 'e1' } }));
      updateNode = jest.fn();
      updateEdge = jest.fn();
      remove = jest.fn();
      undo = jest.fn();
      redo = jest.fn();
      serialize = jest.fn(() => '{"version":1,"kind":"flowchart","nodes":[],"edges":[]}');
      toSnapshot = jest.fn(() => ({ version: 1, kind: 'flowchart', nodes: [], edges: [] }));
      fitViewport = jest.fn();
      subscribe = jest.fn((listener: any) => {
        (this.constructor as any).lastListener = listener;
        return () => undefined;
      });
      constructor() {
        (this.constructor as any).instances.push(this);
      }
    },
  };
});

import { createElement } from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import FlowDesignerCanvas from '../../src/react/FlowDesignerCanvas';
import { useFlowDesigner } from '../../src/react/context';

const MockICE: any = require('ice-render').ICE;
const MockFlowDesigner: any = require('../../src/index').FlowDesigner;

(global as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('<FlowDesignerCanvas> 生命周期与受控', () => {
  let container: any;
  let root: any;

  beforeEach(() => {
    MockICE.instances.length = 0;
    MockFlowDesigner.instances.length = 0;
    MockFlowDesigner.lastListener = null;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    container.remove();
  });

  it('挂载创建 ICE + FlowDesigner，卸载时 dispose + destroy', () => {
    act(() => {
      root.render(createElement(FlowDesignerCanvas, { width: 200, height: 100 }));
    });

    expect(MockICE.instances.length).toBe(1);
    expect(MockFlowDesigner.instances.length).toBe(1);
    const ice = MockICE.instances[0];
    const designer = MockFlowDesigner.instances[0];
    expect(ice.init).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
    root = null;

    expect(designer.dispose).toHaveBeenCalledTimes(1);
    expect(ice.destroy).toHaveBeenCalledTimes(1);
  });

  it('非受控：defaultValue 作为初始流程载入，且初始化期广播不崩（TDZ 回归）', () => {
    const onChange = jest.fn();
    expect(() => {
      act(() => {
        root.render(createElement(FlowDesignerCanvas, { defaultValue: '{"seed":1}', onChange }));
      });
    }).not.toThrow();
    expect(MockFlowDesigner.instances[0].load).toHaveBeenCalledWith('{"seed":1}');
    // 载入也会上报一次，且回调里拿得到实例（counts 可读）
    expect(onChange).toHaveBeenCalledWith({ snapshot: '{"seed":1}', counts: { nodes: 0, edges: 0 } });
  });

  it('受控：value 变化同步进画布，内部回传同值时不回环', () => {
    act(() => {
      root.render(createElement(FlowDesignerCanvas, { value: '{"v":1}' }));
    });
    const designer = MockFlowDesigner.instances[0];
    expect(designer.load).toHaveBeenCalledTimes(1);
    expect(designer.load).toHaveBeenCalledWith('{"v":1}');

    act(() => {
      root.render(createElement(FlowDesignerCanvas, { value: '{"v":2}' }));
    });
    expect(designer.load).toHaveBeenCalledWith('{"v":2}');

    act(() => {
      MockFlowDesigner.lastListener('{"v":3}');
    });
    designer.load.mockClear();
    act(() => {
      root.render(createElement(FlowDesignerCanvas, { value: '{"v":3}' }));
    });
    expect(designer.load).not.toHaveBeenCalled();
  });

  it('非法 defaultValue：挂载不崩，走 onError 上报', () => {
    const onError = jest.fn();
    expect(() => {
      act(() => {
        root.render(createElement(FlowDesignerCanvas, { defaultValue: '__invalid__', onError }));
      });
    }).not.toThrow();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatchObject({ phase: 'load-initial', snapshot: '__invalid__' });
  });

  it('非法受控 value：不抛进渲染树，走 onError 上报', () => {
    const onError = jest.fn();
    act(() => {
      root.render(createElement(FlowDesignerCanvas, { value: '{"v":1}', onError }));
    });
    expect(() => {
      act(() => {
        root.render(createElement(FlowDesignerCanvas, { value: '__invalid__', onError }));
      });
    }).not.toThrow();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatchObject({ phase: 'load-controlled', snapshot: '__invalid__' });
  });

  it('onReady 句柄转发到 FlowDesigner，并按 kind 建节点', () => {
    const onReady = jest.fn();
    act(() => {
      root.render(createElement(FlowDesignerCanvas, { onReady }));
    });
    const handle = onReady.mock.calls[0][0];
    const designer = MockFlowDesigner.instances[0];
    expect(handle.designer).toBe(designer);
    handle.addNode('decision', { title: '通过？' });
    expect(designer.createNode).toHaveBeenCalledWith('decision', { title: '通过？' });
    handle.connect({ sourceId: 'n1', targetId: 'n1' });
    expect(designer.createEdge).toHaveBeenCalledWith({ sourceId: 'n1', targetId: 'n1' });
    expect(handle.serialize()).toContain('flowchart');
    expect(handle.toSnapshot().kind).toBe('flowchart');
  });

  it('useFlowDesigner() 在子树内取到同一个实例', () => {
    let seen: any = 'unset';
    function Probe() {
      seen = useFlowDesigner();
      return null;
    }
    act(() => {
      root.render(createElement(FlowDesignerCanvas, { children: createElement(Probe) }));
    });
    expect(seen).toBe(MockFlowDesigner.instances[0]);
  });
});
