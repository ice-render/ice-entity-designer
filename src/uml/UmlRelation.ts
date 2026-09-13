/**
 * Copyright (c) 2022 大漠穷秋.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { ICEPolyLine } from 'ice-render';
import merge from 'lodash/merge';

/** UML 类图里的六种关系（记法见下方 STYLE_BY_KIND） */
export const UML_RELATION_KINDS = [
  'inheritance',
  'realization',
  'association',
  'aggregation',
  'composition',
  'dependency',
] as const;

export type UmlRelationKind = (typeof UML_RELATION_KINDS)[number];

/** 端点标记种类 */
export type UmlMarker = 'none' | 'triangle' | 'diamond' | 'open';

type UmlRelationStyle = {
  marker: UmlMarker;
  /** 标记画在哪一端：整体（owner）一侧 / 目标（被继承、被依赖）一侧 */
  markerEnd: 'start' | 'end';
  filled: boolean;
  dashed: boolean;
};

/**
 * 六种关系的**记法**（UML 2.5 规范）：
 *
 * | 关系 | 线型 | 端点 |
 * |---|---|---|
 * | 继承 generalization | 实线 | 空心三角，指向父类 |
 * | 实现 realization | 虚线 | 空心三角，指向接口 |
 * | 关联 association | 实线 | 无 |
 * | 聚合 aggregation | 实线 | **空心菱形**，在整体一侧 |
 * | 组合 composition | 实线 | **实心菱形**，在整体一侧 |
 * | 依赖 dependency | 虚线 | 开放箭头，指向被依赖方 |
 */
export const UML_RELATION_STYLE: Record<UmlRelationKind, UmlRelationStyle> = {
  inheritance: { marker: 'triangle', markerEnd: 'end', filled: false, dashed: false },
  realization: { marker: 'triangle', markerEnd: 'end', filled: false, dashed: true },
  association: { marker: 'none', markerEnd: 'end', filled: false, dashed: false },
  aggregation: { marker: 'diamond', markerEnd: 'start', filled: false, dashed: false },
  composition: { marker: 'diamond', markerEnd: 'start', filled: true, dashed: false },
  dependency: { marker: 'open', markerEnd: 'end', filled: false, dashed: true },
};

/**
 * 每种关系的语义色（同一张图里「线是什么关系」要能一眼分辨）。
 *
 * 取色原则：继承/实现是**类型关系**（靛蓝系），聚合/组合是**结构关系**（墨绿系），
 * 关联/依赖是**弱关系**（石板灰，越弱越淡）。
 */
export const UML_RELATION_COLOR: Record<UmlRelationKind, string> = {
  inheritance: '#6366f1',
  realization: '#8b5cf6',
  association: '#64748b',
  aggregation: '#0d9488',
  composition: '#0f766e',
  dependency: '#94a3b8',
};

/**
 * @class UmlRelation UML 类图的关系线
 *
 * 复用引擎的折线（`ICEPolyLine`）：插槽吸附、正交/贝塞尔路由、标签、跟随宿主都是现成的。
 * 这里只补 UML 特有的一件事 —— **端点标记**（三角/菱形/开放箭头）。
 *
 * 关键实现选择：标记**作为路径点插进 dots**（而不是画上去的装饰），因此
 * - 描边/填充走引擎既有通道（空心/实心天然可分）；
 * - SVG 导出**自动带上**标记（导出器读的是同一条命令流）；
 * - 包围盒、命中检测也跟着正确。
 */
export default class UmlRelation extends ICEPolyLine {
  public static readonly typeId = 'ice-entity-designer:UmlRelation';

  constructor(props: any = {}) {
    super(UmlRelation.arrangeParam(props));
    // 记法由 relationKind 决定：线型、端点标记、是否填充都在这里落成 state，
    // 这样序列化/导出/命中检测看到的都是一份确定的 state，而不是"画的时候再算"。
    this.__applyNotation();
    this.setState({ keepHistory: false });
    this.paramsDirty = true;
  }

  protected static arrangeParam(props: any) {
    return merge(
      {
        // 记法不可变换：关系线不给缩放/旋转手柄
        transformable: false,
        relationKind: 'association',
        label: '',
        arrowLength: 12,
        fill: false,
      },
      props
    );
  }

