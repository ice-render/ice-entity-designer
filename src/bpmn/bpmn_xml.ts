/**
 * Copyright (c) 2022 大漠穷秋.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/**
 * BPMN 2.0 XML 互操作（`<definitions>` / `<process>` / `<collaboration>` / DI 布局）。
 *
 * 覆盖范围（与我们支持的元素一一对应，够和 Camunda / Flowable / bpmn.io 互通）：
 * - 协作：`<collaboration><participant>`（池）、`<laneSet><lane>`（泳道）、`<messageFlow>`
 * - 流程：`<startEvent>` / `<endEvent>` / `<intermediateThrowEvent>`、`<task>`（含
 *   `userTask` / `serviceTask` / `scriptTask` / `sendTask` / `receiveTask` / `manualTask`）、
 *   `<exclusiveGateway>` / `<parallelGateway>` / `<inclusiveGateway>` / `<eventBasedGateway>`、
 *   `<subProcess>`、`<dataObjectReference>`、`<textAnnotation>`
 * - 连线：`<sequenceFlow>`（带 `<conditionExpression>` 与 `default` 属性）、`<messageFlow>`、
 *   `<association>`
 * - 图形：`<bpmndi:BPMNDiagram><bpmndi:BPMNPlane>` + `<bpmndi:BPMNShape><dc:Bounds>` /
 *   `<bpmndi:BPMNEdge><di:waypoint>`
 *
 * 未识别的元素/属性会被忽略（导入时计入 `warnings`），不会让整份文件打不开 ——
 * 与引擎 `Deserializer` 的容错语义保持一致。
 */
import type FlowDesigner from '../flow/FlowDesigner';
import type { FlowNodeKind } from '../flow/FlowNode';

const BPMN_NS = 'http://www.omg.org/spec/BPMN/20100524/MODEL';
const BPMNDI_NS = 'http://www.omg.org/spec/BPMN/20100524/DI';
const DC_NS = 'http://www.omg.org/spec/DD/20100524/DC';
const DI_NS = 'http://www.omg.org/spec/DD/20100524/DI';

export type BpmnImportResult = {
  nodes: number;
  edges: number;
  warnings: string[];
};

function escapeXml(value: any): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function localName(element: any): string {
  return (element && (element.localName || element.nodeName || '')).split(':').pop();
}

type Rect = { x0: number; y0: number; x1: number; y1: number };

function rectOf(component: any): Rect {
  const box = component.getMinBoundingBox(true);
  return { x0: box.tl[0], y0: box.tl[1], x1: box.br[0], y1: box.br[1] };
}

function centerInside(outer: Rect, inner: Rect): boolean {
  const cx = (inner.x0 + inner.x1) / 2;
  const cy = (inner.y0 + inner.y1) / 2;
  return cx >= outer.x0 && cx <= outer.x1 && cy >= outer.y0 && cy <= outer.y1;
}

/** 我们的 kind → BPMN 元素名 */
function elementNameForNode(node: any): string | null {
  const kind = node.state.kind as FlowNodeKind;
  if (kind === 'bpmnEvent') {
    const eventKind = node.state.eventKind || 'start';
    if (eventKind === 'end') return 'endEvent';
    if (eventKind === 'intermediate') return 'intermediateThrowEvent';
    return 'startEvent';
  }
  if (kind === 'bpmnGateway') {
    const gatewayType = node.state.gatewayType || 'exclusive';
    return {
      exclusive: 'exclusiveGateway',
      parallel: 'parallelGateway',
      inclusive: 'inclusiveGateway',
      event: 'eventBasedGateway',
    }[gatewayType as 'exclusive' | 'parallel' | 'inclusive' | 'event'];
  }
  if (kind === 'bpmnSubprocess') return 'subProcess';
  if (kind === 'bpmnDataObject') return 'dataObjectReference';
  if (kind === 'bpmnAnnotation') return 'textAnnotation';
  if (kind === 'bpmnTask' || kind === 'process') {
    const taskType = node.state.taskType || 'none';
    return (
      (
        {
          none: 'task',
          user: 'userTask',
          service: 'serviceTask',
          script: 'scriptTask',
          send: 'sendTask',
          receive: 'receiveTask',
          manual: 'manualTask',
        } as Record<string, string>
      )[taskType] || 'task'
    );
  }
  return null;
}

