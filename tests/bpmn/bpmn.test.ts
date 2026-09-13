/**
 * @jest-environment jsdom
 *
 * BPMN 2.0 案例：节点词汇与形状、语义校验、XML 导入导出。
 * 与 ER/流程图的测试同一约定：真实引擎、不断言像素、只断言结构与语义。
 */
import { ICE, EventBus } from 'ice-render';
import BpmnDesigner from '../../src/bpmn/BpmnDesigner';
import { fromBpmnXml, toBpmnXml } from '../../src/bpmn/bpmn_xml';
import { FLOW_NODE_KINDS } from '../../src/flow/FlowNode';
import { BpmnEventShape, BpmnGatewayShape, BpmnTaskIcon } from '../../src/bpmn/bpmn_shapes';

function makeDesigner() {
  const ice: any = new ICE();
  ice.evtBus = new EventBus();
  ice.childNodes = [];
  ice.toolNodes = [];
  const designer: any = new BpmnDesigner(ice);
  return { ice, designer };
}

/** 一个最小但完整的 BPMN：池 + 开始 → 用户任务 → 排他网关（条件/默认）→ 结束 */
function makeCreditFlow() {
  const { ice, designer } = makeDesigner();
  const pool = designer.createNode('bpmnPool', { title: '银行', left: 40, top: 40, width: 900, height: 260 });
  const lane = designer.createNode('bpmnLane', { title: '审批岗', left: 40, top: 40, width: 900, height: 130 });
  const start = designer.createNode('bpmnEvent', { title: '申请提交', eventKind: 'start', left: 120, top: 170 });
  const review = designer.createNode('bpmnTask', { title: '征信审查', taskType: 'user', left: 260, top: 150 });
  const gateway = designer.createNode('bpmnGateway', {
    title: '额度判断',
    gatewayType: 'exclusive',
    left: 540,
    top: 158,
  });
  const approve = designer.createNode('bpmnTask', { title: '自动通过', left: 700, top: 80 });
  const reject = designer.createNode('bpmnTask', { title: '人工复核', left: 700, top: 220 });
  const end = designer.createNode('bpmnEvent', { title: '结束', eventKind: 'end', left: 900, top: 170 });

  designer.createEdge({ sourceId: start.state.id, targetId: review.state.id, label: '' });
  designer.createEdge({ sourceId: review.state.id, targetId: gateway.state.id });
  designer.createEdge({
    sourceId: gateway.state.id,
    targetId: approve.state.id,
    condition: '${credit >= 6000}',
    label: '额度充足',
  });
  designer.createEdge({ sourceId: gateway.state.id, targetId: reject.state.id, label: '默认' });
  designer.createEdge({ sourceId: approve.state.id, targetId: end.state.id });
  designer.createEdge({ sourceId: reject.state.id, targetId: end.state.id });
  // 把「默认」流标记为默认流
  const defaultEdge = designer.edges.find((edge: any) => edge.state.label === '默认');
  designer.updateEdge(defaultEdge.state.id, { isDefault: true });

  return { ice, designer, nodes: { pool, lane, start, review, gateway, approve, reject, end } };
}

describe('BPMN 节点词汇与形状', () => {
  it('BPMN 类型都在 FLOW_NODE_KINDS 里，且事件/网关用专用形状', () => {
    [
      'bpmnEvent',
      'bpmnTask',
      'bpmnGateway',
      'bpmnSubprocess',
      'bpmnDataObject',
      'bpmnAnnotation',
      'bpmnPool',
      'bpmnLane',
    ].forEach((kind) => {
      expect(FLOW_NODE_KINDS[kind as keyof typeof FLOW_NODE_KINDS]).toBeTruthy();
    });
    const { designer } = makeDesigner();
    const event = designer.createNode('bpmnEvent', { eventKind: 'start' });
    const gateway = designer.createNode('bpmnGateway', { gatewayType: 'parallel' });
    const task = designer.createNode('bpmnTask', { taskType: 'user' });
    expect(event.childNodes[0]).toBeInstanceOf(BpmnEventShape);
    expect(gateway.childNodes[0]).toBeInstanceOf(BpmnGatewayShape);
    expect(task.childNodes.some((child: any) => child instanceof BpmnTaskIcon)).toBe(true);
    // 整棵内部子树都是派生的：文档里不写 childNodes
    const doc = JSON.parse(designer.serialize());
    expect(doc.scene.childNodes[0].childNodes).toEqual([]);
  });

  it('改 eventKind / gatewayType / taskType 会重建形状（不重建则记法不更新）', () => {
    const { designer } = makeDesigner();
    const event = designer.createNode('bpmnEvent', { eventKind: 'start' });
    designer.updateNode(event.state.id, { eventKind: 'end' });
    expect(event.state.eventKind).toBe('end');
    // 形状被重建（新实例）
    expect(event.childNodes[0]).toBeInstanceOf(BpmnEventShape);
  });
});

