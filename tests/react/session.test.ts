/**
 * React 绑定层的会话封装：createDesignerSession 的创建 / 初始项目 / onChange 透传 / 销毁。
 * 这里用 mock 替换 ice-render 与核心入口，只验证会话编排（挂载即初始化、卸载即销毁）。
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
      static unsubscribe = jest.fn();
      ice: any;
      dispose = jest.fn();
      loadProject = jest.fn();
      toSchemaObject = jest.fn(() => ({ mock: 'schema' }));
      subscribe = jest.fn((listener: any) => {
        (this.constructor as any).lastListener = listener;
        return (this.constructor as any).unsubscribe;
      });
      constructor(ice: any) {
        this.ice = ice;
        (this.constructor as any).instances.push(this);
      }
    },
    FlowDesigner: class MockFlowDesigner {
      static instances: any[] = [];
      static lastListener: any = null;
      static unsubscribe = jest.fn();
      ice: any;
      dispose = jest.fn();
      load = jest.fn();
      subscribe = jest.fn((listener: any) => {
        (this.constructor as any).lastListener = listener;
        return (this.constructor as any).unsubscribe;
      });
      constructor(ice: any) {
        this.ice = ice;
        (this.constructor as any).instances.push(this);
      }
    },
  };
});

import { createDesignerSession, createFlowSession, shouldApplyControlledValue } from '../../src/react/session';

const MockICE: any = require('ice-render').ICE;
const MockEntityDesigner: any = require('../../src/index').EntityDesigner;
const MockFlowDesigner: any = require('../../src/index').FlowDesigner;

function fakeCanvas() {
  return { width: 800, height: 600, getContext: () => ({}) };
}

describe('createDesignerSession', () => {
  beforeEach(() => {
    MockICE.instances.length = 0;
    MockEntityDesigner.instances.length = 0;
    MockEntityDesigner.lastListener = null;
    MockEntityDesigner.unsubscribe.mockClear();
    MockFlowDesigner.instances.length = 0;
    MockFlowDesigner.lastListener = null;
    MockFlowDesigner.unsubscribe.mockClear();
  });

  it('在 canvas 上创建 ICE + EntityDesigner，并按 renderMode 初始化', () => {
    const canvas = fakeCanvas();
    const session = createDesignerSession(canvas);

    const ice = MockICE.instances[0];
    expect(ice.init).toHaveBeenCalledWith(canvas, { renderMode: 'dirty-rect' });
    expect(session.ice).toBe(ice);
    expect(session.designer).toBe(MockEntityDesigner.instances[0]);
    expect(session.designer.ice).toBe(ice);
  });

  it('renderMode: full 会透传', () => {
    createDesignerSession(fakeCanvas(), { renderMode: 'full' });
    expect(MockICE.instances[0].init).toHaveBeenCalledWith(expect.anything(), { renderMode: 'full' });
  });

  it('initialProject 会调用 loadProject', () => {
    const session = createDesignerSession(fakeCanvas(), { initialProject: '{"entities":[]}' });
    expect(session.designer.loadProject).toHaveBeenCalledWith('{"entities":[]}');
  });

  it('onChange 会被订阅，并且能收到变更回调', () => {
    const onChange = jest.fn();
    createDesignerSession(fakeCanvas(), { onChange });

    expect(MockEntityDesigner.instances[0].subscribe).toHaveBeenCalledWith(onChange);
    // 模拟一次模型变更
    MockEntityDesigner.lastListener('{"entities":[]}');
    expect(onChange).toHaveBeenCalledWith('{"entities":[]}');
  });

  it('destroy 会退订 + dispose + 销毁 ICE，且可重复调用不重复执行', () => {
    const session = createDesignerSession(fakeCanvas(), { onChange: jest.fn() });
    const designer = session.designer as any;
    const ice = session.ice;

    session.destroy();

    expect(MockEntityDesigner.unsubscribe).toHaveBeenCalledTimes(1);
    expect(designer.dispose).toHaveBeenCalledTimes(1);
    expect(ice.destroy).toHaveBeenCalledTimes(1);

    session.destroy();
    expect(ice.destroy).toHaveBeenCalledTimes(1);
  });

  it('没有 onChange 时不订阅', () => {
    createDesignerSession(fakeCanvas());
    expect(MockEntityDesigner.instances[0].subscribe).not.toHaveBeenCalled();
  });
});

describe('createFlowSession', () => {
  beforeEach(() => {
    MockICE.instances.length = 0;
    MockFlowDesigner.instances.length = 0;
    MockFlowDesigner.lastListener = null;
    MockFlowDesigner.unsubscribe.mockClear();
  });

  it('在 canvas 上创建 ICE + FlowDesigner，并按 renderMode 初始化', () => {
    const canvas = fakeCanvas();
    const session = createFlowSession(canvas);

    const ice = MockICE.instances[0];
    expect(ice.init).toHaveBeenCalledWith(canvas, { renderMode: 'dirty-rect' });
    expect(session.designer).toBe(MockFlowDesigner.instances[0]);
    expect(session.designer.ice).toBe(ice);
  });

  it('renderMode: full 会透传；initialFlow 会调用 load', () => {
    const session = createFlowSession(fakeCanvas(), { renderMode: 'full', initialFlow: '{"nodes":[]}' });
    expect(MockICE.instances[0].init).toHaveBeenCalledWith(expect.anything(), { renderMode: 'full' });
    expect(session.designer.load).toHaveBeenCalledWith('{"nodes":[]}');
  });

  it('onChange 会被订阅，并能收到流程变更（含画布拖动）', () => {
    const onChange = jest.fn();
    createFlowSession(fakeCanvas(), { onChange });

    expect(MockFlowDesigner.instances[0].subscribe).toHaveBeenCalledTimes(1);
    MockFlowDesigner.lastListener('{"nodes":[],"edges":[]}');
    expect(onChange).toHaveBeenCalledWith('{"nodes":[],"edges":[]}');
  });

  it('destroy 会退订 + dispose + 销毁 ICE，且可重复调用不重复执行', () => {
    const session = createFlowSession(fakeCanvas(), { onChange: jest.fn() });
    const designer = session.designer as any;
    const ice = session.ice;

    session.destroy();
    expect(MockFlowDesigner.unsubscribe).toHaveBeenCalledTimes(1);
    expect(designer.dispose).toHaveBeenCalledTimes(1);
    expect(ice.destroy).toHaveBeenCalledTimes(1);

    session.destroy();
    expect(ice.destroy).toHaveBeenCalledTimes(1);
  });

  it('没有 onChange 时不订阅', () => {
    createFlowSession(fakeCanvas());
    expect(MockFlowDesigner.instances[0].subscribe).not.toHaveBeenCalled();
  });
});

describe('受控模式的同步判定（shouldApplyControlledValue）', () => {
  it('非受控（value 为 undefined）时不应用', () => {
    expect(shouldApplyControlledValue(undefined, null)).toBe(false);
    expect(shouldApplyControlledValue(undefined, '{"a":1}')).toBe(false);
  });

  it('外部新值与已应用值不同 → 应用', () => {
    expect(shouldApplyControlledValue('{"b":2}', '{"a":1}')).toBe(true);
  });

  it('首次挂载（尚未应用过任何值）→ 应用', () => {
    expect(shouldApplyControlledValue('{"a":1}', null)).toBe(true);
  });

  it('与最近一次已应用值相同（内部变更回传）→ 不应用，避免回环', () => {
    expect(shouldApplyControlledValue('{"a":1}', '{"a":1}')).toBe(false);
  });
});
