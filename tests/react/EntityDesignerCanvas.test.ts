/**
 * @jest-environment jsdom
 *
 * <EntityDesignerCanvas> 的挂载/卸载与受控同步。
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
    EntityDesigner: class MockEntityDesigner {
      static instances: any[] = [];
      static lastListener: any = null;
      dispose = jest.fn();
      loadProject = jest.fn();
      toSchemaObject = jest.fn(() => ({ mock: 'schema' }));
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
import EntityDesignerCanvas from '../../src/react/EntityDesignerCanvas';

const MockICE: any = require('ice-render').ICE;
const MockEntityDesigner: any = require('../../src/index').EntityDesigner;

(global as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('<EntityDesignerCanvas> 生命周期与受控', () => {
  let container: any;
  let root: any;

  beforeEach(() => {
    MockICE.instances.length = 0;
    MockEntityDesigner.instances.length = 0;
    MockEntityDesigner.lastListener = null;
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

  it('挂载创建 ICE + EntityDesigner，卸载时 dispose + destroy', () => {
    act(() => {
      root.render(createElement(EntityDesignerCanvas, { width: 200, height: 100 }));
    });

    expect(MockICE.instances.length).toBe(1);
    expect(MockEntityDesigner.instances.length).toBe(1);
    const ice = MockICE.instances[0];
    const designer = MockEntityDesigner.instances[0];
    expect(ice.init).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
    root = null;

    expect(designer.dispose).toHaveBeenCalledTimes(1);
    expect(ice.destroy).toHaveBeenCalledTimes(1);
  });

  it('非受控：defaultValue 作为初始项目载入', () => {
    act(() => {
      root.render(createElement(EntityDesignerCanvas, { defaultValue: '{"init":true}' }));
    });
    expect(MockEntityDesigner.instances[0].loadProject).toHaveBeenCalledWith('{"init":true}');
  });

  it('受控：value 变化同步进画布，内部回传同值时不回环', () => {
    act(() => {
      root.render(createElement(EntityDesignerCanvas, { value: '{"v":1}' }));
    });
    const designer = MockEntityDesigner.instances[0];
    expect(designer.loadProject).toHaveBeenCalledTimes(1);
    expect(designer.loadProject).toHaveBeenCalledWith('{"v":1}');

    // 外部换新值 → 应用
    act(() => {
      root.render(createElement(EntityDesignerCanvas, { value: '{"v":2}' }));
    });
    expect(designer.loadProject).toHaveBeenCalledWith('{"v":2}');

    // 模拟内部变更：subscribe 回调回传快照（组件会记下 lastApplied）
    act(() => {
      MockEntityDesigner.lastListener('{"v":3}');
    });
    designer.loadProject.mockClear();

    // 外部把 value 设成内部刚回传的快照 → 不应再次 loadProject
    act(() => {
      root.render(createElement(EntityDesignerCanvas, { value: '{"v":3}' }));
    });
    expect(designer.loadProject).not.toHaveBeenCalled();
  });

  it('onChange 回调收到 { snapshot, schema }', () => {
    const onChange = jest.fn();
    act(() => {
      root.render(createElement(EntityDesignerCanvas, { onChange }));
    });

    act(() => {
      MockEntityDesigner.lastListener('{"changed":true}');
    });

    expect(onChange).toHaveBeenCalledWith({ snapshot: '{"changed":true}', schema: { mock: 'schema' } });
  });

  it('onReady 回调拿到命令式句柄；句柄方法转发到底层实例', () => {
    const onReady = jest.fn();
    act(() => {
      root.render(createElement(EntityDesignerCanvas, { onReady }));
    });

    expect(onReady).toHaveBeenCalledTimes(1);
    const handle = onReady.mock.calls[0][0];
    expect(handle.designer).toBe(MockEntityDesigner.instances[0]);
    expect(typeof handle.addEntity).toBe('function');
    expect(handle.toSchemaObject()).toEqual({ mock: 'schema' });
  });
});
