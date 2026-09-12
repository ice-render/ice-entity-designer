/**
 * Copyright (c) 2022 大漠穷秋.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { ICE } from 'ice-render';
import FlowEdge from './FlowEdge';
import FlowNode from './FlowNode';
import type { FlowNodeKind } from './FlowNode';
import type { FlowEdgeSnapshot, FlowPort } from './FlowEdge';
import type { FlowNodeSnapshot } from './FlowNode';

/** 流程图快照：只含流程图自身的语义数据，跨版本可读 */
export type FlowSnapshot = {
  version: number;
  kind: 'flowchart';
  nodes: FlowNodeSnapshot[];
  edges: FlowEdgeSnapshot[];
};

/** load() 的载入报告 */
export type FlowLoadReport = {
  /** 是否真的发生了一次载入（空值 / 非流程图快照为 false） */
  loaded: boolean;
  nodes: number;
  edges: number;
  /** 因 typeId 不匹配被跳过的节点/连线 */
  skipped: string[];
};

export type FlowSnapshotValidationResult = {
  valid: boolean;
  errors: string[];
};

/**
 * 校验流程图快照结构。
 *
 * 契约与 IED 的项目快照一致：**serialize() 的产物必须永远能通过本校验**，
 * 因此只校验加载器需要的结构，可选值（颜色 / 尺寸 / 端口）缺省即合法。
 */
export function validateFlowSnapshot(data: any): FlowSnapshotValidationResult {
  const errors: string[] = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, errors: ['root must be an object'] };
  }
  if (!Array.isArray(data.nodes)) {
    errors.push('nodes must be an array');
  } else {
    data.nodes.forEach((node: any, index: number) => {
      const prefix = `nodes[${index}]`;
      if (!node || typeof node !== 'object' || Array.isArray(node)) {
        errors.push(`${prefix} must be an object`);
        return;
      }
      if (typeof node.id !== 'string') errors.push(`${prefix}.id must be a string`);
      if (node.kind !== undefined && typeof node.kind !== 'string')
        errors.push(`${prefix}.kind must be a string when present`);
      if (node.left !== undefined && typeof node.left !== 'number')
        errors.push(`${prefix}.left must be a number when present`);
      if (node.top !== undefined && typeof node.top !== 'number')
        errors.push(`${prefix}.top must be a number when present`);
    });
  }
  if (data.edges !== undefined && !Array.isArray(data.edges)) {
    errors.push('edges must be an array when present');
  } else if (Array.isArray(data.edges)) {
    data.edges.forEach((edge: any, index: number) => {
      const prefix = `edges[${index}]`;
      if (!edge || typeof edge !== 'object' || Array.isArray(edge)) {
        errors.push(`${prefix} must be an object`);
        return;
      }
      ['sourceId', 'targetId'].forEach((key) => {
        // null 表示「没有宿主」（悬空连线），与缺省等价
        if (edge[key] !== undefined && edge[key] !== null && typeof edge[key] !== 'string') {
          errors.push(`${prefix}.${key} must be a string or null when present`);
        }
      });
      if (edge.label !== undefined && typeof edge.label !== 'string') {
        errors.push(`${prefix}.label must be a string when present`);
      }
      if (edge.linkShape !== undefined && edge.linkShape !== 'visio' && edge.linkShape !== 'bezier') {
        errors.push(`${prefix}.linkShape must be "visio" or "bezier" when present`);
      }
    });
  }
  return { valid: errors.length === 0, errors };
}

function createEmptyLoadReport(): FlowLoadReport {
  return { loaded: false, nodes: 0, edges: 0, skipped: [] };
}

/**
 * @class FlowDesigner 流程图应用层
 *
 * 与 EntityDesigner 同构：在通用图元之上把「建节点 / 连线 / 选中 / 增删改 /
 * 撤销重做 / 快照存取」串成闭环。不改变引擎语义，也不依赖具体页面框架。
 */
export default class FlowDesigner {
  public ice: ICE;
  public selectedId: string | null = null;

  private __undoStack: string[] = [];
  private __redoStack: string[] = [];
  private __historyEnabled = true;
  private __maxHistory = 100;
  private __listeners: Array<(snapshot: string, designer: FlowDesigner) => void> = [];
  private __mousedownHandler = (evt: any) => this.__handleMouseDown(evt);

