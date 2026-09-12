/**
 * Copyright (c) 2022 大漠穷秋.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import FlowDesigner from '../flow/FlowDesigner';
import FlowEdge from '../flow/FlowEdge';
import PowerSymbol, { POWER_SWITCH_KINDS } from './power_shapes';
import type { PowerSymbolKind, PowerSwitchState } from './power_shapes';
import { defaultVoltageColors, voltageColorOf } from './power_voltage';

export type PowerIssue = { level: 'error' | 'warning'; message: string; id?: string };

/**
 * 母线接间隔的几何约定：设备**顶部引线**贴在母线中心线下方这么多像素。
 *
 * 方案 A（零引擎改动）：母线当容器，挂在它上面的间隔用「几何贴合 + 父容器」表达等电位，
 * 不再需要从母线中心拉一条绕行导体。评估见 `ice-render/docs/architecture/16-link-port-evaluation.md`。
 */
export const POWER_BUS_ATTACH_GAP = 3;
/** 判定「仍然挂在母线上」的纵向容差（拖离出这个范围就算断开，走校验提示） */
export const POWER_BUS_ATTACH_TOLERANCE = 8;

export type PowerTopology = {
  /** 带电的设备 id（从电源点出发，只经过处于合位的开关） */
  energized: string[];
  /**
   * 电气连通域（**忽略开关分合**：按「开关全合」算），用于结构检查
   * （比如「这条母线所在连通域里有没有电源」）。
   */
  islands: string[][];
};

/** 一次系统图的导线（导体）—— 复用引擎折线，颜色跟电压等级走 */
export class PowerLine extends FlowEdge {
  public static readonly typeId = 'PowerLine';

  constructor(props: any = {}) {
    super({ ...props, label: props.label || '', style: { ...(props.style || {}) } });
    this.setState({ keepHistory: false });
  }

  /** 电压等级 → 线色（不标等级时用中性色） */
  public applyVoltageColor(table?: Record<string, string>): void {
    const color = voltageColorOf(String(this.state.voltageLevel || ''), table);
    this.setState({
      keepHistory: false,
      style: { ...(this.state.style || {}), strokeStyle: color, fillStyle: color },
    });
  }
}

/**
 * @class PowerDesigner 电力一次系统图（单线图）设计器
 *
 * 域包的应用层，只做四件事，其余（选择 / 增删改 / 连线 / 撤销重做 / 快照 / 适应视图 / 订阅）
 * 全部继承 `FlowDesigner`：
 *
 * 1. 建电力图元（`PowerSymbol`）与导体（`PowerLine`）；
 * 2. **运行态**：开关分合、带电状态写回（供色标与状态标签用）；
 * 3. **拓扑**：导电岛 / 带电范围（从电源点出发，只经过合位开关）；
 * 4. **语义校验**：设备名唯一、电压等级一致（变压器两侧例外）、母线要有进线、
 *    断路器两侧应有隔离开关，以及两条与「五防」直接相关的规则
 *    （**带电合接地刀闸**、**带接地线合闸送电**）。
 */
export default class PowerDesigner extends FlowDesigner {
  /** 色标表（可被公司规范覆盖） */
  public voltageColors: Record<string, string> = defaultVoltageColors();

  constructor(ice: any) {
    super(ice);
    this.ice.registerType(PowerSymbol.typeId, PowerSymbol as any);
    this.ice.registerType(PowerLine.typeId, PowerLine as any);
  }

  public get nodes(): any[] {
    return this.__flatten().filter((item: any) => item.constructor && item.constructor.typeId === PowerSymbol.typeId);
  }

  public get edges(): any[] {
    return this.__flatten().filter((item: any) => item.constructor && item.constructor.typeId === PowerLine.typeId);
  }

  /** 覆盖电压等级色标（各电网公司规范不同） */
  public setVoltageColors(table: Record<string, string>): void {
    this.voltageColors = { ...this.voltageColors, ...(table || {}) };
    this.nodes.forEach((node: any) => node.applyPatch({ voltageColors: this.voltageColors }));
    this.edges.forEach((edge: any) => edge.applyVoltageColor(this.voltageColors));
    this.ice.dirty = true;
  }

