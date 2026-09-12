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

/** 连线在快照里的纯数据 */
export type FlowEdgeSnapshot = {
  id: string;
  typeId: string;
  sourceId: string | null;
  targetId: string | null;
  sourcePort: FlowPort | null;
  targetPort: FlowPort | null;
  label: string;
  linkShape: string;
  startPoint: number[];
  endPoint: number[];
  /** 线色 / 线宽等（引擎 ICEPolyLine 的 style）；缺省时引擎用内置默认 */
  style?: Record<string, any>;
  /** 标签的字号 / 颜色 / 背景（引擎的 labelStyle） */
  labelStyle?: Record<string, any>;
};

/**
 * @class FlowEdge 流程图连线
 *
 * 复用引擎的 Visio 连线（正交折线 / 贝塞尔），带标签与箭头，并通过 `links` 挂在
 * 两端节点的插槽上 —— 节点被拖动时连线自动跟随重新布线。
 */
export default class FlowEdge extends ICEVisioLink {
  public static readonly typeId = 'FlowEdge';

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

  /** 流程快照用的纯数据 */
  public toFlowObject(): FlowEdgeSnapshot {
    const links = this.state.links || {};
    const start = links.start || {};
    const end = links.end || {};
    return {
      id: this.state.id,
      typeId: FlowEdge.typeId,
      sourceId: start.id || null,
      targetId: end.id || null,
      sourcePort: start.position || null,
      targetPort: end.position || null,
      label: this.state.label,
      linkShape: this.state.linkShape,
      startPoint: this.state.startPoint,
      endPoint: this.state.endPoint,
      style: { ...(this.state.style || {}) },
      labelStyle: { ...(this.state.labelStyle || {}) },
    };
  }
}
