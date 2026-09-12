/**
 * Copyright (c) 2022 大漠穷秋.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/**
 * 二次回路（保护 / 电流电压回路 / 端子排）应用层 —— 简化版第一刀。
 *
 * 与一次侧的差别不在实现，而在**图种**：二次图是回路图（一条线 = 一个具体回路），
 * 所以导线带**回路编号**（A411/B411/C411/N411）、端子带**端子号**（201…）、
 * 电缆带**电缆编号**（1D1…）。这些在本包里都是数据字段 + 标注，判型仍走 typeId。
 *
 * 记法与范围见 `docs/power-secondary-spec.md`。
 */
import FlowDesigner from '../flow/FlowDesigner';
import FlowEdge from '../flow/FlowEdge';
import SecondarySymbol, { SECONDARY_SYMBOL_PRESETS, TerminalStrip } from './secondary_shapes';
import type { SecondarySymbolKind } from './secondary_shapes';

export type SecondaryIssue = { level: 'error' | 'warning'; message: string; id?: string };

/** 二次回路的导线：复用引擎折线（插槽吸附 / 正交路由 / 标签），额外带回路编号与电缆编号 */
export class SecondaryWire extends FlowEdge {
  public static readonly typeId = 'SecondaryWire';

  constructor(props: any = {}) {
    super({ ...props, arrow: props.arrow || 'none' });
    this.setState({ keepHistory: false });
  }
}

/**
 * @class SecondaryDesigner 二次回路设计器
 *
 * 薄薄一层：建二次元件 / 端子排 / 带回路编号的导线，其余（选择、增删改、撤销重做、快照、
 * 适应视图、订阅）全部继承 `FlowDesigner`。
 */
export default class SecondaryDesigner extends FlowDesigner {
  constructor(ice: any) {
    super(ice);
    this.ice.registerType(SecondarySymbol.typeId, SecondarySymbol as any);
    this.ice.registerType(SecondaryWire.typeId, SecondaryWire as any);
    this.ice.registerType(TerminalStrip.typeId, TerminalStrip as any);
  }

  public get nodes(): any[] {
    return this.__flatten().filter(
      (item: any) =>
        item.constructor &&
        (item.constructor.typeId === SecondarySymbol.typeId || item.constructor.typeId === TerminalStrip.typeId)
    );
  }

  /** 只看元件（含端子排里的端子），不含端子排容器本身 */
  public get symbols(): any[] {
    return this.__flatten().filter(
      (item: any) => item.constructor && item.constructor.typeId === SecondarySymbol.typeId
    );
  }

  public get terminals(): any[] {
    return this.symbols.filter((item: any) => item.state.kind === 'terminal');
  }

  public get edges(): any[] {
    return this.__flatten().filter((item: any) => item.constructor && item.constructor.typeId === SecondaryWire.typeId);
  }

