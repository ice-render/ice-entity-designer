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
      style: { strokeStyle: '#475569', fillStyle: '#475569', lineWidth: 1.6, ...(props.style || {}) },
      labelStyle: {
        fontSize: 12,
        fillStyle: '#334155',
        backgroundColor: '#ffffff',
        paddingLeft: 4,
        paddingRight: 4,
        ...(props.labelStyle || {}),
      },
    });
  }
}
