/**
 * BPMN 令牌仿真（token simulation）规格测试。
 *
 * 目标：把「流程怎么走」演示出来 —— 令牌沿顺序流移动、在任务上停留、在网关分叉/汇聚，
 * 到达结束事件后消失。设计约束（都是引擎既有机制的复用）：
 * - 令牌是**工具层组件**（`ice.toolNodes`）：不写进文档、不影响快照与导出；
 * - 推进是显式的 `step(dt)`，浏览器里由帧循环驱动、测试里手动推进（可断言、不靠时序）；
 * - 走线复用连线的实际折点（`points`），所以令牌始终贴在画出来的线上。
 */
import { ICE, EventBus } from 'ice-render';
import BpmnDesigner from '../../src/bpmn/BpmnDesigner';
import BpmnSimulator from '../../src/bpmn/BpmnSimulator';

function makeDesigner() {
  const ice: any = new ICE();
  ice.evtBus = new EventBus();
  ice.childNodes = [];
  ice.toolNodes = [];
  const designer = new BpmnDesigner(ice);
  return { ice, designer };
}

/** 建一个最简流程：开始 → 任务 → 结束 */
function simpleFlow(designer: any) {
  const start = designer.createNode('bpmnEvent', { title: '开始', eventKind: 'start', left: 80, top: 80 });
  const task = designer.createNode('bpmnTask', { title: '审批', left: 300, top: 60 });
  const end = designer.createNode('bpmnEvent', { title: '结束', eventKind: 'end', left: 560, top: 80 });
  designer.createEdge({ sourceId: start.state.id, targetId: task.state.id });
  designer.createEdge({ sourceId: task.state.id, targetId: end.state.id });
  return { start, task, end };
}

/** 推进直到条件成立（或步数用尽）—— 不用固定步数，避免时序假设写进断言 */
function runUntil(simulator: any, predicate: () => boolean, stepMs = 50, maxSteps = 400) {
  for (let i = 0; i < maxSteps && !predicate(); i++) {
    simulator.step(stepMs);
  }
  return simulator;
}

/** 推进到「没有令牌在移动」为止（最多若干步，避免死循环） */
function runUntilIdle(simulator: any, stepMs = 50, maxSteps = 400) {
  for (let i = 0; i < maxSteps && !simulator.isFinished(); i++) {
    simulator.step(stepMs);
  }
  return simulator;
}

describe('BPMN 令牌仿真 · 基本推进', () => {
  it('启动后每个开始事件有一个令牌，令牌落在工具层（不进文档）', () => {
    const { ice, designer } = makeDesigner();
    const { start } = simpleFlow(designer);
    const simulator = new BpmnSimulator(designer);

    simulator.start();
    const tokens = simulator.getTokens();
    expect(tokens.length).toBe(1);
    expect(tokens[0].nodeId).toBe(start.state.id);
    // 令牌是工具层组件：文档里看不到它，快照也不受影响
    expect(ice.toolNodes.length).toBeGreaterThan(0);
    // 令牌是工具层组件，不进文档（typeId 带 namespace 后同样不该出现）
    expect(designer.serialize()).not.toContain('ice-entity-designer:SimToken');
  });

  it('令牌沿顺序流推进到下一个节点（位置单调前进）', () => {
    const { designer } = makeDesigner();
    const { task } = simpleFlow(designer);
    const simulator = new BpmnSimulator(designer);
    simulator.start();

    // 第一段：开始 → 任务；记录令牌位置，确保是「往任务方向」走
    const positions: number[] = [];
    runUntil(
      simulator,
      () => simulator.getTokens()[0].nodeId === task.state.id && !simulator.getTokens()[0].edgeId,
      40,
      200
    );
    for (let i = 0; i < 12; i++) {
      simulator.step(40);
      if (simulator.getTokens()[0].edgeId) {
        positions.push(simulator.getTokens()[0].position[0]);
      }
    }
    expect(positions.length).toBeGreaterThan(2);
    // 全程只有一条令牌（回归：曾经每步都被重复入账）
    expect(simulator.getTokens().length).toBe(1);
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThanOrEqual(positions[i - 1] - 0.001);
    }
    expect(simulator.getTokens()[0].nodeId).toBe(task.state.id);
  });

  it('任务上会停留（不会立刻离开），停留结束后才继续', () => {
    const { designer } = makeDesigner();
    const { task, end } = simpleFlow(designer);
    const simulator = new BpmnSimulator(designer);
    simulator.setNodeDuration(task.state.id, 200);
    simulator.start();

    // 推进到任务
    runUntil(
      simulator,
      () => simulator.getTokens()[0].nodeId === task.state.id && !simulator.getTokens()[0].edgeId,
      20,
      400
    );
    expect(simulator.getTokens()[0].nodeId).toBe(task.state.id);
    // 停留期内还在任务上
    simulator.step(100);
    expect(simulator.getTokens()[0].nodeId).toBe(task.state.id);
    // 停留结束后离开：标志是「挂上了出口连线」（在连线上行进时 nodeId 仍是出发节点）
    simulator.step(200);
    expect(simulator.getTokens()[0].edgeId).toBeTruthy();

    runUntilIdle(simulator);
    expect(simulator.isFinished()).toBe(true);
    expect(end.state.id).toBeTruthy();
  });
});

