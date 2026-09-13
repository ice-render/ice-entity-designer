/**
 * Copyright (c) 2022 大漠穷秋.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { ICECircle } from 'ice-render';

/**
 * 仿真令牌的点：一个普通的引擎圆，只是给了稳定的 `typeId`。
 *
 * 它挂在 `ice.toolNodes`（工具层）—— 工具层**不参与引擎序列化**，因此仿真不会污染文档、
 * 快照与 BPMN XML 导出，一旦 `stop()` 就干净退场。
 */
export class SimTokenDot extends ICECircle {
  public static readonly typeId = 'ice-entity-designer:SimToken';

  constructor(props: any = {}) {
    super({ radius: 7, stroke: false, interactive: false, zIndex: 10000020, ...props });
  }
}

export type SimToken = {
  id: string;
  /** 当前所在节点 */
  nodeId: string;
  /** 正在走的连线（在节点上停留时为 null） */
  edgeId: string | null;
  /** 在连线上的进度 0..1 */
  progress: number;
  /** 世界坐标（画布上的位置，测试与渲染都用它） */
  position: number[];
  /** 在当前节点还要停留多少毫秒 */
  dwellRemaining: number;
  component: any;
};

export type BpmnSimulatorOptions = {
  /** 任务/网关等节点上的默认停留时长（毫秒） */
  nodeDuration?: number;
  /** 走一条连线默认花多久（毫秒） */
  edgeDuration?: number;
};

const DEFAULT_NODE_DURATION = 400;
const DEFAULT_EDGE_DURATION = 600;

/** 沿折线按弧长取点：`t` ∈ [0,1] */
function pointAt(points: number[][], t: number): number[] {
  if (!points || points.length === 0) {
    return [0, 0];
  }
  if (points.length === 1) {
    return [...points[0]];
  }
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const length = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    lengths.push(length);
    total += length;
  }
  if (total <= 0) {
    return [...points[0]];
  }
  let target = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < lengths.length; i++) {
    if (target <= lengths[i] || i === lengths.length - 1) {
      const ratio = lengths[i] > 0 ? target / lengths[i] : 0;
      const from = points[i];
      const to = points[i + 1];
      return [from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio];
    }
    target -= lengths[i];
  }
  return [...points[points.length - 1]];
}

/**
 * @class BpmnSimulator BPMN 令牌仿真
 *
 * 把「流程怎么走」演示出来：令牌从开始事件出发，沿顺序流前进，在任务上停留，
 * 在排他网关选一条分支、在并行网关一分为多，最终到达结束事件消失。
 *
 * 设计上刻意**不引入新的时间机制**：
 * - 推进是显式的 `step(dtMs)`：浏览器里由引擎的帧事件驱动，测试里手动推进（确定性、可断言）；
 * - 令牌位置就在连线的**实际折点**上插值（`points`），因此令牌始终贴在画出来的线上；
 * - 令牌是工具层组件：不写文档、不影响快照与导出。
 */
export default class BpmnSimulator {
  private designer: any;
  private tokens: SimToken[] = [];
  private visited = new Set<string>();
  private running = false;
  private finished = false;
  private started = false;
  private nodeDurations = new Map<string, number>();
  private nodeDuration = DEFAULT_NODE_DURATION;
  private edgeDuration = DEFAULT_EDGE_DURATION;
  private seq = 0;
  private lastFrameAt = 0;
  private frameHandler: any = null;

  constructor(designer: any, options: BpmnSimulatorOptions = {}) {
    this.designer = designer;
    if (options.nodeDuration !== undefined) {
      this.nodeDuration = options.nodeDuration;
    }
    if (options.edgeDuration !== undefined) {
      this.edgeDuration = options.edgeDuration;
    }
  }

  /** 单个节点上的停留时长（例如让某个任务看得清） */
  public setNodeDuration(nodeId: string, duration: number): void {
    this.nodeDurations.set(nodeId, Math.max(0, Number(duration) || 0));
  }