  /** 建一个二次元件（接点 / 按钮 / 切换开关 / 压板 / 信号灯 / 装置 / 绕组 / 端子 / 接地） */
  public createSymbol(kind: SecondarySymbolKind, props: any = {}): any {
    this.__captureHistory();
    const node = new SecondarySymbol({ kind, ...props });
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

  /** 建一条二次导线：`circuitNo` 是回路编号（写在线上），`cableNo` 是电缆编号（数据字段） */
  public createWire(props: any = {}): any {
    const source = props.sourceId ? this.ice.findComponent(props.sourceId) : null;
    const target = props.targetId ? this.ice.findComponent(props.targetId) : null;
    if (!source || !target) {
      throw new Error('二次导线两端必须是已存在的元件');
    }
    this.__captureHistory();
    const sourcePort = props.sourcePort || 'B';
    const targetPort = props.targetPort || 'T';
    const edge = new SecondaryWire({
      // id 由调用方决定（DSL 往返要用它引用这条导线）
      id: props.id,
      links: {
        start: { id: props.sourceId, position: sourcePort },
        end: { id: props.targetId, position: targetPort },
      },
      startPoint: this.__slotPoint(source, sourcePort),
      endPoint: this.__slotPoint(target, targetPort),
      // 二次图里一条线就是一个回路：标签直接写回路编号（A411…）
      label: props.circuitNo || '',
      circuitNo: props.circuitNo || '',
      cableNo: props.cableNo || '',
      style: { strokeStyle: '#475569', fillStyle: '#475569', lineWidth: 1.4 },
      labelStyle: { fontSize: 11, fillStyle: '#1f2937', backgroundColor: '#ffffff' },
    });
    this.ice.addChild(edge);
    this.selectedId = edge.state.id;
    this.__emitChange();
    return edge;
  }

  /**
   * 建一个端子排（容器）：端子是它的**真实子节点**，拖动端子排端子跟着走，端子各自还能接线。
   *
   * 注意：端子排刻意**不声明** `hasDerivedChildren()` —— 复合组件声明后序列化会跳过全部子节点，
   * 端子会在快照往返时整套丢掉（BPMN 池/泳道目前就踩了这个坑）。
   */
  public createTerminalStrip(props: any = {}): any {
    const terminalSpecs: Array<{ no: string; tag?: string }> = props.terminals || [];
    const rowHeight = 34;
    const strip = new TerminalStrip({
      title: props.title || '端子排',
      left: props.left === undefined ? 40 : props.left,
      top: props.top === undefined ? 40 : props.top,
      width: props.width || 96,
      height: Math.max(rowHeight * (terminalSpecs.length + 1), 120),
    });
    this.ice.addChild(strip);
    const created: any[] = [];
    terminalSpecs.forEach((terminal, index) => {
      const node = new SecondarySymbol({
        kind: 'terminal',
        name: terminal.no,
        tag: terminal.tag || '',
        left: (strip.state.width - 28) / 2,
        top: 24 + index * rowHeight,
      });
      strip.addChild(node);
      this.__attachNodeListeners(node);
      created.push(node);
    });
    this.selectedId = strip.state.id;
    this.__emitChange();
    return { strip, terminals: created };
  }

  /**
   * 二次回路语义校验（简化版四条）：
   * 1. 每条导线必须有回路编号；
   * 2. 电流回路三相编号成组（同一数字段上 A/B/C 都要有）；
   * 3. 端子号在同一张图上唯一；
   * 4. 二次回路必须有接地（warning）。
   */
  public validateSecondary(): SecondaryIssue[] {
    const issues: SecondaryIssue[] = [];

    // 1) 回路编号
    this.edges.forEach((edge: any) => {
      const circuitNo = String(edge.state.circuitNo || edge.state.label || '').trim();
      if (!circuitNo) {
        issues.push({
          level: 'error',
          message: '二次导线缺少回路编号（等电位编号是二次图的读图依据）',
          id: edge.state.id,
        });
      }
    });

    // 2) 电流回路三相编号成组
    const groups = new Map<string, Set<string>>();
    this.edges.forEach((edge: any) => {
      const circuitNo = String(edge.state.circuitNo || edge.state.label || '').trim();
      const matched = /^([ABC])(\d+)$/.exec(circuitNo);
      if (!matched) {
        return;
      }
      const phases = groups.get(matched[2]) || new Set<string>();
      phases.add(matched[1]);
      groups.set(matched[2], phases);
    });
    groups.forEach((phases, key) => {
      ['A', 'B', 'C'].forEach((phase) => {
        if (!phases.has(phase)) {
          issues.push({
            level: 'error',
            message: `电流回路编号缺相：${phase}${key} 没有对应的回路（三相电流回路必须成组）`,
          });
        }
      });
    });

    // 3) 端子号唯一
    const seen = new Map<string, any>();
    this.terminals.forEach((terminal: any) => {
      const no = String(terminal.state.name || '').trim();
      if (!no) {
        return;
      }
      if (seen.has(no)) {
        issues.push({ level: 'error', message: `端子号重复：「${no}」在端子排上不唯一`, id: terminal.state.id });
        return;
      }
      seen.set(no, terminal);
    });

    // 4) 必须有接地（二次回路浮空是危险的）
    if (!this.symbols.some((symbol: any) => symbol.state.kind === 'earth')) {
      issues.push({ level: 'warning', message: '二次回路没有接地：电流回路的 N 侧应接地' });
    }

    return issues;
  }

  /** 元件的文字符号预设（属性面板 / 文档用） */
  public presetOf(kind: SecondarySymbolKind): any {
    return SECONDARY_SYMBOL_PRESETS[kind];
  }
}
