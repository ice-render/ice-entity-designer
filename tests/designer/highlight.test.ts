/**
 * 程序化高亮（`FlowDesigner.setHighlights` / `highlight` / `clearHighlights`）。
 *
 * 这一条补的是《上游缺口清单》第 12 条：设计器原先没有任何"高亮某个图元"的公开入口，
 * 应用层只能自己给图元打 style 补丁 + 手动置脏来模拟 —— 既依赖组件内部实现
 * （`WaterSymbol.applyPatch` 走不走 `syncShape`），又要在图元改动时自己对表。
 *
 * 钉住的是四条契约（每一条漏掉都会产生"不报错但不对"的形态）：
 * ① 视觉真的出现（工具层多一块，且位置对着图元的全局包围盒）；
 * ② **视图状态**：不进快照 —— 否则"高亮一下"会污染文档、undo 里也会多一步；
 * ③ **不参与命中**：否则高亮框会挡住被高亮的图元自己（工具层整体画在组件层之上）；
 * ④ **自动跟随**：图元被拖动 / 删除后，框跟着走 / 跟着消失。
 */
import { ICE, EventBus } from 'ice-render';
import FlowDesigner from '../../src/flow/FlowDesigner';

function makeDesigner() {
  const ice: any = new ICE();
  ice.evtBus = new EventBus();
  ice.childNodes = [];
  ice.toolNodes = [];
  const designer = new FlowDesigner(ice);
  return { ice, designer };
}

/** 本层建的高亮框（工具层里还有引擎自己的对齐引导线等，只能认自己打的标记）。 */
function highlightBoxes(ice: any): any[] {
  return (ice.toolNodes || []).filter((node: any) => node && node.__iceDesignerHighlight);
}

describe('设计器程序化高亮', () => {
  it('高亮一个图元：工具层多一块，位置对着它的包围盒（含外扩）', () => {
    const { ice, designer } = makeDesigner();
    const node = designer.createNode('process', { left: 100, top: 100, width: 120, height: 60 });

    expect(designer.setHighlights([node.state.id], { padding: 4 })).toBe(1);
    const boxes = highlightBoxes(ice);
    expect(boxes).toHaveLength(1);

    const box = node.getMinBoundingBox(true).getMinAndMaxPoint();
    expect(boxes[0].state.left).toBeCloseTo(box.minX - 4, 5);
    expect(boxes[0].state.top).toBeCloseTo(box.minY - 4, 5);
    expect(boxes[0].state.width).toBeCloseTo(box.maxX - box.minX + 8, 5);
  });

  it('默认只描边不填充，且描边色取主题主色', () => {
    const { ice, designer } = makeDesigner();
    const node = designer.createNode('process', { left: 0, top: 0 });
    designer.setHighlights(node.state.id);
    const box = highlightBoxes(ice)[0];
    expect(box.state.fill).toBe(false);
    expect(box.state.style.strokeStyle).toBe(ice.getTheme().semantic.primary);
  });

  it('高亮是视图状态：不进快照', () => {
    const { designer } = makeDesigner();
    const node = designer.createNode('process', { left: 10, top: 10 });
    // 预热：`getMinBoundingBox()` 会让引擎把派生字段（合成矩阵）写进 state，
    // 而序列化会带上它们 —— 先算一次，避免把「派生字段」的差异误判成「高亮进了快照」。
    node.getMinBoundingBox(true);
    const before = designer.serialize();
    designer.setHighlights(node.state.id);
    expect(designer.serialize()).toBe(before);

    // 正面判据：快照里只有业务图元，没有高亮框（它是工具层的东西）
    const snapshot = JSON.parse(designer.serialize());
    expect(snapshot.scene.childNodes).toHaveLength(1);
    expect(snapshot.scene.childNodes[0].type).toBe('ice-entity-designer:FlowNode');
    expect(designer.serialize()).not.toContain('__iceDesignerHighlight');
  });

  it('高亮框不参与命中（interactive = false），不会挡住被高亮的图元', () => {
    const { ice, designer } = makeDesigner();
    const node = designer.createNode('process', { left: 100, top: 100, width: 120, height: 60 });
    designer.setHighlights(node.state.id);
    const box = highlightBoxes(ice)[0];
    expect(box.state.interactive).toBe(false);
    expect(box.state.draggable).toBe(false);
    expect(box.state.linkable).toBe(false);
  });

  it('认不出的 id 被忽略：不抛错、不清掉现有高亮', () => {
    const { ice, designer } = makeDesigner();
    const node = designer.createNode('process', { left: 0, top: 0 });
    designer.highlight(node.state.id);

    expect(designer.setHighlights(['不存在', node.state.id])).toBe(1);
    expect(designer.getHighlightedIds()).toEqual([node.state.id]);

    // highlight(不存在的 id) 返回 false，且**不动**已有的高亮
    expect(designer.highlight('也不存在')).toBe(false);
    expect(designer.getHighlightedIds()).toEqual([node.state.id]);
    expect(highlightBoxes(ice)).toHaveLength(1);
  });

  it('图元移动后高亮框自动跟随', async () => {
    const { ice, designer } = makeDesigner();
    const node = designer.createNode('process', { left: 100, top: 100, width: 120, height: 60 });
    designer.setHighlights(node.state.id);
    const box = highlightBoxes(ice)[0];
    const before = box.state.left;

    node.setPosition(400, 300);
    // AFTER_MOVE → __emitChange 是按帧合并的（rAF / 16ms 兜底），等一拍
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(node.state.left).toBe(400);
    expect(box.state.left).not.toBe(before);
    // 默认外扩 4：框比图元四周各大 4
    expect(box.state.left).toBeCloseTo(400 - 4, 3);
  });

  it('被高亮的图元删掉之后，它那块框也消失', () => {
    const { ice, designer } = makeDesigner();
    const a = designer.createNode('process', { left: 0, top: 0 });
    designer.setHighlights([a.state.id]);
    expect(highlightBoxes(ice)).toHaveLength(1);

    designer.remove(a.state.id);
    expect(highlightBoxes(ice)).toHaveLength(0);
    expect(designer.getHighlightedIds()).toEqual([]);
  });

  it('clearHighlights 把工具层恢复原样（不留空图层）', () => {
    const { ice, designer } = makeDesigner();
    const baseline = (ice.toolNodes || []).length;
    const node = designer.createNode('process', { left: 0, top: 0 });
    designer.setHighlights([node.state.id]);
    expect((ice.toolNodes || []).length).toBe(baseline + 1);

    designer.clearHighlights();
    expect((ice.toolNodes || []).length).toBe(baseline);
    expect(designer.getHighlightedIds()).toEqual([]);
  });
});