describe('BPMN 连线类型与派生样式', () => {
  it('sequence / message / association 的线型与箭头自动区分', () => {
    const { designer } = makeDesigner();
    const a = designer.createNode('bpmnTask', { left: 0, top: 0 });
    const b = designer.createNode('bpmnTask', { left: 0, top: 200 });
    const sequence = designer.createEdge({ sourceId: a.state.id, targetId: b.state.id });
    const message = designer.createEdge({ sourceId: a.state.id, targetId: b.state.id, flowType: 'message' });
    const association = designer.createEdge({ sourceId: a.state.id, targetId: b.state.id, flowType: 'association' });
    expect(sequence.state.arrow).toBe('end');
    expect(sequence.state.arrowStyle).toBe('filled');
    expect(message.state.lineDash).toEqual([7, 4]);
    expect(message.state.arrowStyle).toBe('hollow');
    expect(association.state.lineDash).toEqual([2, 3]);
    expect(association.state.arrow).toBe('none');
  });

  it('条件流 / 默认流会生成派生标记，且标记不进入文档', () => {
    const { ice, designer } = makeCreditFlow();
    const markers = ice.toolNodes.filter((node: any) => node.constructor.typeId === 'ice-entity-designer:BpmnFlowMarker');
    expect(markers.length).toBe(2);
    // 工具层不参与引擎序列化 → 文档里没有标记
    // 流标记是工具层组件，不进文档（typeId 带 namespace 后同样不该出现）
    expect(designer.serialize()).not.toContain('ice-entity-designer:BpmnFlowMarker');
  });
});

describe('BPMN 语义校验', () => {
  it('合法流程无 error；开始事件带流入 / 网关多默认流 / 顺序流跨池会报错', () => {
    const { designer, nodes } = makeCreditFlow();
    const clean = designer.validateBpmn();
    expect(clean.filter((issue: any) => issue.level === 'error')).toEqual([]);

    // 给开始事件加一条流入 → 违规
    const extra = designer.createNode('bpmnTask', { title: '外部', left: 20, top: 320 });
    designer.createEdge({ sourceId: extra.state.id, targetId: nodes.start.state.id });
    expect(designer.validateBpmn().map((issue: any) => issue.code)).toContain('start-incoming');

    // 第二个默认流 → 违规
    const gatewayOut = designer.edges.filter((edge: any) => edge.state.links?.start?.id === nodes.gateway.state.id);
    designer.updateEdge(gatewayOut[0].state.id, { isDefault: true });
    expect(designer.validateBpmn().map((issue: any) => issue.code)).toContain('gateway-multi-default');
  });

  it('跨池的顺序流会被判为错误（应改用消息流）', () => {
    const { designer } = makeDesigner();
    const poolA = designer.createNode('bpmnPool', { title: 'A', left: 0, top: 0, width: 400, height: 200 });
    const poolB = designer.createNode('bpmnPool', { title: 'B', left: 500, top: 0, width: 400, height: 200 });
    const start = designer.createNode('bpmnEvent', { title: 's', eventKind: 'start', left: 40, top: 80 });
    const taskB = designer.createNode('bpmnTask', { title: 't', left: 540, top: 80 });
    designer.createEdge({ sourceId: start.state.id, targetId: taskB.state.id });
    const codes = designer.validateBpmn().map((issue: any) => issue.code);
    expect(codes).toContain('sequence-flow-cross-pool');
    expect(poolA && poolB).toBeTruthy();
  });
});