  public setState(patch: any): void {
    const kindChanged =
      !!patch &&
      (Object.prototype.hasOwnProperty.call(patch, 'relationKind') ||
        Object.prototype.hasOwnProperty.call(patch, 'arrowLength'));
    super.setState(patch);
    if (kindChanged && this.state.relationKind) {
      this.__applyNotation();
    }
  }

  /** 属性面板/DSL 改关系种类走这里 */
  public applyPatch(patch: any = {}): void {
    this.setState(patch);
  }

  /** 把记法写进 state：线型、端点、填充、标记种类 */
  private __applyNotation(): void {
    const kind: UmlRelationKind = (this.state.relationKind || 'association') as UmlRelationKind;
    const notation = UML_RELATION_STYLE[kind] || UML_RELATION_STYLE.association;
    const color = UML_RELATION_COLOR[kind] || UML_RELATION_COLOR.association;
    this.state.umlMarker = notation.marker;
    this.state.arrowStyle = notation.marker === 'none' ? 'none' : notation.filled ? 'filled' : 'hollow';
    this.state.lineDash = notation.dashed
      ? this.state.lineDash && this.state.lineDash.length
        ? this.state.lineDash
        : [8, 5]
      : [];
    this.state.arrow = notation.marker === 'none' ? 'none' : notation.markerEnd;
    // 线色跟着关系种类走（描边与标记填充同色，空心标记才不会被自己的填充盖住）
    this.state.style = {
      ...(this.state.style || {}),
      strokeStyle: color,
      fillStyle: color,
      lineWidth: 1.4,
    };
  }

  /**
   * @overwrite
   * 端点标记：按记法把三角/菱形/开放箭头的顶点插进 dots（因此它们是**路径的一部分**）。
   *
   * 引擎原生只支持三角（`doCalcArrowPoints()` 返回两个底角），这里对菱形做同样的展开：
   * 菱形的四个顶点 = 端点 P、两个腰点、远端顶点 —— 闭合后就是一个菱形。
   */
  protected calcArrowPoints(): void {
    const faces: number[] = (this as any).__arrowFaceIndexes;
    faces.length = 0;

    const kind: UmlRelationKind = (this.state.relationKind || 'association') as UmlRelationKind;
    const notation = UML_RELATION_STYLE[kind] || UML_RELATION_STYLE.association;
    const dots = this.state.dots;
    if (!dots || dots.length < 2 || notation.marker === 'none') {
      return;
    }

    const atStart = notation.markerEnd === 'start';
    const tip = [...(atStart ? dots[0] : dots[dots.length - 1])] as number[];
    const neighbor = [...(atStart ? dots[1] : dots[dots.length - 2])] as number[];
    const dx = tip[0] - neighbor[0];
    const dy = tip[1] - neighbor[1];
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const size = this.state.arrowLength || 14;
    const halfWidth = size * 0.4;
    const nx = -uy;
    const ny = ux;

    if (notation.marker === 'triangle' || notation.marker === 'open') {
      // 三角（继承/实现）与开放箭头（依赖）：用引擎既有的两点底角算法，形状随记法同源
      const base = this.doCalcArrowPoints([tip, neighbor]);
      if (atStart) {
        dots.unshift(...base);
        dots.unshift([...tip]);
        faces.push(0);
      } else {
        dots.push(...base);
        dots.push([...tip]);
        faces.push(dots.length - 4);
      }
      return;
    }

    // 菱形（聚合/组合）：tip → 腰点 → 远端 → 另一腰点 → tip
    const midX = tip[0] - ux * (size / 2);
    const midY = tip[1] - uy * (size / 2);
    const farX = tip[0] - ux * size;
    const farY = tip[1] - uy * size;
    const diamond = [
      [tip[0], tip[1]],
      [midX + nx * halfWidth, midY + ny * halfWidth],
      [farX, farY],
      [midX - nx * halfWidth, midY - ny * halfWidth],
    ];
    if (atStart) {
      // 倒序 unshift，保证插入后顺序是 tip → 腰 → 远端 → 腰
      dots.unshift(diamond[3], diamond[2], diamond[1]);
      faces.push(0);
    } else {
      dots.push(diamond[1], diamond[2], diamond[3], [...tip]);
      faces.push(dots.length - 4);
    }
  }
}
