/**
 * Copyright (c) 2022 大漠穷秋.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/**
 * BPMN 2.0 语义校验（记法之外的那一层）。
 *
 * 只做「结构正确性」检查，不涉及具体引擎的扩展属性；返回问题列表供属性面板/工具条展示。
 * 与 ER 侧的 `validateSchema()` 同一形态（`{ level, code, message, componentId }`）。
 *
 * 约定：**容器归属按几何判定**——节点落在哪个池/泳道矩形内就属于它。
 * （真实 BPMN 里泳道是 `<laneSet>` 的显式归属；我们不做重父级，导出 XML 时按几何归类，
 * 这样拖拽体验与文档模型都简单，且不会出现「跨容器拖动导致连线错乱」。）
 */
export type BpmnIssue = {
  level: 'error' | 'warning';
  code: string;
  message: string;
  componentId?: string;
};

type Rect = { x0: number; y0: number; x1: number; y1: number };

/** 取连线端点（宿主 id）：不用可选链，仓库的 terser 版本解析不了 `?.` */
function endpointId(edge: any, terminal: 'start' | 'end'): string | undefined {
  const links = edge.state.links || {};
  const link = links[terminal] || {};
  return link.id;
}

function boxOf(component: any): Rect {
  const box = component.getMinBoundingBox(true);
  return { x0: box.tl[0], y0: box.tl[1], x1: box.br[0], y1: box.br[1] };
}

function contains(outer: Rect, inner: Rect): boolean {
  const cx = (inner.x0 + inner.x1) / 2;
  const cy = (inner.y0 + inner.y1) / 2;
  return cx >= outer.x0 && cx <= outer.x1 && cy >= outer.y0 && cy <= outer.y1;
}

/** 泳道/池：按面积从小到大排序，便于「最内层容器」判定 */
function containersOf(nodes: any[]): any[] {
  return nodes
    .filter((node) => node.state.kind === 'bpmnPool' || node.state.kind === 'bpmnLane')
    .sort((a, b) => a.state.width * a.state.height - b.state.width * b.state.height);
}

function owningPool(node: any, nodes: any[]): any {
  const box = boxOf(node);
  const pools = nodes.filter((item) => item.state.kind === 'bpmnPool');
  for (const pool of pools) {
    if (contains(boxOf(pool), box)) {
      return pool;
    }
  }
  return null;
}