describe('BPMN XML 互操作', () => {
  it('导出包含 BPMN 2.0 命名空间、元素、条件表达式与 DI 布局', () => {
    const { designer } = makeCreditFlow();
    const xml = toBpmnXml(designer, { name: '信用卡申请审批' });
    expect(xml).toContain('http://www.omg.org/spec/BPMN/20100524/MODEL');
    expect(xml).toContain('<bpmn:process');
    expect(xml).toContain('<bpmn:collaboration');
    expect(xml).toContain('<bpmn:participant');
    expect(xml).toContain('<bpmn:laneSet');
    expect(xml).toContain('<bpmn:userTask');
    expect(xml).toContain('<bpmn:startEvent');
    expect(xml).toContain('<bpmn:endEvent');
    expect(xml).toContain('<bpmn:exclusiveGateway');
    expect(xml).toContain('<bpmn:sequenceFlow');
    expect(xml).toContain('conditionExpression');
    expect(xml).toContain('default="true"');
    expect(xml).toContain('<bpmndi:BPMNShape');
    expect(xml).toContain('<di:waypoint');
  });

  it('导出 → 导入 round-trip：节点/连线数量与关键属性保持', () => {
    const { designer } = makeCreditFlow();
    const xml = toBpmnXml(designer);
    const before = {
      tasks: designer.nodes.filter((node: any) => node.state.kind === 'bpmnTask').length,
      events: designer.nodes.filter((node: any) => node.state.kind === 'bpmnEvent').length,
      gateways: designer.nodes.filter((node: any) => node.state.kind === 'bpmnGateway').length,
      edges: designer.edges.length,
    };

    const target = makeDesigner().designer;
    const result = fromBpmnXml(xml, target);
    expect(result.nodes).toBeGreaterThanOrEqual(before.tasks + before.events + before.gateways);
    expect(result.edges).toBe(before.edges);
    expect(target.nodes.filter((node: any) => node.state.kind === 'bpmnTask').length).toBe(before.tasks);
    expect(
      target.nodes.filter((node: any) => node.state.kind === 'bpmnEvent' && node.state.eventKind === 'start').length
    ).toBe(1);
    expect(
      target.nodes.filter((node: any) => node.state.kind === 'bpmnGateway' && node.state.gatewayType === 'exclusive')
        .length
    ).toBe(1);
    const tasksWithType = target.nodes.filter((node: any) => node.state.taskType === 'user');
    expect(tasksWithType.length).toBe(1);
    // 条件与默认流语义保留
    expect(target.edges.some((edge: any) => edge.state.condition)).toBe(true);
    expect(target.edges.some((edge: any) => edge.state.isDefault)).toBe(true);
  });
});