  /** 建一个电力设备（母线/断路器/隔离开关/互感器/变压器…） */
  public createSymbol(kind: PowerSymbolKind, props: any = {}): any {
    this.__captureHistory();
    const node = new PowerSymbol({ kind, voltageColors: this.voltageColors, ...props });
    if (props.left === undefined || props.top === undefined) {
      const placement = this.__defaultPlacement(node.state.width, node.state.height);
      node.setState({
        left: props.left === undefined ? placement.left : props.left,
        top: props.top === undefined ? placement.top : props.top,
      });
    }
    this.ice.addChild(node);
    this.__attachNodeListeners(node);
    this.selectedId = node.state.id;
    this.__emitChange();
    return node;
  }

  /** 建一段导体（一次图里的导线） */
  public createLine(props: any = {}): any {
    const source = props.sourceId ? this.ice.findComponent(props.sourceId) : null;
    const target = props.targetId ? this.ice.findComponent(props.targetId) : null;
    if (!source || !target) {
      throw new Error('导体两端必须是已存在的设备');
    }
    this.__captureHistory();
    const sourcePort = props.sourcePort || 'B';
    const targetPort = props.targetPort || 'T';
    const edge = new PowerLine({
      links: { start: { id: props.sourceId, position: sourcePort }, end: { id: props.targetId, position: targetPort } },
      startPoint: this.__slotPoint(source, sourcePort),
      endPoint: this.__slotPoint(target, targetPort),
      voltageLevel: props.voltageLevel || source.state.voltageLevel || target.state.voltageLevel || '',
      arrow: 'none',
      linkShape: 'visio',
    });
    edge.applyVoltageColor(this.voltageColors);
    this.ice.addChild(edge);
    this.selectedId = edge.state.id;
    this.__emitChange();
    return edge;
  }

  /** 开关分 / 合（运行态操作） */
  public setSwitchState(id: string, switchState: PowerSwitchState): any {
    const node = this.__symbolById(id);
    if (!node) {
      return null;
    }
    if (POWER_SWITCH_KINDS.indexOf(node.state.kind) === -1) {
      throw new Error('只有断路器 / 隔离开关 / 负荷开关 / 接地开关才有分合状态');
    }
    this.__captureHistory();
    node.applyPatch({ switchState });
    this.applyTopology();
    this.__emitChange();
    return node;
  }

  /** 标记 / 取消电源点（发电机、进线、主变电源侧…） */
  public setEnergizedSource(id: string, enabled: boolean): any {
    const node = this.__symbolById(id);
    if (!node) {
      return null;
    }
    this.__captureHistory();
    node.setState({ energizedSource: !!enabled });
    this.applyTopology();
    this.__emitChange();
    return node;
  }

  /**
   * 算拓扑并把带电状态写回节点（`energized`）—— 色标与状态标签据此着色。
   *
   * 规则：从电源点出发做 BFS；**只有合位的开关**才允许电流继续往外走
   * （开关自身在分位时仍然算带电，因为它的一端接着电源）。
   */
  public applyTopology(): PowerTopology {
    const topology = this.topology();
    const energized = new Set(topology.energized);
    this.nodes.forEach((node: any) => {
      const next = energized.has(node.state.id);
      if (node.state.energized !== next) {
        node.setState({ energized: next });
      }
    });
    this.ice.dirty = true;
    return topology;
  }

