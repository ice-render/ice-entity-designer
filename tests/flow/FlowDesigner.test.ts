/**
 * 流程图应用层（FlowNode / FlowEdge / FlowDesigner）。
 *
 * 与 tests/designer/EntityDesigner.test.ts 同一套约定：用真实引擎、不 mock，
 * 断言结构 / 标识 / 快照等确定性行为，不断言像素。
 */
import { ICE, EventBus, ICECircle } from 'ice-render';
import FlowDesigner, { validateFlowSnapshot } from '../../src/flow/FlowDesigner';
import FlowNode, { FLOW_NODE_KINDS } from '../../src/flow/FlowNode';
import FlowEdge from '../../src/flow/FlowEdge';
import { FlowDiamond, FlowParallelogram } from '../../src/flow/flow_shapes';

function makeDesigner() {
  const ice: any = new ICE();
  ice.evtBus = new EventBus();
  ice.childNodes = [];
  ice.toolNodes = [];
  const designer = new FlowDesigner(ice);
  return { ice, designer };
}

function titles(designer: any): string[] {
  return designer.nodes.map((node: any) => node.state.title);
}

/**
 * 从 v2 文档里取出节点 state：`{ version:2, kind:'flowchart', scene:{ version, childNodes:[{type,state,childNodes}] } }`
 * （v2 直接复用引擎的序列化产物，所以取的是 `state`，不再是应用层自造的字段清单）
 */
function sceneNodes(json: string): any[] {
  return JSON.parse(json).scene.childNodes;
}

describe('FlowDesigner 构造与类型注册', () => {
  it('注册 FlowNode / FlowEdge 并订阅 mousedown', () => {
    const { ice, designer } = makeDesigner();
    expect(ice.getTypeId(FlowNode)).toBe('FlowNode');
    expect(ice.getTypeId(FlowEdge)).toBe('FlowEdge');
    expect((ice.evtBus.listeners['mousedown'] || []).length).toBe(1);
    expect(designer.nodes).toEqual([]);
    expect(designer.edges).toEqual([]);
  });

  it('nodes / edges 只统计对应类型（忽略其它图元）', () => {
    const { ice, designer } = makeDesigner();
    const node = designer.createNode('process', { title: 'A' });
    ice.addChild(new ICECircle({ width: 10, height: 10 }));
    expect(designer.nodes).toEqual([node]);
    expect(designer.edges).toEqual([]);
  });
});

describe('FlowDesigner 节点', () => {
  it('四类节点的预设尺寸与形状子组件', () => {
    const { designer } = makeDesigner();
    const terminator = designer.createNode('terminator');
    const process = designer.createNode('process');
    const decision = designer.createNode('decision');
    const io = designer.createNode('io');

    expect([terminator.state.width, terminator.state.height]).toEqual([
      FLOW_NODE_KINDS.terminator.width,
      FLOW_NODE_KINDS.terminator.height,
    ]);
    expect(decision.childNodes[0]).toBeInstanceOf(FlowDiamond);
    expect(io.childNodes[0]).toBeInstanceOf(FlowParallelogram);
    expect(process.childNodes[0].constructor.typeId).toBeUndefined(); // ICERect 是引擎内置类型
    expect(decision.childNodes.length).toBe(2); // 形状 + 标题
  });

  it('未指定坐标时自动错开摆放，不互相重叠', () => {
    const { designer } = makeDesigner();
    const first = designer.createNode('process');
    const second = designer.createNode('process');
    const firstBox = first.getMinBoundingBox(true);
    const secondBox = second.getMinBoundingBox(true);
    const overlap =
      secondBox.tl[0] < firstBox.br[0] &&
      secondBox.br[0] > firstBox.tl[0] &&
      secondBox.tl[1] < firstBox.br[1] &&
      secondBox.br[1] > firstBox.tl[1];
    expect(overlap).toBe(false);
  });

  it('显式坐标 / 标题 / 配色生效，且会自动选中并广播', () => {
    const { designer } = makeDesigner();
    const seen: string[] = [];
    designer.subscribe((snapshot: string) => seen.push(snapshot));
    const node = designer.createNode('decision', { title: '库存充足？', left: 400, top: 260, fillColor: '#fee2e2' });
    expect([node.state.left, node.state.top]).toEqual([400, 260]);
    expect(node.state.fillColor).toBe('#fee2e2');
    expect(designer.selectedId).toBe(node.state.id);
    expect(seen.length).toBe(1);
    expect(sceneNodes(seen[0])[0].state.title).toBe('库存充足？');
  });

  it('updateNode 改标题不重建形状，改类型/尺寸会重建形状', () => {
    const { designer } = makeDesigner();
    const node = designer.createNode('process', { title: 'A' });
    const shapeBefore = node.childNodes[0];
    designer.updateNode(node.state.id, { title: 'B' });
    expect(node.childNodes[0]).toBe(shapeBefore);
    expect(node.childNodes[1].state.text).toBe('B');

    designer.updateNode(node.state.id, { kind: 'decision', width: 200, height: 120 });
    expect(node.childNodes[0]).toBeInstanceOf(FlowDiamond);
  });
});