  constructor(ice: ICE) {
    this.ice = ice;
    this.ice.registerType(FlowNode.typeId, FlowNode as any);
    this.ice.registerType(FlowEdge.typeId, FlowEdge as any);
    this.ice.evtBus.on('mousedown', this.__mousedownHandler, this);
  }

  public get nodes(): any[] {
    return this.ice.childNodes.filter(
      (item: any) => item && item.constructor && item.constructor.typeId === FlowNode.typeId
    );
  }

  public get edges(): any[] {
    return this.ice.childNodes.filter(
      (item: any) => item && item.constructor && item.constructor.typeId === FlowEdge.typeId
    );
  }

  public get selected(): any {
    return this.selectedId ? this.ice.findComponent(this.selectedId) : null;
  }

  /**
   * 订阅流程变更（增删改 / 连线 / 载入 / undo / redo 之后触发）。
   * 回调参数是当前流程的快照（与 serialize() 一致）。
   */
  public subscribe(listener: (snapshot: string, designer: FlowDesigner) => void): () => void {
    if (typeof listener !== 'function') {
      return () => undefined;
    }
    this.__listeners.push(listener);
    return () => {
      const index = this.__listeners.indexOf(listener);
      if (index !== -1) {
        this.__listeners.splice(index, 1);
      }
    };
  }

  private __emitChange(): void {
    if (!this.__listeners.length) {
      return;
    }
    const snapshot = this.serialize();
    this.__listeners.slice().forEach((listener) => listener(snapshot, this));
  }

  public select(id: string | null): this {
    this.selectedId = id;
    this.__emitChange();
    return this;
  }

  /** 没有给坐标时，按已有节点包围盒的下方网格错开摆放，避免新建节点互相压住 */
  private __defaultPlacement(width: number, height: number): { left: number; top: number } {
    const nodes = this.nodes;
    if (!nodes.length) {
      return { left: 120, top: 120 };
    }
    let minX = Infinity;
    let maxY = -Infinity;
    nodes.forEach((node: any) => {
      const box = node.getMinBoundingBox(true);
      minX = Math.min(minX, box.tl[0]);
      maxY = Math.max(maxY, box.br[1]);
    });
    const index = nodes.length;
    return { left: minX + (index % 4) * 280, top: maxY + 80 + Math.floor(index / 4) * (height + 90) };
  }

  public createNode(kind: FlowNodeKind, props: any = {}): any {
    this.__captureHistory();
    const node = new FlowNode({ kind, ...props });
    if (props.left === undefined || props.top === undefined) {
      const placement = this.__defaultPlacement(node.state.width, node.state.height);
      node.setState({
        left: props.left === undefined ? placement.left : props.left,
        top: props.top === undefined ? placement.top : props.top,
      });
    }
    this.ice.addChild(node);
    this.selectedId = node.state.id;
    this.__emitChange();
    return node;
  }

  /** 由节点的插槽位置算出连线端点（引擎按插槽吸附，端点需要给出初始坐标） */
  private __slotPoint(component: any, position: FlowPort): number[] {
    const box = component.getMinBoundingBox(true);
    switch (position) {
      case 'T':
        return [...box.tc];
      case 'R':
        return [...box.rc];
      case 'B':
        return [...box.bc];
      case 'L':
        return [...box.lc];
      case 'C':
      default:
        return [...box.center];
    }
  }

  public createEdge(props: any = {}): any {
    const source = props.sourceId ? this.ice.findComponent(props.sourceId) : null;
    const target = props.targetId ? this.ice.findComponent(props.targetId) : null;
    if (!source || !target) {
      throw new Error('连接两端必须是已存在的节点');
    }
    this.__captureHistory();
    const sourcePort: FlowPort = props.sourcePort || 'B';
    const targetPort: FlowPort = props.targetPort || 'T';
    const edge = new FlowEdge({
      links: { start: { id: props.sourceId, position: sourcePort }, end: { id: props.targetId, position: targetPort } },
      startPoint: this.__slotPoint(source, sourcePort),
      endPoint: this.__slotPoint(target, targetPort),
      label: props.label || '',
      linkShape: props.linkShape || 'visio',
      style: props.style,
      labelStyle: props.labelStyle,
    });
    this.ice.addChild(edge);
    this.selectedId = edge.state.id;
    this.__emitChange();
    return edge;
  }

