/**
 * Copyright (c) 2022 大漠穷秋.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/**
 * 给水排水工艺流程图应用层。
 *
 * 复用流程图应用层的选择 / 增删改 / 连线 / 历史 / 快照 / 导出 / 适应视图，
 * 只补三件这一行特有的东西：
 * 1. **管线带介质与管径**（污水 / 出水 / 混合液回流 / 回流污泥 / 剩余污泥 / 空气 / 药剂），
 *    并按介质着色与定线型 —— 给排水图纸靠这个把水线、泥线、空气线分开；
 * 2. **工艺校验** `validateWater()`：位号唯一、单元要有进出线、管线要标介质与管径、
 *    出水路径上必须有在线监测（排污许可要求联网）、剩余污泥要有出路、AAO 要有内回流；
 * 3. **流径分析** `traceFlow()`：从进水沿管线走到出水，阀门关断即视为断流 ——
 *    相当于电力一次图里的「带电分析」，用来看运行工况（关掉某条超越管之后还通不通）。
 */
import FlowDesigner from '../flow/FlowDesigner';
import FlowEdge from '../flow/FlowEdge';
import WaterSymbol, { WATER_MEDIUM_STYLES, WATER_SYMBOL_PRESETS } from './water_shapes';
import type { WaterMedium, WaterSymbolKind, WaterValveState } from './water_shapes';
import { registerIEDType } from '../utils/type-registry';

export type WaterIssue = {
  level: 'error' | 'warning';
  code: string;
  message: string;
  id?: string;
};

export type WaterFlowTrace = {
  /** 从进水能否走到出水 */
  connected: boolean;
  /** 途经符号 id（连不上时为空） */
  path: string[];
  /** 到达的出水符号 id */
  outletId?: string;
  /** 卡在哪个关断的阀门上（连不上时给出） */
  blockedAt?: string;
};

/** 管线标注：`DN400 污水` 这种「管径 + 介质」是给排水图纸的通行写法 */
export function composePipeLabel(medium: WaterMedium, dn: string): string {
  const style = WATER_MEDIUM_STYLES[medium] || WATER_MEDIUM_STYLES.sewage;
  const size = String(dn || '').trim();
  return size ? `${size} ${style.label}` : style.label;
}

/**
 * @class WaterPipe 工艺管线（污水 / 污泥 / 空气 / 药剂…）
 *
 * 一条线 = 一段管线，介质与管径写在线上；线型与颜色跟介质走。
 */
export class WaterPipe extends FlowEdge {
  public static readonly typeId = 'ice-entity-designer:WaterPipe';

  /** 按当前介质刷新线型、颜色与标注 */
  public applyMediumStyle(): void {
    const medium = (this.state.medium || 'sewage') as WaterMedium;
    const style = WATER_MEDIUM_STYLES[medium] || WATER_MEDIUM_STYLES.sewage;
    const label =
      this.state.label === undefined || this.state.label === ''
        ? composePipeLabel(medium, this.state.dn)
        : this.state.label;
    this.setState({
      lineType: style.lineType,
      label,
      style: { ...(this.state.style || {}), strokeStyle: style.color, fillStyle: style.color },
    } as any);
  }

  /** 改介质（属性面板 / 运行工况用） */
  public setMedium(medium: WaterMedium, dn?: string): void {
    this.setState({ medium, label: '', dn: dn === undefined ? this.state.dn : dn } as any);
    this.applyMediumStyle();
  }
}

export default class WaterProcessDesigner extends FlowDesigner {
  constructor(ice: any) {
    super(ice);
    registerIEDType(this.ice, WaterSymbol);
    registerIEDType(this.ice, WaterPipe);
  }

  public get nodes(): any[] {
    return this.__flatten().filter((item: any) => item.constructor && item.constructor.typeId === WaterSymbol.typeId);
  }

  public get edges(): any[] {
    return this.__flatten().filter((item: any) => item.constructor && item.constructor.typeId === WaterPipe.typeId);
  }