  /** 拓扑分析（不改模型，只算） */
  public topology(): PowerTopology {
    const nodes = this.nodes;
    const byId = new Map<string, any>();
    nodes.forEach((node: any) => byId.set(node.state.id, node));

    const adjacency = this.__buildAdjacency();

    const isClosed = (id: string): boolean => {
      const node = byId.get(id);
      if (!node || POWER_SWITCH_KINDS.indexOf(node.state.kind) === -1) {
        return true; // 非开关设备一律导通
      }
      return node.state.switchState === 'closed';
    };

    // 1) 带电范围：从电源点出发，只穿过合位开关
    const energized = new Set<string>();
    const queue: string[] = [];
    nodes
      .filter((node: any) => node.state.energizedSource)
      .forEach((node: any) => {
        energized.add(node.state.id);
        queue.push(node.state.id);
      });
    while (queue.length) {
      const current = queue.shift() as string;
      (adjacency.get(current) || []).forEach((next) => {
        if (energized.has(next)) {
          return;
        }
        // 分位的开关：它自己算带电（一端带电源），但电流不再往外走
        if (POWER_SWITCH_KINDS.indexOf((byId.get(next) || { state: {} }).state.kind) !== -1 && !isClosed(next)) {
          energized.add(next);
          return;
        }
        if (!isClosed(current) && current !== next) {
          return;
        }
        energized.add(next);
        queue.push(next);
      });
    }

    // 2) 连通域：忽略开关分合（按「开关全合」算），用于结构检查
    const visited = new Set<string>();
    const islands: string[][] = [];
    nodes.forEach((node: any) => {
      if (visited.has(node.state.id)) {
        return;
      }
      const island: string[] = [];
      const stack = [node.state.id];
      visited.add(node.state.id);
      while (stack.length) {
        const current = stack.pop() as string;
        island.push(current);
        (adjacency.get(current) || []).forEach((next) => {
          if (!visited.has(next)) {
            visited.add(next);
            stack.push(next);
          }
        });
      }
      islands.push(island);
    });

    return { energized: Array.from(energized), islands };
  }

  /** 语义校验（结构 + 电压等级 + 与五防相关的两条运行规则） */
  public validatePower(): PowerIssue[] {
    const issues: PowerIssue[] = [];
    const nodes = this.nodes;
    const byId = new Map<string, any>();
    nodes.forEach((node: any) => byId.set(node.state.id, node));

    // 1) 设备名 / 调度编号唯一
    const seenNames = new Map<string, any>();
    nodes.forEach((node: any) => {
      const name = String(node.state.name || '').trim();
      if (!name) {
        return;
      }
      if (seenNames.has(name)) {
        issues.push({
          level: 'error',
          message: `设备编号重复：「${name}」（同一张图上编号必须唯一）`,
          id: node.state.id,
        });
        return;
      }
      seenNames.set(name, node);
    });

    // 2) 电压等级一致：直接相连（中间没有变压器）的两端等级必须一致
    const neighbors = this.__buildAdjacency();
    this.edges.forEach((edge: any) => {
      const links = edge.state.links || {};
      const from = byId.get(links.start && links.start.id);
      const to = byId.get(links.end && links.end.id);
      if (!from || !to) {
        return;
      }
      const a = String(from.state.voltageLevel || '');
      const b = String(to.state.voltageLevel || '');
      // 变压器是电压等级的边界：两侧允许不同
      if (from.state.kind === 'transformer' || to.state.kind === 'transformer') {
        return;
      }
      if (a && b && a !== b) {
        issues.push({
          level: 'error',
          message: `电压等级不一致：${from.state.name || from.state.kind}(${a}) 与 ${
            to.state.name || to.state.kind
          }(${b}) 直接相连，中间没有变压器`,
          id: edge.state.id,
        });
      }
    });

    // 3) 母线要有进线：所在连通域里必须有电源点
    const topology = this.topology();
    const sourceIds = nodes.filter((node: any) => node.state.energizedSource).map((node: any) => node.state.id);
    nodes
      .filter((node: any) => node.state.kind === 'busbar')
      .forEach((busbar: any) => {
        const island = topology.islands.find((group) => group.indexOf(busbar.state.id) !== -1) || [];
        const hasSource = island.some((id) => sourceIds.indexOf(id) !== -1);
        if (!hasSource) {
          issues.push({
            level: 'warning',
            message: `母线「${busbar.state.name || '未命名'}」没有进线电源（该连通域里没有电源点）`,
            id: busbar.state.id,
          });
        }
      });

    // 4) 断路器两侧应各有隔离开关（检修时能形成可见断口）
    nodes
      .filter((node: any) => node.state.kind === 'breaker')
      .forEach((breaker: any) => {
        const around = neighbors.get(breaker.state.id) || [];
        const disconnectors = around.filter((id) => (byId.get(id) || { state: {} }).state.kind === 'disconnector');
        if (disconnectors.length < 2) {
          issues.push({
            level: 'warning',
            message: `断路器「${breaker.state.name || '未命名'}」两侧隔离开关不足（检修时需要可见断口）`,
            id: breaker.state.id,
          });
        }
      });

    // 5) 五防相关：带电合接地刀闸 / 带接地线合闸送电
    const energized = new Set(topology.energized);
    nodes
      .filter((node: any) => node.state.kind === 'earthingSwitch')
      .forEach((earthing: any) => {
        const closed = earthing.state.switchState === 'closed';
        if (!closed) {
          return;
        }
        const around = neighbors.get(earthing.state.id) || [];
        const liveAround = around.filter((id) => energized.has(id));
        if (liveAround.length) {
          issues.push({
            level: 'error',
            message: `带电合接地刀闸：接地开关「${
              earthing.state.name || '未命名'
            }」在合位，且该点带电（五防：禁止带电挂接地线）`,
            id: earthing.state.id,
          });
        }
      });

    // 6) 挂在母线上但已经拖离：隐式连接按几何判定，拖离后需要重新贴合或补一段导体
    nodes.forEach((node: any) => {
      const bus = this.attachedBusOf(node);
      if (bus && !this.isAttachedToBus(node)) {
        issues.push({
          level: 'warning',
          message: `设备「${node.state.name || node.state.kind}」挂在母线「${
            bus.state.name || '未命名'
          }」上但已经拖离，需要重新贴合或补一段导体`,
          id: node.state.id,
        });
      }
    });

    // 7) 孤立设备
    nodes.forEach((node: any) => {
      if ((neighbors.get(node.state.id) || []).length === 0) {
        issues.push({
          level: 'warning',
          message: `设备「${node.state.name || node.state.kind}」没有任何连接（孤立设备）`,
          id: node.state.id,
        });
      }
    });

    return issues;
  }

