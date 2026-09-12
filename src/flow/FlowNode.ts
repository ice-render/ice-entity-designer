/**
 * Copyright (c) 2022 大漠穷秋.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { ICEGroup, ICERect, ICEText } from 'ice-render';
import { FlowDiamond, FlowParallelogram } from './flow_shapes';

/** 流程图节点类型：起止 / 处理 / 判定 / 输入输出 */
export type FlowNodeKind = 'terminator' | 'process' | 'decision' | 'io';

export type FlowNodePreset = {
  label: string;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  radius?: number;
  shape: 'rect' | 'diamond' | 'parallelogram';
};

/** 各类型节点的默认尺寸与配色（同时作为属性面板的预设） */
export const FLOW_NODE_KINDS: Record<FlowNodeKind, FlowNodePreset> = {
  terminator: {
    label: '开始 / 结束',
    width: 180,
    height: 60,
    fill: '#dcfce7',
    stroke: '#16a34a',
    radius: 30,
    shape: 'rect',
  },
  process: { label: '处理', width: 220, height: 80, fill: '#e0e7ff', stroke: '#4f46e5', radius: 10, shape: 'rect' },
  decision: { label: '判定', width: 200, height: 120, fill: '#fef3c7', stroke: '#d97706', shape: 'diamond' },
  io: { label: '输入 / 输出', width: 220, height: 80, fill: '#e0f2fe', stroke: '#0284c7', shape: 'parallelogram' },
};

const SHAPE_BY_KIND: Record<FlowNodePreset['shape'], any> = {
  rect: ICERect,
  diamond: FlowDiamond,
  parallelogram: FlowParallelogram,
};

/** 节点标题的默认颜色 / 字号（可被 state.textColor / state.fontSize 覆盖） */
const DEFAULT_TEXT_COLOR = '#0f172a';
const DEFAULT_FONT_SIZE = 14;

/** 流程图节点在快照里的纯数据（不含引擎内部状态） */
export type FlowNodeSnapshot = {
  id: string;
  typeId: string;
  kind: FlowNodeKind;
  title: string;
  left: number;
  top: number;
  width: number;
  height: number;
  fillColor: string;
  strokeColor: string;
  textColor: string;
  fontSize: number;
};

/**
 * @class FlowNode 流程图节点
 *
 * 一个不可见的容器（ICEGroup）里放「形状 + 居中标题」：容器只负责定位、拖拽与命中，
 * 形状由子组件绘制，因此菱形 / 平行四边形这类非矩形轮廓也能正确渲染，
 * 而节点的 width/height 始终就是它的包围盒（连线插槽、布局都按它算）。
 */
export default class FlowNode extends ICEGroup {
  /** 稳定的类型标识（下游打包会 mangle 类名，判型不要用 constructor.name） */
  public static readonly typeId = 'FlowNode';

  protected shapeComponent: any = null;
  protected labelComponent: any = null;

  constructor(props: any = {}) {
    const kind: FlowNodeKind = FLOW_NODE_KINDS[props.kind as FlowNodeKind] ? props.kind : 'process';
    const preset = FLOW_NODE_KINDS[kind];
    super({
      kind,
      title: preset.label,
      fillColor: preset.fill,
      strokeColor: preset.stroke,
      textColor: DEFAULT_TEXT_COLOR,
      fontSize: DEFAULT_FONT_SIZE,
      width: preset.width,
      height: preset.height,
      // 容器只做定位与拖拽：背景交给子形状，避免「方形底 + 菱形轮廓」
      fill: false,
      stroke: false,
      draggable: true,
      interactive: true,
      transformable: false,
      ...props,
    });
    this.__buildShape();
  }

  /** 按当前 kind / 尺寸 / 配色重建形状与标题（切换类型或改样式时调用） */
  private __buildShape(): void {
    if (this.shapeComponent) {
      this.removeChild(this.shapeComponent);
    }
    if (this.labelComponent) {
      this.removeChild(this.labelComponent);
    }
    const preset = FLOW_NODE_KINDS[this.state.kind as FlowNodeKind] || FLOW_NODE_KINDS.process;
    const ShapeCtor = SHAPE_BY_KIND[preset.shape] || ICERect;
    this.shapeComponent = new ShapeCtor({
      left: 0,
      top: 0,
      width: this.state.width,
      height: this.state.height,
      radius: preset.radius || 0,
      interactive: false,
      showMinBoundingBox: false,
      showMaxBoundingBox: false,
      style: {
        fillStyle: this.state.fillColor || preset.fill,
        strokeStyle: this.state.strokeColor || preset.stroke,
        lineWidth: 1.5,
      },
    });
    this.labelComponent = new ICEText({
      left: 0,
      top: 0,
      width: this.state.width,
      height: this.state.height,
      text: String(this.state.title || ''),
      wrap: true,
      maxLines: 2,
      interactive: false,
      stroke: false,
      showMinBoundingBox: false,
      showMaxBoundingBox: false,
      style: {
        fontSize: this.state.fontSize || DEFAULT_FONT_SIZE,
        fillStyle: this.state.textColor || DEFAULT_TEXT_COLOR,
        textAlign: 'center',
        textBaseline: 'middle',
        paddingLeft: 12,
        paddingRight: 12,
      },
    });
    this.addChild(this.shapeComponent);
    this.addChild(this.labelComponent);
  }

  /** 改节点属性（标题 / 类型 / 配色 / 尺寸），必要时重建形状 */
  public applyPatch(patch: Record<string, any> = {}): this {
    const needsRebuild =
      patch.kind !== undefined ||
      patch.fillColor !== undefined ||
      patch.strokeColor !== undefined ||
      patch.textColor !== undefined ||
      patch.fontSize !== undefined ||
      patch.width !== undefined ||
      patch.height !== undefined;
    this.setState(patch);
    if (needsRebuild) {
      this.__buildShape();
    } else if (this.labelComponent) {
      this.labelComponent.setState({ text: String(this.state.title || '') });
    }
    this.dirty = true;
    return this;
  }

  /** 流程快照用的纯数据 */
  public toFlowObject(): FlowNodeSnapshot {
    return {
      id: this.state.id,
      typeId: FlowNode.typeId,
      kind: this.state.kind,
      title: this.state.title,
      left: this.state.left,
      top: this.state.top,
      width: this.state.width,
      height: this.state.height,
      fillColor: this.state.fillColor,
      strokeColor: this.state.strokeColor,
      textColor: this.state.textColor || DEFAULT_TEXT_COLOR,
      fontSize: this.state.fontSize || DEFAULT_FONT_SIZE,
    };
  }
}