describe('FlowDesigner 连线', () => {
  it('连线端点来自两端节点的插槽坐标', () => {
    const { designer } = makeDesigner();
    const a = designer.createNode('terminator', { left: 100, top: 100 });
    const b = designer.createNode('process', { left: 400, top: 400 });
    const edge = designer.createEdge({
      sourceId: a.state.id,
      targetId: b.state.id,
      sourcePort: 'B',
      targetPort: 'T',
      label: '是',
    });
    expect(edge.state.links.start.id).toBe(a.state.id);
    expect(edge.state.links.end.id).toBe(b.state.id);
    // B 端口 = 源盒下边中点；T 端口 = 目标盒上边中点
    expect(edge.state.startPoint[0]).toBeCloseTo(a.getMinBoundingBox(true).bc[0], 3);
    expect(edge.state.startPoint[1]).toBeCloseTo(a.getMinBoundingBox(true).bc[1], 3);
    expect(edge.state.endPoint[1]).toBeCloseTo(b.getMinBoundingBox(true).tc[1], 3);
    expect(edge.state.label).toBe('是');
  });

  it('端点缺失时抛错，不产生悬空连线', () => {
    const { designer } = makeDesigner();
    const a = designer.createNode('process');
    expect(() => designer.createEdge({ sourceId: a.state.id })).toThrow('连接两端必须是已存在的节点');
    expect(designer.edges.length).toBe(0);
  });

  it('删除节点会级联删除挂在其两端的连线', () => {
    const { designer } = makeDesigner();
    const a = designer.createNode('process');
    const b = designer.createNode('process');
    const c = designer.createNode('process');
    designer.createEdge({ sourceId: a.state.id, targetId: b.state.id });
    designer.createEdge({ sourceId: b.state.id, targetId: c.state.id });
    expect(designer.edges.length).toBe(2);
    designer.remove(b.state.id);
    expect(designer.nodes.length).toBe(2);
    expect(designer.edges.length).toBe(0);
  });
});