  /**
   * 把设备挂到母线上（母线 T 接）。
   *
   * 落地形态（方案 A 的精化版，见 `ice-render/docs/architecture/16-link-port-evaluation.md`）：
   * **不把设备变成母线的子节点** —— 复合组件的 `hasDerivedChildren() === true` 会让序列化器
   * 跳过全部子节点，嵌套会让挂上去的设备在快照里直接丢失（实测 23 → 15）。
   * 改成三件事：
   *
   * 1. 设备 state 里记 `attachedBusId`（普通字段，随快照往返）；
   * 2. 位置按「顶部引线贴住母线中心线下方 POWER_BUS_ATTACH_GAP 处」摆放；
   * 3. 拖动母线时由应用层把挂上去的设备一起平移（`__followBusMove`），
   *    设备之间的导体本来就会跟随宿主（引擎能力），所以整条间隔会跟着走。
   *
   * 电气语义：拓扑把「attachedBusId 指向的母线 **且** 几何仍然贴合」当成一条隐式连接，
   * 所以把设备拖开就自动断开，不需要额外的「断开」操作。
   */
  public attachToBus(deviceOrId: any, busOrId: any, options: { centerX?: number } = {}): any {
    const device = typeof deviceOrId === 'string' ? this.__symbolById(deviceOrId) : deviceOrId;
    const bus = typeof busOrId === 'string' ? this.__symbolById(busOrId) : busOrId;
    if (!device || !bus) {
      throw new Error('attachToBus：设备与母线都必须已存在');
    }
    if (bus.state.kind !== 'busbar') {
      throw new Error('attachToBus：第二个参数必须是母线（busbar）');
    }
    if (device === bus) {
      throw new Error('attachToBus：母线不能挂到自己身上');
    }
    const currentBus = this.attachedBusOf(device);
    if (currentBus && currentBus !== bus) {
      throw new Error('attachToBus：设备已经挂在另一条母线上，请先断开');
    }
    this.__captureHistory();
    const busBox = bus.getMinBoundingBox(true);
    const margin = 24;
    const fallbackCenter = device.getMinBoundingBox(true).tc[0];
    const centerX = Math.min(
      Math.max(options.centerX === undefined ? fallbackCenter : options.centerX, busBox.tl[0] + margin),
      busBox.br[0] - margin
    );
    device.setState({
      attachedBusId: bus.state.id,
      left: centerX - device.state.width / 2,
      top: (busBox.tl[1] + busBox.br[1]) / 2 + POWER_BUS_ATTACH_GAP,
    });
    this.__watchBusMove(bus);
    this.applyTopology();
    this.__emitChange();
    return device;
  }