  public updateNode(id: string, patch: Record<string, any>): any {
    const node = this.ice.findComponent(id);
    if (node && node.constructor.typeId === FlowNode.typeId) {
      this.__captureHistory();
      node.applyPatch(patch);
      this.__emitChange();
    }
    return node;
  }

  public updateEdge(id: string, patch: Record<string, any>): any {
    const edge = this.ice.findComponent(id);
    if (edge && edge.constructor.typeId === FlowEdge.typeId) {
      this.__captureHistory();
      edge.setState(patch);
      edge.dirty = true;
      this.__emitChange();
    }
    return edge;
  }

  /** 删除节点（连带删除挂在它两端的连线）或删除一条连线 */
  public remove(id: string): void {
    const component = this.ice.findComponent(id);
    if (!component) {
      return;
    }
    this.__captureHistory();
    if (component.constructor.typeId === FlowNode.typeId) {
      this.edges
        .filter((edge: any) => {
          const links = edge.state.links || {};
          return (links.start && links.start.id === id) || (links.end && links.end.id === id);
        })
        .forEach((edge: any) => this.ice.removeChild(edge));
    }
    this.ice.removeChild(component);
    if (this.selectedId === id) {
      this.selectedId = null;
    }
    this.__emitChange();
  }

  public clear(): void {
    this.__captureHistory();
    this.ice.clearAll();
    this.selectedId = null;
    this.__emitChange();
  }

  public serialize(): string {
    return JSON.stringify(this.toSnapshot());
  }

  public toSnapshot(): FlowSnapshot {
    return {
      version: 1,
      kind: 'flowchart',
      nodes: this.nodes.map((node: any) => node.toFlowObject()),
      edges: this.edges.map((edge: any) => edge.toFlowObject()),
    };
  }

  /**
   * 载入流程图快照（整体替换当前流程）。
   *
   * @throws 结构非法时抛错；此时当前流程与历史栈都不会被改动。
   */
  public load(json: string): FlowLoadReport {
    if (!json) {
      return createEmptyLoadReport();
    }
    const data = JSON.parse(json);
    if (!data || !Array.isArray(data.nodes)) {
      return createEmptyLoadReport();
    }
    const validation = validateFlowSnapshot(data);
    if (!validation.valid) {
      throw new Error(`Invalid flow snapshot:\n${validation.errors.join('\n')}`);
    }

    // 先校验再动历史栈：非法输入不该污染 undo/redo，也不该清空当前流程
    this.__captureHistory();
    const report: FlowLoadReport = { loaded: true, nodes: 0, edges: 0, skipped: [] };
    this.__clearAndBuild(data, report);
    this.__emitChange();
    return report;
  }

  /** 用快照数据重建整张流程图（不发变更广播，由调用方决定广播时机） */
  private __clearAndBuild(data: any, report: FlowLoadReport): void {
    this.ice.clearAll();
    this.selectedId = null;

    (data.nodes || []).forEach((item: any) => {
      if (item.typeId !== undefined && item.typeId !== FlowNode.typeId) {
        report.skipped.push(String(item.typeId));
        return;
      }
      const node = new FlowNode(item);
      delete node.state.typeId;
      this.ice.addChild(node);
      report.nodes += 1;
    });
    (data.edges || []).forEach((item: any) => {
      if (item.typeId !== undefined && item.typeId !== FlowEdge.typeId) {
        report.skipped.push(String(item.typeId));
        return;
      }
      // 快照里的连线是语义形式（sourceId/targetId/sourcePort/targetPort），
      // 这里还原成引擎需要的 links（缺失宿主的悬空连线保持无 links）
      const sourceId = item.sourceId || (item.links && item.links.start && item.links.start.id) || null;
      const targetId = item.targetId || (item.links && item.links.end && item.links.end.id) || null;
      const sourcePort = item.sourcePort || (item.links && item.links.start && item.links.start.position) || 'B';
      const targetPort = item.targetPort || (item.links && item.links.end && item.links.end.position) || 'T';
      const links =
        sourceId && targetId
          ? { start: { id: sourceId, position: sourcePort }, end: { id: targetId, position: targetPort } }
          : item.links;
      const edge = new FlowEdge({
        ...item,
        links,
        startPoint: item.startPoint || [0, 0],
        endPoint: item.endPoint || [10, 10],
      });
      delete edge.state.typeId;
      this.ice.addChild(edge);
      report.edges += 1;
    });
  }