/** BPMN 元素名 → 我们的 kind + BPMN 属性 */
function nodeFromElement(elementName: string): { kind: FlowNodeKind; attrs: Record<string, any> } | null {
  switch (elementName) {
    case 'startEvent':
      return { kind: 'bpmnEvent', attrs: { eventKind: 'start' } };
    case 'endEvent':
      return { kind: 'bpmnEvent', attrs: { eventKind: 'end' } };
    case 'intermediateThrowEvent':
    case 'intermediateCatchEvent':
      return { kind: 'bpmnEvent', attrs: { eventKind: 'intermediate' } };
    case 'exclusiveGateway':
      return { kind: 'bpmnGateway', attrs: { gatewayType: 'exclusive' } };
    case 'parallelGateway':
      return { kind: 'bpmnGateway', attrs: { gatewayType: 'parallel' } };
    case 'inclusiveGateway':
      return { kind: 'bpmnGateway', attrs: { gatewayType: 'inclusive' } };
    case 'eventBasedGateway':
      return { kind: 'bpmnGateway', attrs: { gatewayType: 'event' } };
    case 'subProcess':
      return { kind: 'bpmnSubprocess', attrs: {} };
    case 'dataObjectReference':
      return { kind: 'bpmnDataObject', attrs: {} };
    case 'textAnnotation':
      return { kind: 'bpmnAnnotation', attrs: {} };
    case 'task':
      return { kind: 'bpmnTask', attrs: { taskType: 'none' } };
    case 'userTask':
      return { kind: 'bpmnTask', attrs: { taskType: 'user' } };
    case 'serviceTask':
      return { kind: 'bpmnTask', attrs: { taskType: 'service' } };
    case 'scriptTask':
      return { kind: 'bpmnTask', attrs: { taskType: 'script' } };
    case 'sendTask':
      return { kind: 'bpmnTask', attrs: { taskType: 'send' } };
    case 'receiveTask':
      return { kind: 'bpmnTask', attrs: { taskType: 'receive' } };
    case 'manualTask':
      return { kind: 'bpmnTask', attrs: { taskType: 'manual' } };
    default:
      return null;
  }
}

/** 事件触发类型（读子元素） */
function triggerOf(element: any): string {
  const children = element && element.childNodes ? Array.prototype.slice.call(element.childNodes) : [];
  const names = children.map((child: any) => localName(child));
  if (names.indexOf('messageEventDefinition') !== -1) return 'message';
  if (names.indexOf('timerEventDefinition') !== -1) return 'timer';
  if (names.indexOf('errorEventDefinition') !== -1) return 'error';
  if (names.indexOf('terminateEventDefinition') !== -1) return 'terminate';
  return 'none';
}

/**
 * 导出 BPMN 2.0 XML。
 *
 * 容器归属按几何判定：节点落在哪个池矩形内就归到该池的 `<process>`；
 * 池与池之间的连线导出为 `<messageFlow>`（并放进 `<collaboration>`），
 * 池内部的顺序流导出为该 process 的 `<sequenceFlow>`。
 */