describe('FlowDesigner 快照', () => {
  it('serialize / load round-trip 稳定', () => {
    const { designer } = makeDesigner();
    const a = designer.createNode('terminator', { title: '开始', left: 100, top: 80 });
    const b = designer.createNode('decision', { title: '通过？', left: 100, top: 260 });
    designer.createEdge({ sourceId: a.state.id, targetId: b.state.id, label: '是' });

    const first = designer.serialize();
    expect(JSON.parse(first)).toMatchObject({ version: 2, kind: 'flowchart' });
    // v2 用引擎的序列化产物当 payload：节点类型由引擎的 typeId 分派
    expect(sceneNodes(first).map((item: any) => item.type)).toContain('FlowNode');
    expect(validateFlowSnapshot(JSON.parse(first))).toEqual({ valid: true, errors: [] });

    designer.load(first);
    const second = designer.serialize();
    designer.load(second);
    expect(designer.serialize()).toBe(second);
    expect(titles(designer)).toEqual(['开始', '通过？']);
    expect(designer.edges.length).toBe(1);
  });

  it('非法快照抛错，且不改动当前流程与历史栈', () => {
    const { designer } = makeDesigner();
    designer.createNode('process', { title: '保留' });
    const undoBefore = (designer as any).__undoStack.length;

    expect(() => designer.load(JSON.stringify({ version: 1, nodes: [{ id: 1 }] }))).toThrow(/Invalid flow snapshot/);
    expect(titles(designer)).toEqual(['保留']);
    expect((designer as any).__undoStack.length).toBe(undoBefore);

    // 非流程图快照：静默忽略（与 IED 的项目快照同一约定）
    expect(designer.load('{"nope":true}')).toMatchObject({ loaded: false });
    expect(titles(designer)).toEqual(['保留']);
  });

  it('typeId 不匹配的节点/连线被跳过并记入报告', () => {
    const { designer } = makeDesigner();
    const report = designer.load(
      JSON.stringify({
        version: 1,
        kind: 'flowchart',
        nodes: [
          { id: 'n1', typeId: 'FlowNode', kind: 'process', title: 'A', left: 0, top: 0, width: 220, height: 80 },
          { id: 'x1', typeId: 'Entity', title: 'Alien' },
        ],
        edges: [{ id: 'e1', typeId: 'Relation', sourceId: 'n1', targetId: 'n1' }],
      })
    );
    expect(report).toMatchObject({ loaded: true, nodes: 1, edges: 0 });
    expect(report.skipped).toEqual(['Entity', 'Relation']);
  });

  it('节点文字颜色 / 字号可改，并随快照往返（回归：此前是写死的）', () => {
    const { designer } = makeDesigner();
    const node = designer.createNode('process', { title: 'A', textColor: '#b91c1c', fontSize: 18 });
    expect(node.childNodes[1].state.style.fillStyle).toBe('#b91c1c');
    expect(node.childNodes[1].state.style.fontSize).toBe(18);

    const first = designer.serialize();
    expect(sceneNodes(first)[0].state).toMatchObject({ textColor: '#b91c1c', fontSize: 18 });

    designer.load(first);
    const loaded = designer.nodes[0];
    expect(loaded.state.textColor).toBe('#b91c1c');
    expect(loaded.state.fontSize).toBe(18);
    expect(loaded.childNodes[1].state.style.fillStyle).toBe('#b91c1c');
    expect(designer.serialize()).toBe(first);
  });

  it('连线线色 / 线宽 / 标签颜色随快照往返（回归：style / labelStyle 此前未进快照）', () => {
    const { designer } = makeDesigner();
    const a = designer.createNode('process', { left: 0, top: 0 });
    const b = designer.createNode('process', { left: 0, top: 300 });
    designer.createEdge({ sourceId: a.state.id, targetId: b.state.id, label: '是' });
    designer.updateEdge(designer.edges[0].state.id, {
      style: { strokeStyle: '#0284c7', lineWidth: 3 },
      labelStyle: { fillStyle: '#b91c1c' },
    });

    const first = designer.serialize();
    const firstEdge = sceneNodes(first).find((item: any) => item.type === 'FlowEdge');
    expect(firstEdge.state.style.strokeStyle).toBe('#0284c7');
    expect(firstEdge.state.labelStyle.fillStyle).toBe('#b91c1c');

    designer.load(first);
    expect(designer.edges[0].state.style.strokeStyle).toBe('#0284c7');
    expect(designer.edges[0].state.style.lineWidth).toBe(3);
    expect(designer.edges[0].state.labelStyle.fillStyle).toBe('#b91c1c');
    expect(designer.serialize()).toBe(first);
  });

  it('文档即引擎 payload：自定义 data 与任何新增 state 字段自动往返，无需登记', () => {
    const { designer } = makeDesigner();
    const node = designer.createNode('process', {
      title: 'A',
      data: { kind: 'aggregate', tags: ['flow', 1], owner: { team: 'data' } },
      customField: '随便挂',
    });
    node.setState({ anotherNewField: { deep: true } });

    const json = designer.serialize();
    const item = sceneNodes(json)[0];
    // 1) 文档里直接可见（不需要任何字段清单）
    expect(item.state.data).toEqual({ kind: 'aggregate', tags: ['flow', 1], owner: { team: 'data' } });
    expect(item.state.customField).toBe('随便挂');
    expect(item.state.anotherNewField).toEqual({ deep: true });
    // 2) FlowNode 的内部形状/标题是派生组件，不写进文档（否则往返会重复挂载）
    expect(item.childNodes).toEqual([]);

    // 3) 往返后逐键回来，且文档字节稳定
    designer.load(json);
    const restored = designer.nodes[0];
    expect(restored.state.data).toEqual({ kind: 'aggregate', tags: ['flow', 1], owner: { team: 'data' } });
    expect(restored.state.customField).toBe('随便挂');
    expect(restored.state.anotherNewField).toEqual({ deep: true });
    expect(designer.serialize()).toBe(json);
  });

  it('兼容读取 v1（nodes/edges 数组）历史文档，再导出即为 v2', () => {
    const { designer } = makeDesigner();
    const legacy = JSON.stringify({
      version: 1,
      kind: 'flowchart',
      nodes: [
        { id: 'n1', typeId: 'FlowNode', kind: 'decision', title: '旧格式', left: 10, top: 20, width: 200, height: 120 },
      ],
      edges: [],
    });
    const report = designer.load(legacy);
    expect(report).toMatchObject({ loaded: true, nodes: 1, edges: 0 });
    expect(designer.nodes[0].state.title).toBe('旧格式');
    expect(designer.nodes[0].state.kind).toBe('decision');
    // 迁移是单向的：读旧写新
    expect(JSON.parse(designer.serialize()).version).toBe(2);
  });
});