  /** 把整个流程缩放到画布可视区内 */
  public fitViewport(padding = 80): void {
    const nodes = this.nodes;
    const canvasWidth = (this.ice as any).canvasWidth || 0;
    const canvasHeight = (this.ice as any).canvasHeight || 0;
    if (!nodes.length || !canvasWidth || !canvasHeight) {
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    nodes.forEach((node: any) => {
      const box = node.getMinBoundingBox(true);
      minX = Math.min(minX, box.tl[0]);
      minY = Math.min(minY, box.tl[1]);
      maxX = Math.max(maxX, box.br[0]);
      maxY = Math.max(maxY, box.br[1]);
    });
    const contentWidth = Math.max(maxX - minX, 1);
    const contentHeight = Math.max(maxY - minY, 1);
    const scale = Math.min(
      (canvasWidth - padding * 2) / contentWidth,
      (canvasHeight - padding * 2) / contentHeight,
      1.25
    );
    const tx = (canvasWidth - contentWidth * scale) / 2 - minX * scale;
    const ty = (canvasHeight - contentHeight * scale) / 2 - minY * scale;
    this.ice.setViewport(scale, tx, ty);
  }

  public canUndo(): boolean {
    return this.__undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.__redoStack.length > 0;
  }

  public captureHistory(): void {
    this.__captureHistory();
  }

  /** 清空撤销/重做栈（用于「载入示例」这类不该占用历史的初始化操作） */
  public resetHistory(): void {
    this.__undoStack.length = 0;
    this.__redoStack.length = 0;
  }

  private __captureHistory(): void {
    if (!this.__historyEnabled) {
      return;
    }
    this.__undoStack.push(this.serialize());
    if (this.__undoStack.length > this.__maxHistory) {
      this.__undoStack.shift();
    }
    this.__redoStack.length = 0;
  }

  private __applySnapshot(json: string): void {
    // 历史栈里的快照是本类自己序列化出来的，结构必然合法，不再重复校验
    this.__clearAndBuild(JSON.parse(json), { loaded: true, nodes: 0, edges: 0, skipped: [] });
  }

  /**
   * 撤销：先记账（把当前状态压入 redo、从 undo 弹出目标），再回放目标快照，
   * 最后统一广播 —— 顺序很关键：若先广播再记账，订阅方（属性面板 / 工具条按钮）
   * 读到的会是旧栈状态，出现「canRedo() 为 true 但按钮仍 disabled」这类不一致。
   */
  public undo(): void {
    if (!this.canUndo()) {
      return;
    }
    const current = this.serialize();
    const previous = this.__undoStack.pop() as string;
    this.__redoStack.push(current);
    this.__historyEnabled = false;
    try {
      this.__applySnapshot(previous);
    } catch (error) {
      this.__redoStack.pop();
      this.__undoStack.push(previous);
      throw error;
    } finally {
      // 回放失败也必须恢复历史开关，否则后续操作都不再入栈
      this.__historyEnabled = true;
    }
    this.__emitChange();
  }

  public redo(): void {
    if (!this.canRedo()) {
      return;
    }
    const current = this.serialize();
    const next = this.__redoStack.pop() as string;
    this.__undoStack.push(current);
    this.__historyEnabled = false;
    try {
      this.__applySnapshot(next);
    } catch (error) {
      this.__undoStack.pop();
      this.__redoStack.push(next);
      throw error;
    } finally {
      this.__historyEnabled = true;
    }
    this.__emitChange();
  }

  private __handleMouseDown(evt: any): void {
    const component = evt && evt.param && evt.param.component;
    if (!component) {
      return;
    }
    let root = component;
    while (root.parentNode) {
      root = root.parentNode;
    }
    const typeId = root.constructor && root.constructor.typeId;
    if (typeId === FlowNode.typeId || typeId === FlowEdge.typeId) {
      this.select(root.state.id);
    }
  }

  public dispose(): void {
    this.ice.evtBus.off('mousedown', this.__mousedownHandler, this);
  }
}
