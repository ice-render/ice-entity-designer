/**
 * Copyright (c) 2022 大漠穷秋.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { ICECircle, ICEGroup, ICERect, ICEText } from 'ice-render';
import merge from 'lodash/merge';

export const STATECHART_NODE_KINDS = ['initial', 'final', 'state', 'composite'] as const;
export type StatechartNodeKind = (typeof STATECHART_NODE_KINDS)[number];

const PSEUDO_STATE_SIZE = 24;

/**
 * @class StateNode 状态机的节点（伪状态 / 状态 / 复合状态）
 *
 * 复合组件（`hasDerivedChildren() === true`）：内部形状与名字由 state 派生、不进文档。
 * 四种记法：
 * - `initial` 初始伪状态：实心圆
 * - `final`   终止伪状态：同心圆（外圈 + 实心内圈）
 * - `state`   普通状态：圆角矩形 + 居中名字
 * - `composite` 复合状态：**容器** —— 名字靠左上，框里留给子状态；拖动它子状态一起走（引擎容器能力）
 */
export default class StateNode extends ICEGroup {
  public static readonly typeId = 'ice-entity-designer:StateNode';

  protected shapeComponent: any = null;
  protected innerRingComponent: any = null;
  protected labelComponent: ICEText | null = null;

  public hasDerivedChildren(): boolean {
    return true;
  }

  constructor(props: any = {}) {
    super(StateNode.arrangeParam(props));
    this.syncShape();
  }

  protected static arrangeParam(props: any = {}) {
    const kind: StatechartNodeKind = (props.kind || 'state') as StatechartNodeKind;
    const pseudo = kind === 'initial' || kind === 'final';
    return merge(
      {
        kind,
        title: '状态',
        width: pseudo ? PSEUDO_STATE_SIZE : kind === 'composite' ? 320 : 160,
        height: pseudo ? PSEUDO_STATE_SIZE : kind === 'composite' ? 200 : 64,
        // 自身不画：StateNode 继承自 ICEGroup（本质是矩形），不关掉的话每个状态都会
        // 多画一个方框 —— 伪状态（圆/同心圆）旁边会多出一个方块，普通状态则与派生形状重复。
        // 框/圆一律由派生形状绘制。
        fill: false,
        stroke: false,
        style: { strokeStyle: '#94a3b8', fillStyle: '#ffffff', lineWidth: 1.25, shadow: 'sm' },
        labelStyle: {
          textColor: '#1e293b',
          fontSize: 13.5,
          fontWeight: 'normal',
          paddingLeft: 12,
          paddingTop: 10,
        },
      },
      props,
      { transformable: false }
    );
  }

  /** 只有这些键变化才需要重建内部形状（拖动位置、选中态都不该重建） */
  private static readonly __shapeKeys = ['kind', 'title', 'width', 'height', 'style', 'labelStyle'];

  public setState(patch: any): void {
    const needsRebuild =
      !!patch && StateNode.__shapeKeys.some((key) => Object.prototype.hasOwnProperty.call(patch, key));
    super.setState(patch);
    if (needsRebuild) {
      this.syncShape();
    }
  }

  public applyPatch(patch: any = {}): void {
    this.setState(patch);
  }

  /** 伪状态（初始/终止）不显示名字 */
  public isPseudoState(): boolean {
    return this.state.kind === 'initial' || this.state.kind === 'final';
  }

  /**
   * 按 kind 重建内部形状与名字。
   *
   * zIndex 必须显式给：引擎在**构造时**分配自增 zIndex，后构造的会盖住先构造的
   * （UML 那边就踩过「底色带盖住类名」），这里统一「形状在下、文字在上」。
   */
  protected syncShape(): void {
    this.__clearDerivedChildren();
    const baseZ = this.state.zIndex || 0;
    const kind: StatechartNodeKind = (this.state.kind || 'state') as StatechartNodeKind;
    const width = this.state.width;
    const height = this.state.height;

    if (kind === 'initial') {
      this.shapeComponent = new ICECircle({
        zIndex: baseZ + 1,
        left: 0,
        top: 0,
        radius: Math.min(width, height) / 2,
        stroke: false,
        interactive: false,
        // 伪状态用固定的深色：UML 里初始态是**实心黑点**，跟着状态的边框色（浅石板）变淡就不成记法了
        style: { fillStyle: this.state.style.pseudoColor || '#334155' },
      });
      this.addChild(this.shapeComponent);
      return;
    }

    if (kind === 'final') {
      const radius = Math.min(width, height) / 2;
      const lineWidth = this.state.style.lineWidth || 1.5;
      this.shapeComponent = new ICECircle({
        zIndex: baseZ + 1,
        left: 0,
        top: 0,
        radius,
        stroke: true,
        interactive: false,
        style: {
          fillStyle: this.state.style.fillStyle || '#ffffff',
          strokeStyle: this.state.style.pseudoColor || '#334155',
          lineWidth,
        },
      });
      // 同心圆的内圈：半径按外圈收 40%
      this.innerRingComponent = new ICECircle({
        zIndex: baseZ + 2,
        left: 0,
        top: 0,
        radius: radius * 0.6,
        stroke: false,
        interactive: false,
        style: { fillStyle: this.state.style.pseudoColor || '#334155' },
      });
      this.addChild(this.shapeComponent);
      this.addChild(this.innerRingComponent);
      return;
    }

    // 普通状态 / 复合状态：圆角矩形 + 名字
    this.shapeComponent = new ICERect({
      zIndex: baseZ + 1,
      left: 0,
      top: 0,
      width,
      height,
      radius: kind === 'composite' ? 14 : 12,
      stroke: true,
      interactive: false,
      style: {
        fillStyle: this.state.style.fillStyle || '#ffffff',
        strokeStyle: this.state.style.strokeStyle || '#334155',
        lineWidth: this.state.style.lineWidth || 1.5,
        shadow: this.state.style.shadow,
        lineDash: kind === 'composite' ? [6, 5] : [],
      },
    });
    this.addChild(this.shapeComponent);

    const composite = kind === 'composite';
    this.labelComponent = new ICEText({
      zIndex: baseZ + 2,
      left: 0,
      top: 0,
      width,
      height: composite ? Math.max(this.state.labelStyle.fontSize + this.state.labelStyle.paddingTop * 2, 28) : height,
      text: String(this.state.title || ''),
      stroke: false,
      interactive: false,
      style: {
        fontSize: this.state.labelStyle.fontSize,
        fontWeight: this.state.labelStyle.fontWeight,
        fillStyle: this.state.labelStyle.textColor,
        // 复合状态的名字靠左上（框里要留给子状态），普通状态居中
        textAlign: composite ? 'left' : 'center',
        textBaseline: composite ? 'top' : 'middle',
        paddingLeft: composite ? this.state.labelStyle.paddingLeft : 0,
        paddingTop: composite ? this.state.labelStyle.paddingTop : 0,
      },
    });
    this.addChild(this.labelComponent);
  }

  private __clearDerivedChildren(): void {
    if (this.shapeComponent) {
      this.removeChild(this.shapeComponent);
      this.shapeComponent = null;
    }
    if (this.innerRingComponent) {
      this.removeChild(this.innerRingComponent);
      this.innerRingComponent = null;
    }
    if (this.labelComponent) {
      this.removeChild(this.labelComponent);
      this.labelComponent = null;
    }
  }
}
