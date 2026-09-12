/**
 * Copyright (c) 2022 大漠穷秋.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import FlowDesigner from '../flow/FlowDesigner';
import { BpmnFlowMarker } from './bpmn_shapes';
import { validateBpmn } from './bpmn_validate';
import type { BpmnIssue } from './bpmn_validate';

/**
 * BPMN 设计器：`FlowDesigner` 的薄扩展，只补两件 BPMN 特有的事：
 *
 * 1. **顺序流上的条件/默认标记**（BPMN 记法要求）：标记是「派生装饰」，
 *    放在 `ice.toolNodes`（工具层）里 —— 工具层不参与引擎序列化（我们上轮验证过），
 *    所以文档仍然是纯粹的业务模型，标记由 `flowType/condition/isDefault` 推出来。
 * 2. **BPMN 语义校验**：`validate()` 直接复用 `validateBpmn()`。
 *
 * 其余能力（建节点/连线、选择、增删改、撤销重做、快照存取、适应视图、订阅）
 * 全部继承自 `FlowDesigner` —— 沿用同一套机制，不再造第二份。
 */
export default class BpmnDesigner extends FlowDesigner {
  private __markers = new Map<string, any>();
  private __markerSyncing = false;

  constructor(ice: any) {
    super(ice);
    // 任何模型变更（含画布拖动）后同步标记位置
    this.subscribe(() => this.syncFlowMarkers());
    this.syncFlowMarkers();
  }

  /** BPMN 语义校验（事件/网关/池/连通性等，见 bpmn_validate.ts） */
  public validateBpmn(): BpmnIssue[] {
    return validateBpmn(this);
  }

  /** 顺序流的条件/默认标记：按需创建、原位更新（放在工具层，不污染文档） */
  public syncFlowMarkers(): void {
    if (this.__markerSyncing) {
      return;
    }
    this.__markerSyncing = true;
    try {
      const needed = new Set<string>();
      this.edges.forEach((edge: any) => {
        const flowType = edge.state.flowType || 'sequence';
        const needsMarker = flowType === 'sequence' && (!!edge.state.condition || !!edge.state.isDefault);
        if (!needsMarker) {
          return;
        }
        needed.add(edge.state.id);
        const points: number[][] =
          edge.state.points && edge.state.points.length
            ? edge.state.points
            : [edge.state.startPoint, edge.state.endPoint];
        const from = points[0] || [0, 0];
        const to = points[1] || from;
        const dx = to[0] - from[0];
        const dy = to[1] - from[1];
        const length = Math.max(Math.hypot(dx, dy), 1);
        const offset = 16;
        const left = from[0] + (dx / length) * offset - 7;
        const top = from[1] + (dy / length) * offset - 7;
        const markerType = edge.state.isDefault ? 'default' : 'conditional';
        const strokeStyle = (edge.state.style && edge.state.style.strokeStyle) || '#475569';
        let marker = this.__markers.get(edge.state.id);
        if (!marker) {
          marker = new BpmnFlowMarker({
            left,
            top,
            width: 14,
            height: 14,
            interactive: false,
            draggable: false,
            linkable: false,
            showMinBoundingBox: false,
            showMaxBoundingBox: false,
            markerType,
            style: { strokeStyle, fillStyle: '#ffffff', lineWidth: 1.4 },
          });
          this.ice.addTool(marker);
          this.__markers.set(edge.state.id, marker);
        } else {
          marker.setState({ left, top, markerType, style: { ...(marker.state.style || {}), strokeStyle } });
          marker.dirty = true;
        }
      });

      // 清掉不再需要的标记
      [...this.__markers.keys()].forEach((edgeId) => {
        if (!needed.has(edgeId)) {
          const marker = this.__markers.get(edgeId);
          this.ice.removeTool(marker);
          this.__markers.delete(edgeId);
        }
      });
    } finally {
      this.__markerSyncing = false;
    }
  }

  public dispose(): void {
    this.__markers.forEach((marker) => this.ice.removeTool(marker));
    this.__markers.clear();
    super.dispose();
  }
}