  /** 建一个符号（处理单元 / 设备 / 边界） */
  public createSymbol(kind: WaterSymbolKind, props: any = {}): any {
    this.__captureHistory();
    const node = new WaterSymbol({ kind, ...props });
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

  /** 建一段管线（要标介质；管径缺了会给 warning） */
  public createPipe(props: any = {}): any {
    const source = props.sourceId ? this.ice.findComponent(props.sourceId) : null;
    const target = props.targetId ? this.ice.findComponent(props.targetId) : null;
    if (!source || !target) {
      throw new Error('管线两端必须是已存在的符号');
    }
    this.__captureHistory();
    const sourcePort = props.sourcePort || 'B';
    const targetPort = props.targetPort || 'T';
    const pipe = new WaterPipe({
      // id 由调用方决定（DSL 往返要用它引用这段管线）
      id: props.id,
      links: { start: { id: props.sourceId, position: sourcePort }, end: { id: props.targetId, position: targetPort } },
      startPoint: this.__slotPoint(source, sourcePort),
      endPoint: this.__slotPoint(target, targetPort),
      medium: props.medium || 'sewage',
      dn: props.dn || '',
      label: props.label,
      arrow: props.arrow || 'end',
      linkShape: props.linkShape || 'visio',
    });
    if (props.label === undefined) {
      pipe.applyMediumStyle();
    }
    this.ice.addChild(pipe);
    this.selectedId = pipe.state.id;
    this.__emitChange();
    return pipe;
  }

  /** 阀门开 / 闭（运行工况：关阀 → 流径断开） */
  public setValveState(id: string, valveState: WaterValveState): any {
    const node = this.__symbolById(id);
    if (!node) {
      throw new Error('找不到该符号：' + id);
    }
    if (node.state.kind !== 'valve') {
      throw new Error('只有阀门能改开 / 闭状态');
    }
    node.applyPatch({ valveState });
    this.ice.dirty = true;
    return node;
  }

  /**
   * 流径分析：从进水（`inlet`）沿管线走到出水（`outlet`），**关断的阀门不通行**。
   * 相当于电力一次图的「带电分析」，用来回答「这个工况下还通不通」。
   */
  public traceFlow(fromId?: string): WaterFlowTrace {
    const starts = fromId
      ? [fromId]
      : this.nodes.filter((node: any) => node.state.kind === 'inlet').map((node: any) => node.state.id);
    const adjacency = this.__adjacency();
    const visited = new Set<string>(starts);
    const prev = new Map<string, string>();
    const queue: string[] = [...starts];
    let outletId: string | undefined;
    let blockedAt: string | undefined;

    while (queue.length) {
      const current = queue.shift() as string;
      const node = this.__symbolById(current);
      if (!node) continue;
      // 关断的阀门：不往下游扩散
      if (node.state.kind === 'valve' && node.state.valveState === 'closed') continue;
      if (node.state.kind === 'outlet') {
        outletId = current;
        break;
      }
      (adjacency.get(current) || []).forEach((item) => {
        const next = this.__symbolById(item.to);
        if (next && next.state.kind === 'valve' && next.state.valveState === 'closed') {
          if (!blockedAt) blockedAt = item.to;
          return;
        }
        if (!visited.has(item.to)) {
          visited.add(item.to);
          prev.set(item.to, current);
          queue.push(item.to);
        }
      });
    }

    const path: string[] = [];
    if (outletId) {
      let cursor: string | undefined = outletId;
      while (cursor) {
        path.unshift(cursor);
        cursor = prev.get(cursor);
      }
    }
    const trace: WaterFlowTrace = { connected: !!outletId, path };
    if (outletId) trace.outletId = outletId;
    if (!outletId && blockedAt) trace.blockedAt = blockedAt;
    return trace;
  }

  /**
   * 工艺校验。规则都是"图上可判定"的，不涉及水力计算（那是专业水力软件的事）。
   */
  public validateWater(): WaterIssue[] {
    const issues: WaterIssue[] = [];
    const symbols = this.nodes;
    const pipes = this.edges;

    // 1) 位号唯一
    const seen = new Map<string, string>();
    symbols.forEach((symbol: any) => {
      const tag = String(symbol.state.tag || '').trim();
      if (!tag) return;
      if (seen.has(tag)) {
        issues.push({ level: 'error', code: 'duplicate-tag', message: `位号重复：${tag}`, id: symbol.state.id });
      } else {
        seen.set(tag, symbol.state.id);
      }
    });

    // 2) 孤立符号：没有任何管线
    const degree = new Map<string, number>();
    pipes.forEach((pipe: any) => {
      const start = this.__linkId(pipe, 'start');
      const end = this.__linkId(pipe, 'end');
      [start, end].forEach((id) => {
        if (!id) return;
        degree.set(id, (degree.get(id) || 0) + 1);
      });
    });
    symbols.forEach((symbol: any) => {
      if (!degree.get(symbol.state.id)) {
        issues.push({
          level: 'warning',
          code: 'isolated-symbol',
          message: `「${
            symbol.state.name || WATER_SYMBOL_PRESETS[symbol.state.kind as WaterSymbolKind]?.label || symbol.state.kind
          }」没有任何管线`,
          id: symbol.state.id,
        });
      }
    });

    // 3) 管线必须标介质与管径（图纸审查的高频问题）
    pipes.forEach((pipe: any) => {
      if (!pipe.state.medium) {
        issues.push({ level: 'warning', code: 'pipe-missing-medium', message: '管线缺少介质标注', id: pipe.state.id });
      }
      if (!String(pipe.state.dn || '').trim()) {
        issues.push({
          level: 'warning',
          code: 'pipe-missing-dn',
          message: '管线缺少管径标注（DN）',
          id: pipe.state.id,
        });
      }
    });

    // 4) 出水路径：断流是 error；路径上必须有在线监测（排污许可要求联网）
    const trace = this.traceFlow();
    if (!trace.connected) {
      issues.push({
        level: 'error',
        code: 'flow-disconnected',
        message: trace.blockedAt ? '从进水走不到出水：管线在关断的阀门处断开' : '从进水走不到出水：主流程未接通',
        id: trace.blockedAt,
      });
    } else {
      const hasAnalyzer = trace.path.some((id) => {
        const node = this.__symbolById(id);
        return !!node && node.state.kind === 'analyzer';
      });
      if (!hasAnalyzer) {
        issues.push({
          level: 'error',
          code: 'outlet-without-analyzer',
          message: '出水管线上没有在线水质分析仪（排污许可要求在线监测并联网）',
        });
      }
    }

    // 5) 剩余污泥必须有出路（浓缩 / 脱水 / 外运至少有一个）
    const hasWasteSludge = pipes.some((pipe: any) => pipe.state.medium === 'sludge');
    const hasDisposal = symbols.some(
      (symbol: any) => ['sludgeThickener', 'dewateringMachine', 'sludgeOut'].indexOf(symbol.state.kind) !== -1
    );
    if (hasWasteSludge && !hasDisposal) {
      issues.push({
        level: 'warning',
        code: 'sludge-without-disposal',
        message: '有剩余污泥排出，但图上没有污泥浓缩 / 脱水 / 外运单元',
      });
    }

    // 6) AAO 的工艺合理性：有好氧池与缺氧池，就必须有混合液内回流
    const hasAerobic = symbols.some((symbol: any) => symbol.state.kind === 'aerobicTank');
    const hasAnoxic = symbols.some((symbol: any) => symbol.state.kind === 'anoxicTank');
    const hasRecycle = pipes.some((pipe: any) => pipe.state.medium === 'recycle');
    if (hasAerobic && hasAnoxic && !hasRecycle) {
      issues.push({
        level: 'warning',
        code: 'aao-missing-recycle',
        message: '有好氧池与缺氧池，但缺少混合液内回流（好氧 → 缺氧）',
      });
    }

    return issues;
  }

  // ---------------- 内部 ----------------

  private __linkId(pipe: any, end: 'start' | 'end'): string | null {
    const links = pipe.state && pipe.state.links;
    const slot = links && links[end];
    return slot && slot.id ? slot.id : null;
  }

  private __adjacency(): Map<string, Array<{ to: string; pipe: any }>> {
    const map = new Map<string, Array<{ to: string; pipe: any }>>();
    this.edges.forEach((pipe: any) => {
      const start = this.__linkId(pipe, 'start');
      const end = this.__linkId(pipe, 'end');
      if (!start || !end) return;
      if (!map.has(start)) map.set(start, []);
      if (!map.has(end)) map.set(end, []);
      (map.get(start) as any[]).push({ to: end, pipe });
      (map.get(end) as any[]).push({ to: start, pipe });
    });
    return map;
  }

  private __symbolById(id: string): any {
    return this.nodes.filter((node: any) => node.state.id === id)[0] || null;
  }
}
