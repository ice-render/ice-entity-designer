/**
 * Copyright (c) 2022 大漠穷秋.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import FlowDesigner from '../flow/FlowDesigner';
import StateNode from './StateNode';
import StateTransition from './StateTransition';

export type StatechartIssue = { level: 'error' | 'warning'; message: string; id?: string };

/**
 * @class StatechartDesigner 状态机设计器（第二个 domain pack）
 *
 * 与 `UmlDesigner` 同构：`FlowDesigner` 的薄扩展，只做四件事 ——
 * 建状态机图元、类型过滤、**几何自动嵌套**（复合状态是容器）、语义校验。
 * 选择 / 增删改 / 连线 / 撤销重做 / 快照 / 适应视图 / 矢量导出全部继承。
 */
export default class StatechartDesigner extends FlowDesigner {
  private __nesting = false;

  constructor(ice: any) {
    super(ice);
    this.ice.registerType(StateNode.typeId, StateNode as any);
    this.ice.registerType(StateTransition.typeId, StateTransition as any);
  }

  public get nodes(): any[] {
    return this.__flatten().filter((item: any) => item.constructor && item.constructor.typeId === StateNode.typeId);
  }

  public get edges(): any[] {
    return this.__flatten().filter(
      (item: any) => item.constructor && item.constructor.typeId === StateTransition.typeId
    );
  }

  /** 建状态（initial / final / state / composite），复合状态会自动把落在框内的状态收进容器 */
  public createState(props: any = {}): any {
    this.__captureHistory();
    const node = new StateNode(props);
    if (props.left === undefined || props.top === undefined) {
      const placement = this.__defaultPlacement(node.state.width, node.state.height);
      node.setState({
        left: props.left === undefined ? placement.left : props.left,
        top: props.top === undefined ? placement.top : props.top,
      });
    }
    this.ice.addChild(node);
    this.__attachNodeListeners(node);
    this.__nestByGeometry(node);
    this.selectedId = node.state.id;
    this.__emitChange();
    return node;
  }

  /** 建一次转移；两端必须都是状态（否则抛错，与 FlowDesigner.createEdge 同一契约） */
  public createTransition(props: any = {}): any {
    const source = props.sourceId ? this.ice.findComponent(props.sourceId) : null;
    const target = props.targetId ? this.ice.findComponent(props.targetId) : null;
    if (!source || !target) {
      throw new Error('转移两端必须是已存在的状态');
    }
    this.__captureHistory();
    const sourcePort = props.sourcePort || 'R';
    const targetPort = props.targetPort || 'L';
    const edge = new StateTransition({
      links: { start: { id: props.sourceId, position: sourcePort }, end: { id: props.targetId, position: targetPort } },
      startPoint: this.__portPoint(source, sourcePort),
      endPoint: this.__portPoint(target, targetPort),
      event: props.event || '',
      guard: props.guard || '',
      action: props.action || '',
      label: props.label,
      linkShape: props.linkShape || 'visio',
      style: props.style,
      labelStyle: props.labelStyle,
    });
    this.ice.addChild(edge);
    this.selectedId = edge.state.id;
    this.__emitChange();
    return edge;
  }

