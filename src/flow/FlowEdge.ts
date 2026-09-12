/**
 * Copyright (c) 2022 大漠穷秋.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { ICEVisioLink } from 'ice-render';

/** 连线端点所在的插槽位置（上 / 右 / 下 / 左 / 中心） */
export type FlowPort = 'T' | 'R' | 'B' | 'L' | 'C';

/**
 * @class FlowEdge 流程图连线
 *
 * 复用引擎的 Visio 连线（正交折线 / 贝塞尔），带标签与箭头，并通过 `links` 挂在
 * 两端节点的插槽上 —— 节点被拖动时连线自动跟随重新布线。
 */
export default class FlowEdge extends ICEVisioLink {
  public static readonly typeId = 'FlowEdge';

  /** 连线没有子组件；声明派生可保证将来即使加了内部装饰也不会被重复序列化 */
  public hasDerivedChildren(): boolean {
    return true;
  }

  constructor(props: any = {}) {
    super({
      title: 'Edge',
      arrow: 'end',
      linkShape: 'visio',
      lineType: 'solid',
      linkable: false,
      draggable: false,
      interactive: true,
      transformable: false,
      startPoint: [0, 0],
      endPoint: [10, 10],
      label: '',
      ...props,
      style: { strokeStyle: '#64748b', fillStyle: '#64748b', lineWidth: 1.4, ...(props.style || {}) },
      labelStyle: {
        fontSize: 12,
        fillStyle: '#334155',
        backgroundColor: '#ffffff',
        paddingLeft: 4,
        paddingRight: 4,
        ...(props.labelStyle || {}),
      },
    });
    // BPMN 连线类型（sequence / message / association）决定虚线、箭头样式与语义属性；
    // props 里带过来时立即归一化一次，之后由 applyPatch 维护
    this.applyPatch({
      flowType: this.state.flowType,
      condition: this.state.condition,
      isDefault: this.state.isDefault,
    });
  }

  /**
   * 改连线属性，并按 BPMN 语义重算派生样式（线型 / 虚线 / 箭头）。
   *
   * - sequence：实线 + 实心箭头
   * - message：虚线 + 空心箭头（跨参与者通信）
   * - association：点线 + 无箭头
   */
  public applyPatch(patch: Record<string, any> = {}): this {
    const next = { ...this.state, ...patch };
    const flowType = next.flowType || 'sequence';
    const derived =
      flowType === 'message'
        ? { lineDash: [7, 4], arrowStyle: 'hollow', lineWidth: next.lineWidth || 1.4 }
        : flowType === 'association'
        ? { lineDash: [2, 3], arrow: 'none', arrowStyle: 'hollow', lineWidth: next.lineWidth || 1.2 }
        : { arrow: next.arrow || 'end', arrowStyle: 'filled', lineDash: [], lineWidth: next.lineWidth || 1.4 };
    this.setState({ ...patch, ...derived });
    this.dirty = true;
    return this;
  }
}
