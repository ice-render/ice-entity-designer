// 跨域包「可连接性」契约（2026-09-13 审计后确立）。
//
// 引擎的 `linkable` 是"能不能作为**任何**连线端点"的单一开关；各域包要按自己的语义给出默认值。
// 审计结论（逐示例实测）：
// - 流元素/分类器/状态/任务条/电气设备与母线都是合法的接线对象 → 保持可连接；
// - **甘特的时间标尺**（表头 + 刻度）不是业务图元 → 不可连接；
// - **二次的端子排**是容器（接线连到**端子**，不连到端子排本身）→ 不可连接；
// - 所有内部装饰子组件（形状/标签/角标/刻度线）都不是"图元类型"，不参与可连接判定。
import { ICE, EventBus } from 'ice-render';
import GanttRuler from '../../src/gantt/GanttRuler';
import { TerminalStrip } from '../../src/secondary/secondary_shapes';

function makeComponent(Ctor: any, props: any = {}) {
  const ice: any = new ICE();
  ice.evtBus = new EventBus();
  ice.childNodes = [];
  ice.toolNodes = [];
  const node: any = new Ctor(props);
  ice.addChild(node);
  return node;
}

/** 收集组件（含后代）里所有 `linkable === true` 的节点，用于断言"装饰件不该可连接"。 */
function linkableDescendants(node: any): string[] {
  const out: string[] = [];
  const walk = (n: any) => {
    for (const child of n.childNodes || []) {
      if (child.state && child.state.linkable) out.push(child.constructor.typeId || '(anonymous)');
      walk(child);
    }
  };
  walk(node);
  return out;
}

describe('跨域包 · 可连接性', () => {
  it('甘特时间标尺（表头/刻度）不可连接', () => {
    expect(makeComponent(GanttRuler).state.linkable).toBe(false);
  });

  it('二次端子排（容器）不可连接：接线连到端子，不连到端子排本身', () => {
    expect(makeComponent(TerminalStrip, { terminals: [] }).state.linkable).toBe(false);
  });

  it('标尺 / 端子排的内部装饰组件也不可连接（可连接性只属于外层节点）', () => {
    expect(linkableDescendants(makeComponent(GanttRuler))).toEqual([]);
    expect(linkableDescendants(makeComponent(TerminalStrip, { terminals: [] }))).toEqual([]);
  });
});