export function validateBpmn(designer: any): BpmnIssue[] {
  const issues: BpmnIssue[] = [];
  const nodes: any[] = designer.nodes || [];
  const edges: any[] = designer.edges || [];
  const byId = new Map<string, any>();
  nodes.forEach((node) => byId.set(node.state.id, node));

  const isFlowNode = (node: any) =>
    !!node && ['bpmnEvent', 'bpmnTask', 'bpmnGateway', 'bpmnSubprocess'].indexOf(node.state.kind) !== -1;
  const flowNodes = nodes.filter(isFlowNode);
  const flowEdges = edges.filter((edge) => (edge.state.flowType || 'sequence') === 'sequence');
  const messageEdges = edges.filter((edge) => edge.state.flowType === 'message');

  const outgoing = new Map<string, any[]>();
  const incoming = new Map<string, any[]>();
  flowNodes.forEach((node) => {
    outgoing.set(node.state.id, []);
    incoming.set(node.state.id, []);
  });
  flowEdges.forEach((edge) => {
    const source = endpointId(edge, 'start');
    const target = endpointId(edge, 'end');
    const sourceList = outgoing.get(source);
    const targetList = incoming.get(target);
    if (sourceList) sourceList.push(edge);
    if (targetList) targetList.push(edge);
  });

  // 1) 事件的进出边规则
  flowNodes.forEach((node) => {
    const kind = node.state.kind;
    const eventKind = node.state.eventKind;
    const outs = outgoing.get(node.state.id) || [];
    const ins = incoming.get(node.state.id) || [];
    if (kind === 'bpmnEvent' && eventKind === 'start') {
      if (ins.length) {
        issues.push({
          level: 'error',
          code: 'start-incoming',
          componentId: node.state.id,
          message: `开始事件「${node.state.title}」不能有流入的顺序流`,
        });
      }
      if (!outs.length) {
        issues.push({
          level: 'error',
          code: 'start-no-outgoing',
          componentId: node.state.id,
          message: `开始事件「${node.state.title}」缺少流出的顺序流`,
        });
      }
    }
    if (kind === 'bpmnEvent' && eventKind === 'end') {
      if (outs.length) {
        issues.push({
          level: 'error',
          code: 'end-outgoing',
          componentId: node.state.id,
          message: `结束事件「${node.state.title}」不能有流出的顺序流`,
        });
      }
      if (!ins.length) {
        issues.push({
          level: 'warning',
          code: 'end-no-incoming',
          componentId: node.state.id,
          message: `结束事件「${node.state.title}」没有流入的顺序流（不可达）`,
        });
      }
    }

    // 2) 网关的出边数量与默认流
    if (kind === 'bpmnGateway') {
      const gatewayType = node.state.gatewayType || 'exclusive';
      if (outs.length < 1) {
        issues.push({
          level: 'error',
          code: 'gateway-no-outgoing',
          componentId: node.state.id,
          message: `网关「${node.state.title}」至少要有一条流出顺序流`,
        });
      }
      if (gatewayType !== 'exclusive' && outs.length < 2) {
        issues.push({
          level: 'warning',
          code: 'gateway-too-few-branches',
          componentId: node.state.id,
          message: `${{ parallel: '并行', inclusive: '包容', event: '事件' }[gatewayType] || gatewayType}网关「${
            node.state.title
          }」通常应有 ≥2 条出边`,
        });
      }
      const defaults = outs.filter((edge) => edge.state.isDefault);
      if (defaults.length > 1) {
        issues.push({
          level: 'error',
          code: 'gateway-multi-default',
          componentId: node.state.id,
          message: `网关「${node.state.title}」只能有一条默认流（当前 ${defaults.length} 条）`,
        });
      }
      if (defaults.length && gatewayType !== 'exclusive' && gatewayType !== 'inclusive') {
        issues.push({
          level: 'warning',
          code: 'gateway-default-on-and',
          componentId: node.state.id,
          message: `并行网关「${node.state.title}」不应设置默认流`,
        });
      }
    }

    // 3) 连通性：既无入边也无出边（且不是池/泳道/注释）
    if (!ins.length && !outs.length && kind !== 'bpmnPool' && kind !== 'bpmnLane' && kind !== 'bpmnAnnotation') {
      if (!(kind === 'bpmnEvent' && eventKind === 'start')) {
        issues.push({
          level: 'warning',
          code: 'isolated-node',
          componentId: node.state.id,
          message: `「${node.state.title}」没有连任何顺序流`,
        });
      }
    }
  });

  // 4) 每个池至少一个开始事件；池内节点不能跨池连线
  const pools = nodes.filter((node) => node.state.kind === 'bpmnPool');
  pools.forEach((pool) => {
    const poolBox = boxOf(pool);
    const inPool = flowNodes.filter((node) => contains(poolBox, boxOf(node)));
    const starts = inPool.filter((node) => node.state.kind === 'bpmnEvent' && node.state.eventKind === 'start');
    if (inPool.length && !starts.length) {
      issues.push({
        level: 'error',
        code: 'pool-no-start',
        componentId: pool.state.id,
        message: `池「${pool.state.title}」里没有开始事件`,
      });
    }
  });

  flowEdges.forEach((edge) => {
    const source = byId.get(endpointId(edge, 'start') as string);
    const target = byId.get(endpointId(edge, 'end') as string);
    if (!source || !target) {
      return;
    }
    const sourcePool = owningPool(source, nodes);
    const targetPool = owningPool(target, nodes);
    if (sourcePool !== targetPool) {
      issues.push({
        level: 'error',
        code: 'sequence-flow-cross-pool',
        componentId: edge.state.id,
        message: `顺序流不能跨池（「${source.state.title}」→「${target.state.title}」）；跨参与者请用消息流`,
      });
    }
  });

  // 5) 消息流应当跨池
  messageEdges.forEach((edge) => {
    const source = byId.get(endpointId(edge, 'start') as string);
    const target = byId.get(endpointId(edge, 'end') as string);
    if (!source || !target) {
      return;
    }
    const sourcePool = owningPool(source, nodes);
    const targetPool = owningPool(target, nodes);
    if (sourcePool && targetPool && sourcePool === targetPool) {
      issues.push({
        level: 'warning',
        code: 'message-flow-same-pool',
        componentId: edge.state.id,
        message: '消息流通常用于跨池（不同参与者）之间的通信',
      });
    }
  });

  // 6) 可达性：从开始事件出发，每个流节点都应可达
  const reachable = new Set<string>();
  const queue: string[] = flowNodes
    .filter((node) => node.state.kind === 'bpmnEvent' && node.state.eventKind === 'start')
    .map((node) => node.state.id);
  queue.forEach((id) => reachable.add(id));
  while (queue.length) {
    const current = queue.shift() as string;
    (outgoing.get(current) || []).forEach((edge) => {
      const next = endpointId(edge, 'end');
      if (next && !reachable.has(next)) {
        reachable.add(next);
        queue.push(next);
      }
    });
  }
  flowNodes.forEach((node) => {
    if (!reachable.has(node.state.id)) {
      issues.push({
        level: 'warning',
        code: 'unreachable-node',
        componentId: node.state.id,
        message: `「${node.state.title}」从开始事件出发不可达`,
      });
    }
  });

  return issues;
}
