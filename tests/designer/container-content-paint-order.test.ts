/**
 * **容器的底必须画在容器内容之下** —— 跨域回归（BPMN 池/泳道 + 状态机复合状态）。
 *
 * 背景：引擎 2.13.0 把渲染顺序从「展平后全局按 zIndex 排序」改成
 * 「**树序（先父后子）+ 兄弟按 zIndex 升序**」（见 ice-render 的渲染顺序铁律）。
 * 设计器里"容器的底"**是容器的一个子组件**（形状由子组件绘制，这样才能画菱形 / 事件圆 / 圆角框），
 * 而池里的泳道 / 泳道里的节点 / 复合状态里的子状态也是同一个父容器下的**兄弟** ——
 * 于是"底"排在内容之后时，整段内容会被自己的底色盖掉：
 *
 *   - BPMN 案例：池的底（默认 `'auto'` = 0）排在泳道（-20000）之后 → **任务矩形全部消失**；
 *   - 状态图案例：复合状态的框（`baseZ + 1` = 1）排在子状态（`'auto'` = 0）之后 → **复合状态变成空框**。
 *
 * 本用例锁住的是**绘制次序**而不是具体的 z 数值：判据走引擎导出的 `paintOrderChildrenOf`
 * （与画布/导出同源的那份排序口径），所以"底必须排在内容之前"这件事换一套 z 编号也不会漏。
 *
 * 注：底排在内容之前**不再靠应用自己钉 zIndex** —— ice-render 2.19.0 起引擎保证派生部件先画
 * （见 README「容器与结构层 z 序」）。这里断言的是**最终绘制次序**，不是某个具体数值。
 */
import { ICE, EventBus, paintOrderChildrenOf } from 'ice-render';
import BpmnDesigner from '../../src/bpmn/BpmnDesigner';
import StatechartDesigner from '../../src/statechart/StatechartDesigner';

function makeIce(): any {
  const ice: any = new ICE();
  ice.evtBus = new EventBus();
  ice.childNodes = [];
  ice.toolNodes = [];
  return ice;
}

/** 同一个父容器下，「a 是否排在 b 之前」（引擎的绘制次序口径：派生部件在前、真实子节点在后）。 */
function paintsBefore(parent: any, a: any, b: any): boolean {
  const order = paintOrderChildrenOf(parent);
  const ia = order.indexOf(a);
  const ib = order.indexOf(b);
  expect(ia).toBeGreaterThanOrEqual(0);
  expect(ib).toBeGreaterThanOrEqual(0);
  return ia < ib;
}

describe('容器的底画在内容之下（渲染顺序铁律）', () => {
  it('BPMN：池的底排在泳道之前、泳道的底排在节点之前', () => {
    const designer = new BpmnDesigner(makeIce());
    const pool = designer.createNode('bpmnPool', { title: '银行', left: 60, top: 60, width: 1300, height: 340 });
    const lane = designer.createNode('bpmnLane', { title: '受理岗', left: 60, top: 92, width: 1300, height: 150 });
    const task = designer.createNode('bpmnTask', { title: '身份核验', left: 400, top: 100 });

    // 嵌套关系成立（泳道在池里、任务在泳道里），下面的次序判断才有意义
    expect(lane.parentNode).toBe(pool);
    expect(task.parentNode).toBe(lane);

    expect(paintsBefore(pool, pool.shapeComponent, lane)).toBe(true);
    expect(paintsBefore(lane, lane.shapeComponent, task)).toBe(true);
  });

  it('状态机：复合状态的框排在子状态之前', () => {
    const designer = new StatechartDesigner(makeIce());
    const composite = designer.createState({
      kind: 'composite',
      title: '订单处理',
      left: 560,
      top: 300,
      width: 520,
      height: 280,
    });
    const child = designer.createState({ title: '库存校验', left: 620, top: 380, width: 160, height: 60 });

    expect(child.parentNode).toBe(composite);
    expect(paintsBefore(composite, composite.shapeComponent, child)).toBe(true);
  });

  it('BPMN XML 导入的池也在结构层带里（池节点不吃默认的 auto 层）', () => {
    const designer = new BpmnDesigner(makeIce());
    const pool = designer.createNode('bpmnPool', { title: '银行', left: 60, top: 60, width: 600, height: 300 });
    // 池节点自己必须低于业务图元（-30000 档），否则顶层排序里它会跑到连线/图元之上
    expect(typeof pool.state.zIndex).toBe('number');
    expect(pool.state.zIndex).toBeLessThan(0);
    // 底不靠应用钉 zIndex（引擎保证派生部件先画），保持默认即可
    expect(pool.shapeComponent.state.zIndex).toBe('auto');
  });
});