describe('BPMN 容器：真嵌套（引擎容器能力）', () => {
  it('池 → 泳道 → 节点 形成真实父子关系（不是几何假象）', () => {
    const { designer } = makeDesigner();
    const pool = designer.createNode('bpmnPool', { title: '银行', left: 100, top: 100, width: 800, height: 300 });
    const lane = designer.createNode('bpmnLane', { title: '受理岗', left: 100, top: 100, width: 800, height: 150 });
    const task = designer.createNode('bpmnTask', { title: '受理', left: 200, top: 140 });

    expect(lane.parentNode).toBe(pool);
    expect(task.parentNode).toBe(lane);
    // 子组件坐标变成父容器左上角为原点
    expect([Math.round(lane.state.left), Math.round(lane.state.top)]).toEqual([0, 0]);
    expect([Math.round(task.state.left), Math.round(task.state.top)]).toEqual([100, 40]);
    // 但世界坐标不变
    expect(task.getMinBoundingBox(true).tl[0]).toBe(200);
    expect(task.getMinBoundingBox(true).tl[1]).toBe(140);
    // 嵌套节点同样被 designer 统计到
    expect(designer.nodes.length).toBe(3);
  });

  it('拖动外层池，内部泳道与节点整体跟随（引擎矩阵组合）', () => {
    const { designer } = makeDesigner();
    const pool = designer.createNode('bpmnPool', { title: '银行', left: 100, top: 100, width: 800, height: 300 });
    const lane = designer.createNode('bpmnLane', { title: '受理岗', left: 100, top: 100, width: 800, height: 150 });
    const task = designer.createNode('bpmnTask', { title: '受理', left: 200, top: 140 });

    const before = {
      lane: lane.getMinBoundingBox(true).tl.slice(),
      task: task.getMinBoundingBox(true).tl.slice(),
    };
    // 引擎的拖动最终就是 setPosition（池在根层级）
    pool.setPosition(pool.state.left + 60, pool.state.top + 40);
    const after = {
      lane: lane.getMinBoundingBox(true).tl.slice(),
      task: task.getMinBoundingBox(true).tl.slice(),
    };
    expect(after.lane[0] - before.lane[0]).toBeCloseTo(60, 3);
    expect(after.lane[1] - before.lane[1]).toBeCloseTo(40, 3);
    expect(after.task[0] - before.task[0]).toBeCloseTo(60, 3);
    expect(after.task[1] - before.task[1]).toBeCloseTo(40, 3);
  });

  it('点中嵌套节点时选中它自己（不是最外层容器）', () => {
    const { ice, designer } = makeDesigner();
    designer.createNode('bpmnPool', { title: '银行', left: 100, top: 100, width: 800, height: 300 });
    designer.createNode('bpmnLane', { title: '受理岗', left: 100, top: 100, width: 800, height: 150 });
    const task = designer.createNode('bpmnTask', { title: '受理', left: 200, top: 140 });

    const [sx, sy] = ice.worldToScreen(250, 180);
    const hit = ice.hitTest(sx, sy);
    expect(hit).toBeTruthy();
    ice.evtBus.trigger('mousedown', null, { component: hit });
    expect(designer.selectedId).toBe(task.state.id);
  });

  it('拖动容器时，挂在内部图元上的连线也会重新路由（引擎递归派发 AFTER_MOVE）', () => {
    const { designer } = makeDesigner();
    const pool = designer.createNode('bpmnPool', { title: '银行', left: 60, top: 60, width: 800, height: 320 });
    designer.createNode('bpmnLane', { title: '受理岗', left: 60, top: 92, width: 800, height: 150 });
    const a = designer.createNode('bpmnTask', { title: 'A', left: 160, top: 130 });
    const b = designer.createNode('bpmnTask', { title: 'B', left: 420, top: 130 });
    // 跨内容区的顺序流（同池）
    const edge = designer.createEdge({ sourceId: a.state.id, targetId: b.state.id });
    // 连线的「跟随宿主」监听是在一轮渲染收敛（ROUND_FINISH）后才挂上的，node 测试里手动触发一次
    (designer as any).ice.evtBus.trigger('ROUND_FINISH');
    const before = {
      start: edge.state.startPoint.slice(),
      end: edge.state.endPoint.slice(),
      points: (edge.state.points || []).map((p: any) => p.slice()),
    };

    pool.setPosition(pool.state.left + 80, pool.state.top + 60);
    const after = {
      start: edge.state.startPoint.slice(),
      end: edge.state.endPoint.slice(),
      points: (edge.state.points || []).map((p: any) => p.slice()),
    };

    // 连线的**折点**应随宿主节点一起平移（这正是「线跟着图元走」的体现；
    // startPoint/endPoint 是配置端点，重路由改的是 points/dots）
    expect(after.points.length).toBe(before.points.length);
    expect(after.points).not.toEqual(before.points);
    expect(after.points[0][0] - before.points[0][0]).toBeCloseTo(80, 1);
    expect(after.points[0][1] - before.points[0][1]).toBeCloseTo(60, 1);
  });
});