  public setEdgeDuration(duration: number): void {
    this.edgeDuration = Math.max(1, Number(duration) || DEFAULT_EDGE_DURATION);
  }

  public isRunning(): boolean {
    return this.running;
  }

  public isFinished(): boolean {
    return this.started && this.tokens.length === 0;
  }

  public getTokens(): SimToken[] {
    return this.tokens;
  }

  public getVisitedNodeIds(): string[] {
    return [...this.visited];
  }

  /** 开始：每个「开始事件」放一个令牌，并挂到帧循环上 */
  public start(): void {
    this.stop();
    this.started = true;
    this.finished = false;
    const starts = this.designer.nodes.filter(
      (node: any) => node.state.kind === 'bpmnEvent' && (node.state.eventKind || 'start') === 'start'
    );
    starts.forEach((node: any) => this.__spawn(node.state.id));
    if (!starts.length) {
      this.finished = true;
    }
    this.running = true;
    // 帧驱动：用引擎的帧事件，不自己起 rAF（Node 环境没有帧事件，测试用 step 手动推进）
    this.frameHandler = () => {
      const now = Date.now();
      const dt = this.lastFrameAt ? Math.min(100, now - this.lastFrameAt) : 16;
      this.lastFrameAt = now;
      this.step(dt);
    };
    if (this.designer.ice && this.designer.ice.evtBus) {
      this.designer.ice.evtBus.on('ICE_FRAME_EVENT', this.frameHandler, this);
    }
  }

  public stop(): void {
    if (this.frameHandler && this.designer.ice && this.designer.ice.evtBus) {
      this.designer.ice.evtBus.off('ICE_FRAME_EVENT', this.frameHandler, this);
    }
    this.frameHandler = null;
    this.tokens.forEach((token) => this.__removeComponent(token));
    this.tokens = [];
    this.running = false;
    this.lastFrameAt = 0;
  }

  /** 清空令牌与访问记录（可重跑） */
  public reset(): void {
    this.stop();
    this.visited.clear();
    this.started = false;
    this.finished = false;
  }

  /**
   * 推进 `dtMs` 毫秒。
   *
   * 令牌的状态机很直白：在节点上倒计时停留 → 到时选出口（可能分裂）→ 在连线上按进度前进
   * → 到达目标节点。结束事件上不再有出口，令牌随之消失。
   */
  public step(dtMs: number): void {
    if (!this.tokens.length) {
      if (this.started) {
        this.finished = true;
        this.running = false;
      }
      return;
    }
    const dt = Math.max(0, Number(dtMs) || 0);
    const nextTokens: SimToken[] = [];
    this.tokens.forEach((token) => {
      if (token.edgeId) {
        token.progress += dt / this.edgeDuration;
        if (token.progress >= 1) {
          this.__arriveAtNode(token, token.edgeId);
        }
        this.__syncPosition(token);
        // 还在棋盘上的令牌继续保留（到达结束事件的在 __arriveAtNode 里已消亡）
        if (token.nodeId) {
          nextTokens.push(token);
        }
        return;
      }
      token.dwellRemaining -= dt;
      if (token.dwellRemaining > 0) {
        nextTokens.push(token);
        return;
      }
      // 停留结束：由 __leaveNode 决定去向（排他 = 一条、并行 = 可能分裂），
      // 它负责把「存活的令牌」push 进 nextTokens —— 这里不要再 push，否则令牌会被重复入账。
      this.__leaveNode(token, nextTokens);
    });
    this.tokens = nextTokens;
    if (!this.tokens.length) {
      this.finished = true;
      this.running = false;
    }
  }

  /** 选中一条出口连线（排他网关优先选带条件的，其次是显式非默认的） */
  private __pickExclusive(edges: any[]): any {
    const withCondition = edges.filter((edge: any) => String(edge.state.condition || '').trim() !== '');
    if (withCondition.length) {
      return withCondition[0];
    }
    const nonDefault = edges.filter((edge: any) => !edge.state.isDefault);
    return nonDefault.length ? nonDefault[0] : edges[0];
  }

