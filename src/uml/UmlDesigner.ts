/**
 * Copyright (c) 2022 大漠穷秋.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import FlowDesigner from '../flow/FlowDesigner';
import UmlClass from './UmlClass';
import UmlRelation, { UML_RELATION_STYLE, UML_RELATION_KINDS } from './UmlRelation';
import type { UmlRelationKind } from './UmlRelation';
import { registerIEDType } from '../utils/type-registry';

export type UmlIssue = { level: 'error' | 'warning'; message: string; id?: string };

/**
 * @class UmlDesigner UML 类图设计器（域包 = 形状 + 应用层 + 校验 + 互操作 + 文档）
 *
 * 它是 `FlowDesigner` 的**薄扩展**，只做四件事，其余（选择、增删改、连线、撤销重做、
 * 快照存取、适应视图、订阅）全部继承：
 *
 * 1. 建 UML 图元（`UmlClass` / `UmlRelation`）而不是流程图的 FlowNode/FlowEdge；
 * 2. 节点/连线的**类型过滤**换成 UML 类型；
 * 3. UML **语义校验**（重名类、悬空关系、继承环）。
 *
 * 之所以能这么薄：类框是复合组件（内部三段由 state 派生），关系是折线（标记进路径点集），
 * 快照直接复用引擎序列化（typeId 注册表 + hasDerivedChildren）。
 */
export default class UmlDesigner extends FlowDesigner {
  constructor(ice: any) {
    super(ice);
    registerIEDType(this.ice, UmlClass);
    registerIEDType(this.ice, UmlRelation);
  }

  /** 只认 UML 类框（继承来的 FlowNode 过滤换掉） */
  public get nodes(): any[] {
    return this.__flatten().filter((item: any) => item.constructor && item.constructor.typeId === UmlClass.typeId);
  }

  /** 只认 UML 关系线 */
  public get edges(): any[] {
    return this.__flatten().filter((item: any) => item.constructor && item.constructor.typeId === UmlRelation.typeId);
  }

  /** 建一个类/接口/枚举（`createNode` 的 UML 语义版本） */
  public createClass(props: any = {}): any {
    this.__captureHistory();
    const node = new UmlClass(props);
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

  /** 建一条 UML 关系（继承 / 实现 / 关联 / 聚合 / 组合 / 依赖） */
  public createRelation(props: any = {}): any {
    const source = props.sourceId ? this.ice.findComponent(props.sourceId) : null;
    const target = props.targetId ? this.ice.findComponent(props.targetId) : null;
    if (!source || !target) {
      throw new Error('关系两端必须是已存在的类');
    }
    this.__captureHistory();
    const sourcePort = props.sourcePort || 'R';
    const targetPort = props.targetPort || 'L';
    const relation = new UmlRelation({
      // id 由调用方决定（DSL 往返要用它引用这条关系）
      id: props.id,
      links: { start: { id: props.sourceId, position: sourcePort }, end: { id: props.targetId, position: targetPort } },
      startPoint: this.__portPoint(source, sourcePort),
      endPoint: this.__portPoint(target, targetPort),
      relationKind: props.relationKind || 'association',
      label: props.label || '',
      linkShape: props.linkShape || 'visio',
      style: props.style,
      labelStyle: props.labelStyle,
    });
    this.ice.addChild(relation);
    this.selectedId = relation.state.id;
    this.__emitChange();
    return relation;
  }

  /** 改关系种类：记法（线型 + 端点标记 + 填充）随之一并更新 */
  public setRelationKind(id: string, relationKind: UmlRelationKind): any {
    const relation = this.ice.findComponent(id);
    if (relation && relation.constructor.typeId === UmlRelation.typeId) {
      this.__captureHistory();
      relation.applyPatch({ relationKind });
      this.__emitChange();
    }
    return relation;
  }

  /** 关系种类清单（属性面板/DSL 共用同一份词汇表） */
  public get relationKinds(): string[] {
    return [...UML_RELATION_KINDS];
  }

  /**
   * UML 语义校验（结构之外的部分）：
   * - 类名重复（同一张图里两个类无法区分）；
   * - 关系两端必须都还在（删除类时引擎会级联删关系，这里是防御性的）；
   * - 继承/实现的**成环**（A 继承 B、B 又继承 A —— 类型系统不成立）。
   */
  public validateUml(): UmlIssue[] {
    const issues: UmlIssue[] = [];
    const classes = this.nodes;

    const byName = new Map<string, any[]>();
    classes.forEach((cls) => {
      const name = String(cls.state.className || '').trim();
      if (!name) {
        issues.push({ level: 'error', message: '存在未命名的类', id: cls.state.id });
        return;
      }
      if (!byName.has(name)) {
        byName.set(name, []);
      }
      byName.get(name)!.push(cls);
    });
    byName.forEach((list, name) => {
      if (list.length > 1) {
        issues.push({ level: 'error', message: `类名重复：${name}（${list.length} 个）`, id: list[0].state.id });
      }
    });

    const classIds = new Set(classes.map((cls) => cls.state.id));
    const inheritance = new Map<string, string[]>();
    this.edges.forEach((edge) => {
      const links = edge.state.links || {};
      const from = links.start && links.start.id;
      const to = links.end && links.end.id;
      if (!from || !to || !classIds.has(from) || !classIds.has(to)) {
        issues.push({ level: 'error', message: '关系两端必须都是已存在的类', id: edge.state.id });
        return;
      }
      if (edge.state.relationKind === 'inheritance' || edge.state.relationKind === 'realization') {
        if (!inheritance.has(from)) {
          inheritance.set(from, []);
        }
        inheritance.get(from)!.push(to);
      }
    });

    // 继承环：DFS 染色（白/灰/黑）
    const state = new Map<string, number>();
    const stack: string[] = [];
    const visit = (id: string): boolean => {
      state.set(id, 1);
      stack.push(id);
      for (const next of inheritance.get(id) || []) {
        const color = state.get(next) || 0;
        if (color === 1) {
          const from = stack.indexOf(next);
          const cycle = stack.slice(from >= 0 ? from : 0).concat(next);
          const names = cycle.map((cid) => {
            const cls = classes.find((item) => item.state.id === cid);
            return cls ? cls.state.className : cid;
          });
          issues.push({ level: 'error', message: `继承关系成环：${names.join(' → ')}`, id });
          state.set(id, 2);
          stack.pop();
          return true;
        }
        if (color === 0 && visit(next)) {
          state.set(id, 2);
          stack.pop();
          return true;
        }
      }
      state.set(id, 2);
      stack.pop();
      return false;
    };
    classes.forEach((cls) => {
      if ((state.get(cls.state.id) || 0) === 0) {
        visit(cls.state.id);
      }
    });

    return issues;
  }

  /** 关系记法的可读描述（属性面板/文档共用，避免三处各写一份文案） */
  public static describeRelationKind(kind: UmlRelationKind): string {
    const notation = UML_RELATION_STYLE[kind];
    if (!notation) {
      return '';
    }
    const line = notation.dashed ? '虚线' : '实线';
    const marker =
      notation.marker === 'triangle'
        ? '空心三角'
        : notation.marker === 'diamond'
        ? notation.filled
          ? '实心菱形'
          : '空心菱形'
        : notation.marker === 'open'
        ? '开放箭头'
        : '无端点标记';
    return `${line} + ${marker}`;
  }

  /** 端口点：与 FlowDesigner 的插槽语义一致（T/R/B/L/C），这里按 UML 常用左右出发 */
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
