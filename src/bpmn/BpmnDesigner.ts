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
  private __nesting = false;

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

  /**
   * 建节点：除常规流程元素外，**自动按几何把节点嵌进池/泳道**（用引擎的容器能力）。
   *
   * 为什么要真嵌套：外层容器（池）被拖动时，引擎的矩阵组合会让内部泳道与泳道里的节点
   * 一起移动 —— 这正是「拖动池子，里面的东西跟着走」的正确实现；扁平结构做不到。
   *
   * 归属规则：取「面积最小的、包住节点中心的容器」（泳道比池小 → 优先落在泳道里）。
   * 子组件坐标是**父容器左上角**为原点，因此嵌套时要做一次坐标换算。
   */
  public createNode(kind: any, props: any = {}): any {
    const node = super.createNode(kind, props);
    this.__nestByGeometry(node);
    return node;
  }

  /** 把（已经在 ice 根上的）节点嵌进最内层容器 */
  private __nestByGeometry(node: any): void {
    if (this.__nesting) {
      return;
    }
    if (node.state.kind === 'bpmnPool') {
      return; // 池是最外层容器
    }
    const box = node.getMinBoundingBox(true);
    const cx = (box.tl[0] + box.br[0]) / 2;
    const cy = (box.tl[1] + box.br[1]) / 2;
    const containers = this.nodes
      .filter((item: any) => item !== node && (item.state.kind === 'bpmnPool' || item.state.kind === 'bpmnLane'))
      .filter((item: any) => {
        const containerBox = item.getMinBoundingBox(true);
        return (
          cx >= containerBox.tl[0] && cx <= containerBox.br[0] && cy >= containerBox.tl[1] && cy <= containerBox.br[1]
        );
      })
      .sort((a: any, b: any) => a.state.width * a.state.height - b.state.width * b.state.height);
    const container = containers[0];
    if (!container) {
      return;
    }
    this.__nesting = true;
    try {
      // 用引擎的 adoptChild 迁移（**不能用 removeChild**：它会 destory 组件，把内部形状/标题一起毁掉），
      // 再以「父容器左上角为原点」换算坐标，保持世界位置不变。
      const dx = container.getMinBoundingBox(true).tl[0];
      const dy = container.getMinBoundingBox(true).tl[1];
      node.setState({ left: node.state.left - dx, top: node.state.top - dy });
      container.adoptChild(node);
    } finally {
      this.__nesting = false;
    }
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