  private __spawn(nodeId: string, edgeId: string | null = null, progress = 0): SimToken {
    const node = this.designer.ice.findComponent(nodeId);
    const token: SimToken = {
      id: `sim-token-${++this.seq}`,
      nodeId,
      edgeId,
      progress,
      position: this.__nodePosition(node),
      dwellRemaining: this.nodeDurations.get(nodeId) || this.nodeDuration,
      component: null,
    };
    const dot = new SimTokenDot({
      left: token.position[0] - 7,
      top: token.position[1] - 7,
      style: { fillStyle: '#f97316' },
    });
    token.component = dot;
    this.designer.ice.addTool(dot);
    this.visited.add(nodeId);
    this.tokens.push(token);
    if (edgeId) {
      this.__syncPosition(token);
    }
    return token;
  }

  private __arriveAtNode(token: SimToken, edgeId: string): void {
    const edge = this.designer.ice.findComponent(edgeId);
    const links = (edge && edge.state.links) || {};
    const targetId = links.end && links.end.id;
    const target = targetId ? this.designer.ice.findComponent(targetId) : null;
    token.edgeId = null;
    token.progress = 0;
    token.nodeId = targetId;
    token.position = this.__nodePosition(target);
    token.dwellRemaining = this.nodeDurations.get(targetId) || this.nodeDuration;
    this.visited.add(targetId);
    // 结束事件：到达即消亡（终止事件同理）
    const isEnd =
      target &&
      target.state.kind === 'bpmnEvent' &&
      ((target.state.eventKind || 'start') === 'end' || target.state.trigger === 'terminate');
    if (isEnd) {
      token.nodeId = '';
      this.__removeComponent(token);
    }
    this.__syncPosition(token);
  }

  /** 离开节点：选出口；并行/包容网关分裂成多条令牌 */
  private __leaveNode(token: SimToken, out: SimToken[]): void {
    const node = this.designer.ice.findComponent(token.nodeId);
    const edges = this.designer.edges.filter((edge: any) => {
      const links = edge.state.links || {};
      return links.start && links.start.id === token.nodeId && (edge.state.flowType || 'sequence') === 'sequence';
    });
    if (!node || !edges.length) {
      token.nodeId = '';
      this.__removeComponent(token);
      return;
    }
    const isParallel = node.state.kind === 'bpmnGateway' && node.state.gatewayType !== 'exclusive';
    const chosen = isParallel ? edges : [this.__pickExclusive(edges)];
    chosen.forEach((edge: any, index: number) => {
      if (index === 0) {
        token.edgeId = edge.state.id;
        token.progress = 0;
        token.dwellRemaining = 0; // 离开节点后停留计数清零（否则会留下一个负数）
        out.push(token);
        return;
      }
      // 分裂：复制一条令牌走另一个分支（从当前节点出发）
      const branch = this.__spawn(token.nodeId, edge.state.id, 0);
      branch.dwellRemaining = 0;
      out.push(branch);
    });
  }

  private __syncPosition(token: SimToken): void {
    if (token.edgeId) {
      const edge = this.designer.ice.findComponent(token.edgeId);
      const points: number[][] = (edge && edge.state.points) || [];
      token.position = pointAt(points, token.progress);
    }
    if (token.component) {
      const radius = token.component.state.radius || 7;
      token.component.setPosition(token.position[0] - radius, token.position[1] - radius);
    }
  }

  private __nodePosition(node: any): number[] {
    if (!node) {
      return [0, 0];
    }
    const box = node.getMinBoundingBox(true);
    return [box.center[0], box.center[1]];
  }

  private __removeComponent(token: SimToken): void {
    if (token.component && this.designer.ice) {
      this.designer.ice.removeTool(token.component);
      token.component = null;
    }
  }
}