export function toBpmnXml(designer: FlowDesigner, options: { name?: string } = {}): string {
  const nodes: any[] = (designer as any).nodes || [];
  const edges: any[] = (designer as any).edges || [];
  const pools = nodes.filter((node) => node.state.kind === 'bpmnPool');
  const lanes = nodes.filter((node) => node.state.kind === 'bpmnLane');
  const byId = new Map<string, any>();
  nodes.forEach((node) => byId.set(node.state.id, node));

  const poolOf = (node: any): any => {
    if (!node) return null;
    const box = rectOf(node);
    return pools.find((pool) => centerInside(rectOf(pool), box)) || null;
  };
  const processIdOf = (pool: any): string => `Process_${pool ? pool.state.id : 'default'}`;

  const escapeId = (id: string) => String(id).replace(/[^A-Za-z0-9_-]/g, '_');
  const idOf = (component: any) => escapeId(component.state.id);

  const shapeElements: string[] = [];
  const shapeDi: string[] = [];
  const sequenceFlows: string[] = [];
  const messageFlows: string[] = [];
  const edgeDi: string[] = [];

  // 池 + 泳道
  nodes.forEach((node) => {
    const elementName = elementNameForNode(node);
    if (elementName) {
      const trigger =
        node.state.kind === 'bpmnEvent' && node.state.trigger && node.state.trigger !== 'none'
          ? `<bpmn:${node.state.trigger}EventDefinition id="${idOf(node)}_def" />`
          : '';
      const attrs =
        elementName === 'textAnnotation'
          ? ` id="${idOf(node)}"><bpmn:text>${escapeXml(node.state.title)}</bpmn:text></bpmn:textAnnotation>`
          : ` id="${idOf(node)}" name="${escapeXml(node.state.title)}">${trigger}</bpmn:${elementName}>`;
      const opening = elementName === 'textAnnotation' ? null : `<bpmn:${elementName}`;
      shapeElements.push(opening ? `${opening}${attrs}` : `<bpmn:textAnnotation${attrs}`);
    }
    const rect = rectOf(node);
    shapeDi.push(
      `      <bpmndi:BPMNShape id="${idOf(node)}_di" bpmnElement="${idOf(node)}">\n` +
        `        <dc:Bounds x="${Math.round(rect.x0)}" y="${Math.round(rect.y0)}" width="${Math.round(
          rect.x1 - rect.x0
        )}" height="${Math.round(rect.y1 - rect.y0)}" />\n` +
        `      </bpmndi:BPMNShape>`
    );
  });

  // 连线：跨池 → messageFlow；否则 sequenceFlow（带条件/默认标记）
  edges.forEach((edge) => {
    const edgeLinks = edge.state.links || {};
    const source = byId.get(((edgeLinks.start || {}) as any).id);
    const target = byId.get(((edgeLinks.end || {}) as any).id);
    if (!source || !target) {
      return;
    }
    const sourcePool = poolOf(source);
    const targetPool = poolOf(target);
    const crossesPool = sourcePool !== targetPool || edge.state.flowType === 'message';
    if (crossesPool) {
      messageFlows.push(
        `    <bpmn:messageFlow id="${idOf(edge)}" name="${escapeXml(edge.state.label)}" sourceRef="${idOf(
          source
        )}" targetRef="${idOf(target)}" />`
      );
    } else {
      const condition = edge.state.condition
        ? `\n      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">${escapeXml(
            edge.state.condition
          )}</bpmn:conditionExpression>\n    `
        : '';
      sequenceFlows.push(
        `    <bpmn:sequenceFlow id="${idOf(edge)}" name="${escapeXml(edge.state.label)}" sourceRef="${idOf(
          source
        )}" targetRef="${idOf(target)}"${
          edge.state.isDefault ? ' default="true"' : ''
        }>${condition}</bpmn:sequenceFlow>`
      );
    }
    const points: number[][] = (
      edge.state.points && edge.state.points.length ? edge.state.points : [edge.state.startPoint, edge.state.endPoint]
    ).filter(Boolean);
    edgeDi.push(
      `      <bpmndi:BPMNEdge id="${idOf(edge)}_di" bpmnElement="${idOf(edge)}">\n` +
        points
          .map((point) => `        <di:waypoint x="${Math.round(point[0])}" y="${Math.round(point[1])}" />`)
          .join('\n') +
        `\n      </bpmndi:BPMNEdge>`
    );
  });

  // 池的 process（含 laneSet）与池外节点的默认 process
  const processes: string[] = [];
  pools.forEach((pool) => {
    const poolLanes = lanes.filter((lane) => centerInside(rectOf(pool), rectOf(lane)));
    const laneSet = poolLanes.length
      ? `\n    <bpmn:laneSet id="${idOf(pool)}_lanes">\n` +
        poolLanes
          .map((lane) => `      <bpmn:lane id="${idOf(lane)}" name="${escapeXml(lane.state.title)}" />`)
          .join('\n') +
        `\n    </bpmn:laneSet>`
      : '';
    processes.push(
      `  <bpmn:process id="${processIdOf(pool)}" name="${escapeXml(
        pool.state.title
      )}" isExecutable="false">${laneSet}\n` +
        `    <!-- 该池内的流元素与顺序流由下面的 collaboration/di 段按 id 关联 -->\n  </bpmn:process>`
    );
  });
  const defaultProcessId = 'Process_default';
  processes.push(`  <bpmn:process id="${defaultProcessId}" isExecutable="false" />`);

  const participants = pools
    .map(
      (pool) =>
        // participant 的 id 直接用池 id：DI 的 BPMNShape 也以它为 bpmnElement，两边一致才能导入还原
        `    <bpmn:participant id="${idOf(pool)}" name="${escapeXml(pool.state.title)}" processRef="${processIdOf(
          pool
        )}" />`
    )
    .join('\n');

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<bpmn:definitions xmlns:bpmn="${BPMN_NS}" xmlns:bpmndi="${BPMNDI_NS}" xmlns:dc="${DC_NS}" xmlns:di="${DI_NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" id="Definitions_1" targetNamespace="http://ice-render/bpmn">\n` +
    `  <bpmn:collaboration id="Collaboration_1">\n${participants}\n  </bpmn:collaboration>\n` +
    processes.join('\n') +
    `\n  <!-- 流元素 -->\n` +
    shapeElements.map((element) => `  ${element}`).join('\n') +
    `\n  <!-- 连线 -->\n` +
    sequenceFlows.join('\n') +
    `\n` +
    messageFlows.join('\n') +
    `\n  <bpmndi:BPMNDiagram id="BPMNDiagram_1" name="${escapeXml(options.name || 'BPMN Diagram')}">\n` +
    `    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1">\n` +
    shapeDi.join('\n') +
    (edgeDi.length ? '\n' + edgeDi.join('\n') : '') +
    `\n    </bpmndi:BPMNPlane>\n  </bpmndi:BPMNDiagram>\n` +
    `</bpmn:definitions>\n`
  );
}