  /**
   * 几何自动嵌套：新状态的中心落在某个**复合状态**的框内就嵌进去（引擎容器能力）。
   *
   * 与 BPMN 的池/泳道同一套做法：`adoptChild`（**不能**用 removeChild —— 它会 destory 组件），
   * 再把坐标换算成「以父容器左上角为原点」。
   */
  private __nestByGeometry(node: any): void {
    if (this.__nesting || node.constructor.typeId !== StateNode.typeId || node.state.kind === 'composite') {
      return;
    }
    const box = node.getMinBoundingBox(true);
    const cx = (box.tl[0] + box.br[0]) / 2;
    const cy = (box.tl[1] + box.br[1]) / 2;
    const containers = this.nodes
      .filter((item: any) => item !== node && item.state.kind === 'composite')
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
      const dx = container.getMinBoundingBox(true).tl[0];
      const dy = container.getMinBoundingBox(true).tl[1];
      node.setState({ left: node.state.left - dx, top: node.state.top - dy });
      container.adoptChild(node);
    } finally {
      this.__nesting = false;
    }
  }

  /**
   * 状态机语义校验：
   * - 每个状态机要有**初始状态**（否则没有入口）；
   * - **终止状态不应有出边**（它表示流程结束）；
   * - **可达性**：从初始状态出发沿转移走不到的普通状态要提醒（画了但永远到不了）；
   * - 未连接的状态（既没有入边也没有出边）单独提示，和「不可达」区分开。
   */
  public validateStatechart(): StatechartIssue[] {
    const issues: StatechartIssue[] = [];
    const states = this.nodes;
    const initials = states.filter((state) => state.state.kind === 'initial');
    if (states.length && initials.length === 0) {
      issues.push({ level: 'error', message: '缺少初始状态（initial）：状态机没有入口' });
    }

    const outgoing = new Map<string, string[]>();
    const incoming = new Map<string, number>();
    states.forEach((state) => {
      outgoing.set(state.state.id, []);
      incoming.set(state.state.id, 0);
    });
    this.edges.forEach((edge) => {
      const links = edge.state.links || {};
      const from = links.start && links.start.id;
      const to = links.end && links.end.id;
      if (!from || !to || !outgoing.has(from) || !outgoing.has(to)) {
        issues.push({ level: 'error', message: '转移两端必须都是已存在的状态', id: edge.state.id });
        return;
      }
      outgoing.get(from)!.push(to);
      incoming.set(to, (incoming.get(to) || 0) + 1);
    });

    states.forEach((state) => {
      if (state.state.kind === 'final' && (outgoing.get(state.state.id) || []).length > 0) {
        issues.push({ level: 'error', message: '终止状态不应有出边', id: state.state.id });
      }
    });

    // 复合状态的「可达/孤立」由它的**子状态**决定：进入子状态就意味着进入了父状态。
    // 不这样处理的话，一个所有转移都画在子状态上的复合状态会被误报成孤立节点。
    const descendantsOf = (node: any): any[] => {
      const out: any[] = [];
      const walk = (list: any[]) => {
        (list || []).forEach((child: any) => {
          // 只看**状态**：类框/形状与文字是派生内部子组件，不是子状态
          // （把派生形状也算进来的话，任何状态都会「有子节点」，孤立状态就报不出来了）
          if (child.constructor && child.constructor.typeId === StateNode.typeId) {
            out.push(child);
          }
          walk(child.childNodes);
        });
      };
      walk(node.childNodes);
      return out;
    };

    // 可达性（从所有初始状态出发的 BFS）
    const reached = new Set<string>();
    const queue = initials.map((state) => state.state.id);
    queue.forEach((id) => reached.add(id));
    while (queue.length) {
      const current = queue.shift() as string;
      (outgoing.get(current) || []).forEach((next) => {
        if (!reached.has(next)) {
          reached.add(next);
          queue.push(next);
        }
      });
    }
    states.forEach((state) => {
      if (reached.has(state.state.id)) {
        return;
      }
      const children = descendantsOf(state);
      if (children.some((child: any) => reached.has(child.state.id))) {
        // 复合状态：有子状态可达就算可达
        return;
      }
      const noEdge = (incoming.get(state.state.id) || 0) === 0 && (outgoing.get(state.state.id) || []).length === 0;
      if (noEdge && children.length) {
        // 复合状态自己没有转移但有子状态 —— 不是孤立，交给子状态的校验去报
        return;
      }
      const name = state.state.title || state.state.kind;
      issues.push({
        level: 'warning',
        message: noEdge ? `状态「${name}」没有任何转移（孤立节点）` : `状态「${name}」从初始状态不可达`,
        id: state.state.id,
      });
    });

    return issues;
  }

  private __portPoint(component: any, position: string): number[] {
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
}