describe('BPMN 令牌仿真 · 网关', () => {
  it('排他网关只走一条分支（优先非默认流）', () => {
    const { designer } = makeDesigner();
    const start = designer.createNode('bpmnEvent', { title: '开始', eventKind: 'start', left: 60, top: 120 });
    const gateway = designer.createNode('bpmnGateway', {
      title: '通过？',
      gatewayType: 'exclusive',
      left: 260,
      top: 120,
    });
    const approve = designer.createNode('bpmnTask', { title: '发卡', left: 480, top: 40 });
    const reject = designer.createNode('bpmnTask', { title: '拒绝', left: 480, top: 200 });
    designer.createEdge({ sourceId: start.state.id, targetId: gateway.state.id });
    designer.createEdge({ sourceId: gateway.state.id, targetId: approve.state.id, condition: '评分 >= 600' });
    designer.createEdge({ sourceId: gateway.state.id, targetId: reject.state.id, isDefault: true });

    const simulator = new BpmnSimulator(designer);
    simulator.start();
    runUntilIdle(simulator);

    const visited = simulator.getVisitedNodeIds();
    expect(visited).toContain(approve.state.id);
    expect(visited).not.toContain(reject.state.id);
  });

  it('并行网关一分为多，分支各自推进', () => {
    const { designer } = makeDesigner();
    const start = designer.createNode('bpmnEvent', { title: '开始', eventKind: 'start', left: 60, top: 120 });
    const fork = designer.createNode('bpmnGateway', { title: '并行', gatewayType: 'parallel', left: 240, top: 120 });
    const a = designer.createNode('bpmnTask', { title: 'A', left: 440, top: 40 });
    const b = designer.createNode('bpmnTask', { title: 'B', left: 440, top: 200 });
    const join = designer.createNode('bpmnGateway', { title: '汇聚', gatewayType: 'parallel', left: 660, top: 120 });
    const end = designer.createNode('bpmnEvent', { title: '结束', eventKind: 'end', left: 860, top: 120 });
    designer.createEdge({ sourceId: start.state.id, targetId: fork.state.id });
    designer.createEdge({ sourceId: fork.state.id, targetId: a.state.id });
    designer.createEdge({ sourceId: fork.state.id, targetId: b.state.id });
    designer.createEdge({ sourceId: a.state.id, targetId: join.state.id });
    designer.createEdge({ sourceId: b.state.id, targetId: join.state.id });
    designer.createEdge({ sourceId: join.state.id, targetId: end.state.id });

    const simulator = new BpmnSimulator(designer);
    simulator.start();
    // 到并行网关后令牌数应当变为 2（一分为二）
    let maxTokens = 0;
    for (let i = 0; i < 400 && !simulator.isFinished(); i++) {
      simulator.step(30);
      maxTokens = Math.max(maxTokens, simulator.getTokens().length);
    }
    // 并行网关恰好一分为二：不能多也不能少（回归：曾经重复入账成 4 条）
    expect(maxTokens).toBe(2);
    expect(simulator.getTokens().length).toBeLessThanOrEqual(2);
    const visited = simulator.getVisitedNodeIds();
    expect(visited).toContain(a.state.id);
    expect(visited).toContain(b.state.id);
    expect(visited).toContain(end.state.id);
    expect(simulator.isFinished()).toBe(true);
  });
});

describe('BPMN 令牌仿真 · 生命周期', () => {
  it('stop() 清掉工具层令牌；reset() 清空访问记录后可以重跑', () => {
    const { ice, designer } = makeDesigner();
    simpleFlow(designer);
    const simulator = new BpmnSimulator(designer);
    simulator.start();
    simulator.step(50);
    expect(ice.toolNodes.length).toBeGreaterThan(0);

    simulator.stop();
    expect(simulator.getTokens().length).toBe(0);
    expect(ice.toolNodes.filter((node: any) => node.constructor.typeId === 'ice-entity-designer:SimToken').length).toBe(0);

    simulator.reset();
    expect(simulator.getVisitedNodeIds().length).toBe(0);
    simulator.start();
    runUntilIdle(simulator);
    expect(simulator.isFinished()).toBe(true);
  });
});