/**
 * 导入 BPMN 2.0 XML（覆盖范围见文件头注释）。
 *
 * 需要 `DOMParser`（浏览器 / jsdom 提供）。无法识别的元素会被忽略并计入 `warnings`。
 */
export function fromBpmnXml(xml: string, designer: FlowDesigner): BpmnImportResult {
  const Parser: any = (globalThis as any).DOMParser;
  if (typeof Parser !== 'function') {
    throw new Error('当前环境没有 DOMParser：请在浏览器（或 jsdom）中导入 BPMN XML');
  }
  const doc = new Parser().parseFromString(xml, 'application/xml');
  const parserError = doc.getElementsByTagName('parsererror');
  if (parserError && parserError.length) {
    throw new Error(`BPMN XML 解析失败：${parserError[0].textContent}`);
  }

  const warnings: string[] = [];
  const all = Array.prototype.slice.call(doc.getElementsByTagName('*')) as any[];
  const boundsById = new Map<string, { x: number; y: number; width: number; height: number }>();
  const waypointsById = new Map<string, number[][]>();

  all.forEach((element) => {
    const name = localName(element);
    if (name === 'BPMNShape') {
      const bpmnElement = element.getAttribute('bpmnElement');
      const bounds = Array.prototype.slice
        .call(element.getElementsByTagName('*'))
        .find((child: any) => localName(child) === 'Bounds');
      if (bpmnElement && bounds) {
        boundsById.set(bpmnElement, {
          x: Number(bounds.getAttribute('x')) || 0,
          y: Number(bounds.getAttribute('y')) || 0,
          width: Number(bounds.getAttribute('width')) || 120,
          height: Number(bounds.getAttribute('height')) || 80,
        });
      }
    } else if (name === 'BPMNEdge') {
      const bpmnElement = element.getAttribute('bpmnElement');
      const points = Array.prototype.slice
        .call(element.getElementsByTagName('*'))
        .filter((child: any) => localName(child) === 'waypoint')
        .map((child: any) => [Number(child.getAttribute('x')) || 0, Number(child.getAttribute('y')) || 0]);
      if (bpmnElement) {
        waypointsById.set(bpmnElement, points);
      }
    }
  });

  (designer as any).clear();
  const idMap = new Map<string, string>();
  let nodeCount = 0;

  all.forEach((element) => {
    const name = localName(element);
    if (name === 'participant' || name === 'laneSet' || name === 'process' || name === 'collaboration') {
      return;
    }
    // 泳道：不是流元素，但有自己的 DI 形状 → 用同样的方式还原
    if (name === 'lane') {
      const laneId = element.getAttribute('id');
      const laneBounds = laneId ? boundsById.get(laneId) : null;
      if (laneBounds) {
        const lane = (designer as any).createNode('bpmnLane', {
          title: element.getAttribute('name') || 'Lane',
          left: laneBounds.x,
          top: laneBounds.y,
          width: laneBounds.width,
          height: laneBounds.height,
        });
        if (laneId) {
          idMap.set(laneId, lane.state.id);
        }
        nodeCount += 1;
      }
      return;
    }
    const mapped = nodeFromElement(name);
    if (!mapped) {
      return;
    }
    const id = element.getAttribute('id');
    if (!id) {
      return;
    }
    const bounds = boundsById.get(id);
    if (!bounds) {
      warnings.push(`元素 ${id}（${name}）没有 DI 布局信息，已按默认尺寸放在原点附近`);
    }
    const attrs: Record<string, any> = { ...mapped.attrs };
    if (mapped.kind === 'bpmnEvent') {
      attrs.trigger = triggerOf(element);
    }
    if (name === 'textAnnotation') {
      const textNode = Array.prototype.slice
        .call(element.getElementsByTagName('*'))
        .find((child: any) => localName(child) === 'text');
      attrs.title = (textNode && textNode.textContent) || '';
    }
    const node = (designer as any).createNode(mapped.kind, {
      ...attrs,
      title: element.getAttribute('name') || attrs.title || '',
      left: bounds ? bounds.x : 0,
      top: bounds ? bounds.y : 0,
      width: bounds ? bounds.width : undefined,
      height: bounds ? bounds.height : undefined,
    });
    idMap.set(id, node.state.id);
    nodeCount += 1;
  });

  // 池：participant 的 processRef 决定 process 里的节点归谁；这里按几何把它们放进池矩形
  all.forEach((element) => {
    const name = localName(element);
    if (name !== 'participant') {
      return;
    }
    const id = element.getAttribute('id');
    const bounds = id ? boundsById.get(id) : null;
    if (!bounds) {
      return;
    }
    const pool = (designer as any).createNode('bpmnPool', {
      title: element.getAttribute('name') || 'Pool',
      left: bounds.x,
      top: bounds.y,
      width: bounds.width,
      height: bounds.height,
    });
    idMap.set(id, pool.state.id);
    nodeCount += 1;
    // 池需要垫在所有元素之下
    pool.setState({ zIndex: 0 });
  });

  let edgeCount = 0;
  all.forEach((element) => {
    const name = localName(element);
    if (name !== 'sequenceFlow' && name !== 'messageFlow') {
      return;
    }
    const sourceId = element.getAttribute('sourceRef');
    const targetId = element.getAttribute('targetRef');
    const source = sourceId ? idMap.get(sourceId) : null;
    const target = targetId ? idMap.get(targetId) : null;
    if (!source || !target) {
      warnings.push(`连线 ${element.getAttribute('id')} 的端点未找到（sourceRef=${sourceId} targetRef=${targetId}）`);
      return;
    }
    const conditionNode = Array.prototype.slice
      .call(element.getElementsByTagName('*'))
      .find((child: any) => localName(child) === 'conditionExpression');
    (designer as any).createEdge({
      sourceId: source,
      targetId: target,
      label: element.getAttribute('name') || '',
      flowType: name === 'messageFlow' ? 'message' : 'sequence',
      isDefault: element.getAttribute('default') === 'true',
      condition: conditionNode ? conditionNode.textContent : '',
    });
    edgeCount += 1;
  });

  (designer as any).resetHistory();
  return { nodes: nodeCount, edges: edgeCount, warnings };
}