describe('FlowDesigner 历史与视图', () => {
  it('undo / redo 栈行为正确，且回放失败不会永久关闭历史', () => {
    const { designer } = makeDesigner();
    designer.createNode('process', { title: 'A' });
    designer.createNode('process', { title: 'B' });
    expect(titles(designer)).toEqual(['A', 'B']);

    designer.undo();
    expect(titles(designer)).toEqual(['A']);
    expect(designer.canRedo()).toBe(true);

    designer.redo();
    expect(titles(designer)).toEqual(['A', 'B']);

    const undoBefore = (designer as any).__undoStack.length;
    (designer as any).__applySnapshot = () => {
      throw new Error('boom');
    };
    expect(() => designer.undo()).toThrow('boom');
    expect((designer as any).__historyEnabled).toBe(true);
    expect((designer as any).__undoStack.length).toBe(undoBefore);
    // 回放失败时 redo 栈也要回滚，不能留下错位
    expect(designer.canRedo()).toBe(false);
  });

  it('fitViewport 把内容缩放进画布', () => {
    const { ice, designer } = makeDesigner();
    ice.canvasWidth = 1000;
    ice.canvasHeight = 800;
    designer.createNode('process', { left: 0, top: 0 });
    designer.createNode('process', { left: 1200, top: 900 });
    designer.fitViewport(50);
    const viewport = ice.viewport;
    expect(viewport.scale).toBeGreaterThan(0);
    expect(viewport.scale).toBeLessThanOrEqual(1.25);
  });

  it('画布侧拖动节点（引擎 setPosition）会被感知：广播变更且可撤销', async () => {
    const { designer } = makeDesigner();
    const node = designer.createNode('process', { left: 100, top: 100 });
    designer.resetHistory();

    const snapshots: any[] = [];
    designer.subscribe((snapshot: string) => snapshots.push(JSON.parse(snapshot)));

    node.setPosition(300, 260);
    expect(node.state.left).toBe(300);
    // AFTER_MOVE 的广播按帧合并，等一拍
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(snapshots.length).toBeGreaterThan(0);
    expect(sceneNodes(JSON.stringify(snapshots[snapshots.length - 1]))[0].state).toMatchObject({ left: 300, top: 260 });
    // 拖拽前记了一步历史（BEFORE_MOVE 先于 setState）
    expect(designer.canUndo()).toBe(true);
    designer.undo();
    expect(designer.nodes[0].state.left).toBe(100);
    expect(designer.nodes[0].state.top).toBe(100);
  });

  it('一次拖拽会话只记一步历史（连续移动不刷屏）', async () => {
    const { designer } = makeDesigner();
    const node = designer.createNode('process', { left: 100, top: 100 });
    designer.resetHistory();

    for (let i = 1; i <= 10; i++) {
      node.setPosition(100 + i * 10, 100 + i * 5);
    }
    expect((designer as any).__undoStack.length).toBe(1);

    // 松开鼠标（引擎在 evtBus 上派发 mouseup）后，下一次拖拽重新记一步
    (designer as any).__endMoveSession();
    node.setPosition(500, 500);
    expect((designer as any).__undoStack.length).toBe(2);
  });
});
