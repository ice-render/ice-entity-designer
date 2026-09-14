/**
 * 标签外观的位置规则（全仓库一条）：
 * **规范位置 = `style.label`**（引擎 2.4 起「外观只有一个容器」，子元素外观用 `style.<元素>` 嵌套）。
 *
 * 这条测试覆盖曾经各自为政的四处：状态机节点、状态机转移（连线标签）、甘特条、二次开发导线。
 * 老写法 `labelStyle` 仍然被接受（构造时单向并入），但不该再出现在 `state` 上。
 */
import { ICE, EventBus } from 'ice-render';
import StateNode from '../../src/statechart/StateNode';
import StateTransition from '../../src/statechart/StateTransition';
import GanttTask from '../../src/gantt/GanttTask';

function makeIce(): any {
  const ice: any = new ICE();
  ice.evtBus = new EventBus();
  ice.childNodes = [];
  ice.toolNodes = [];
  return ice;
}

describe('标签外观：规范位置 style.label', () => {
  it('状态机节点：默认值在 style.label，state 上没有 labelStyle', () => {
    const node: any = new StateNode({ kind: 'state', title: '订单处理' });
    expect(node.state.style.label).toBeTruthy();
    expect(node.state.style.label.textColor).toBe('#1e293b');
    expect(node.state.style.label.fontSize).toBe(13.5);
    expect(node.state.labelStyle).toBeUndefined();
  });

  it('状态机节点：老写法 labelStyle 被单向并入（style.label 优先）', () => {
    const legacy: any = new StateNode({ kind: 'state', title: 'A', labelStyle: { fontSize: 18 } });
    expect(legacy.state.style.label.fontSize).toBe(18);

    const both: any = new StateNode({
      kind: 'state',
      title: 'A',
      labelStyle: { fontSize: 18 },
      style: { label: { fontSize: 11 } },
    });
    expect(both.state.style.label.fontSize).toBe(11);
  });

  it('状态机转移（连线标签）：默认值在 style.label', () => {
    const transition: any = new StateTransition({ event: 'submit' });
    expect(transition.state.style.label.fillStyle).toBe('#334155');
    expect(transition.state.labelStyle).toBeUndefined();
  });

  it('甘特条：默认值在 style.label（且进度色等仍在 style 里）', () => {
    const task: any = new GanttTask({ title: '基础施工', days: 5 });
    expect(task.state.style.label.textColor).toBe('#ffffff');
    expect(task.state.style.label.fontSize).toBe(12);
    expect(task.state.style.progressFill).toBe('#2563eb');
    expect(task.state.labelStyle).toBeUndefined();
  });

  it('形状重建判断不再需要单列 labelStyle：改 style 就会重建', () => {
    const ice = makeIce();
    const node: any = new StateNode({ kind: 'state', title: 'A' });
    ice.addChild(node);
    const before = node.childNodes.length;
    // 改标签字号（属于 style）→ 派生形状要重排
    node.setState({ style: { ...node.state.style, label: { ...node.state.style.label, fontSize: 20 } } });
    expect(node.childNodes.length).toBe(before);
    expect(node.state.style.label.fontSize).toBe(20);
  });
});