  /** 设备挂在哪条母线上（按 `attachedBusId` 解析；不要求几何仍然贴合） */
  public attachedBusOf(device: any): any {
    const busId = device && device.state && device.state.attachedBusId;
    if (!busId) {
      return null;
    }
    return this.__symbolById(busId);
  }

  /** 设备是否**真的**还挂在母线上（记录 + 几何贴合 + 横向仍落在母线段内；拖离后为 false） */
  public isAttachedToBus(device: any): boolean {
    const bus = this.attachedBusOf(device);
    if (!bus) {
      return false;
    }
    const busBox = bus.getMinBoundingBox(true);
    const deviceBox = device.getMinBoundingBox(true);
    const barY = (busBox.tl[1] + busBox.br[1]) / 2;
    const expectedTop = barY + POWER_BUS_ATTACH_GAP;
    const verticallyAttached = Math.abs(deviceBox.tl[1] - expectedTop) <= POWER_BUS_ATTACH_TOLERANCE;
    const horizontallyOnBus = deviceBox.tc[0] >= busBox.tl[0] && deviceBox.tc[0] <= busBox.br[0];
    return verticallyAttached && horizontallyOnBus;
  }

  /** 解除母线 T 接（设备留在原地，只是不再等电位） */
  public detachFromBus(deviceOrId: any): any {
    const device = typeof deviceOrId === 'string' ? this.__symbolById(deviceOrId) : deviceOrId;
    if (!device) {
      return null;
    }
    this.__captureHistory();
    device.setState({ attachedBusId: '' });
    this.applyTopology();
    this.__emitChange();
    return device;
  }

  /** 母线移动时，把挂在它上面的设备一起平移（应用层补上「容器」那部分行为） */
  private __watchBusMove(bus: any): void {
    if (!bus || bus.__powerBusWatched) {
      return;
    }
    bus.__powerBusWatched = true;
    bus.on(
      'AFTER_MOVE',
      () => {
        const attached = this.nodes.filter((node: any) => node.state.attachedBusId === bus.state.id);
        if (!attached.length) {
          return;
        }
        // 母线自身刚移动过；子设备按「当前母线位置 - 上次记录位置」平移
        const box = bus.getMinBoundingBox(true);
        const last = bus.__powerBusLastBox || box;
        const dx = box.tl[0] - last.tl[0];
        const dy = box.tl[1] - last.tl[1];
        bus.__powerBusLastBox = box;
        if (!dx && !dy) {
          return;
        }
        attached.forEach((node: any) => {
          if (node.getMinBoundingBox) {
            node.setState({ left: node.state.left + dx, top: node.state.top + dy });
          }
        });
      },
      this
    );
    bus.__powerBusLastBox = bus.getMinBoundingBox(true);
  }

  private __buildAdjacency(): Map<string, string[]> {
    const adjacency = new Map<string, string[]>();
    this.nodes.forEach((node: any) => adjacency.set(node.state.id, []));
    const link = (a: string, b: string) => {
      if (!adjacency.has(a) || !adjacency.has(b)) {
        return;
      }
      adjacency.get(a)!.push(b);
      adjacency.get(b)!.push(a);
    };
    this.edges.forEach((edge: any) => {
      const links = edge.state.links || {};
      const from = links.start && links.start.id;
      const to = links.end && links.end.id;
      if (from && to) {
        link(from, to);
      }
    });
    this.nodes.forEach((node: any) => {
      const bus = this.attachedBusOf(node);
      if (bus && this.isAttachedToBus(node)) {
        link(bus.state.id, node.state.id);
      }
    });
    return adjacency;
  }

  private __symbolById(id: string): any {
    return this.nodes.find((node: any) => node.state.id === id) || null;
  }
}
