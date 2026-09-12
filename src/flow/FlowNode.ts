/**
 * Copyright (c) 2022 大漠穷秋.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { ICEGroup, ICERect, ICEText } from 'ice-render';
import { FlowDiamond, FlowParallelogram } from './flow_shapes';
import {
  BpmnAnnotationShape,
  BpmnDataObjectShape,
  BpmnEventShape,
  BpmnGatewayShape,
  BpmnLaneShape,
  BpmnSubprocessMarker,
  BpmnTaskIcon,
} from '../bpmn/bpmn_shapes';

/**
 * 节点类型词汇表。
 *
 * - 流程图：`terminator` / `process` / `decision` / `io`
 * - BPMN 2.0：`bpmnEvent` / `bpmnTask` / `bpmnGateway` / `bpmnSubprocess` /
 *   `bpmnDataObject` / `bpmnAnnotation` / `bpmnPool` / `bpmnLane`
 *
 * BPMN 复用同一套节点/连线/历史/快照机制（都是 `FlowNode`），语义差异由 `kind`
 * 与 BPMN 专属属性（eventKind / trigger / gatewayType / taskType / band）承载，
 * 因此文档、React 绑定、DSL 都不需要第二套实现。
 */
export type FlowNodeKind =
  | 'terminator'
  | 'process'
  | 'decision'
  | 'io'
  | 'bpmnEvent'
  | 'bpmnTask'
  | 'bpmnGateway'
  | 'bpmnSubprocess'
  | 'bpmnDataObject'
  | 'bpmnAnnotation'
  | 'bpmnPool'
  | 'bpmnLane';

export type FlowNodePreset = {
  label: string;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  radius?: number;
  shape: 'rect' | 'diamond' | 'parallelogram' | 'event' | 'gateway' | 'dataObject' | 'annotation' | 'lane';
  /** 外框线宽（BPMN 结束事件用粗圈） */
  lineWidth?: number;
  /** 虚线（注释框） */
  lineDash?: number[];
  /** 名称带：泳道在左、池在顶 */
  band?: 'left' | 'top';
  bandSize?: number;
  /** 标题摆放：居中（图元）或左上（池/泳道/注释） */
  labelPlacement?: 'center' | 'top-left';
  /** 背景透明（泳道用：相邻泳道共享边界时，填充会盖住邻居的边框） */
  transparent?: boolean;
  /** 默认的任务类型角标（bpmnTask 用） */
  taskType?: string;
  /** 默认事件种类 / 触发（bpmnEvent 用） */
  eventKind?: string;
  trigger?: string;
  /** 默认网关类型（bpmnGateway 用） */
  gatewayType?: string;
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
  // ---- BPMN 2.0（等宽高的事件圆、菱形网关、圆角任务…；默认白底深边框，符合 BPMN 观感）----
  bpmnEvent: {
    label: '事件',
    width: 56,
    height: 56,
    fill: '#ffffff',
    stroke: '#0f172a',
    shape: 'event',
    lineWidth: 1.5,
    eventKind: 'start',
    trigger: 'none',
    labelPlacement: 'top-left',
  },
  bpmnTask: {
    label: '任务',
    width: 180,
    height: 90,
    fill: '#ffffff',
    stroke: '#0f172a',
    radius: 8,
    shape: 'rect',
    taskType: 'none',
    labelPlacement: 'center',
  },
  bpmnGateway: {
    label: '网关',
    width: 70,
    height: 70,
    fill: '#ffffff',
    stroke: '#0f172a',
    shape: 'gateway',
    gatewayType: 'exclusive',
    labelPlacement: 'top-left',
  },
  bpmnSubprocess: {
    label: '子流程',
    width: 200,
    height: 110,
    fill: '#ffffff',
    stroke: '#0f172a',
    radius: 8,
    shape: 'rect',
    labelPlacement: 'center',
  },
  bpmnDataObject: {
    label: '数据对象',
    width: 130,
    height: 80,
    fill: '#ffffff',
    stroke: '#0f172a',
    shape: 'dataObject',
    labelPlacement: 'center',
  },
  bpmnAnnotation: {
    label: '注释',
    width: 200,
    height: 80,
    fill: '#ffffff',
    stroke: '#64748b',
    shape: 'annotation',
    lineDash: [],
    labelPlacement: 'center',
  },
  bpmnPool: {
    label: '池',
    width: 900,
    height: 260,
    fill: '#f8fafc',
    stroke: '#64748b',
    shape: 'lane',
    band: 'top',
    bandSize: 32,
    labelPlacement: 'top-left',
  },
  bpmnLane: {
    label: '泳道',
    width: 900,
    height: 130,
    fill: '#ffffff',
    stroke: '#94a3b8',
    shape: 'lane',
    band: 'left',
    bandSize: 32,
    labelPlacement: 'top-left',
    transparent: true,
  },
};

const SHAPE_BY_KIND: Record<FlowNodePreset['shape'], any> = {
  rect: ICERect,
  diamond: FlowDiamond,
  parallelogram: FlowParallelogram,
  event: BpmnEventShape,
  gateway: BpmnGatewayShape,
  dataObject: BpmnDataObjectShape,
  annotation: BpmnAnnotationShape,
  lane: BpmnLaneShape,
};

/** 节点标题的默认颜色 / 字号（可被 state.textColor / state.fontSize 覆盖） */
const DEFAULT_TEXT_COLOR = '#0f172a';
const DEFAULT_FONT_SIZE = 14;

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
  /** BPMN 装饰件（任务角标 / 子流程标记），随形状一起重建 */
  protected decorationComponents: any[] = [];

  /**
   * 内部子组件（形状 + 标题）由 kind/尺寸/配色派生，构造函数会重建 →
   * 不参与引擎序列化（否则往返会重复挂载，且子组件 zIndex 抖动，见 ICEComponent.hasDerivedChildren）。
   */
  public hasDerivedChildren(): boolean {
    return true;
  }

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
    if (this.decorationComponents && this.decorationComponents.length) {
      this.removeChildren(this.decorationComponents);
      this.decorationComponents.length = 0;
    }
    const preset = FLOW_NODE_KINDS[this.state.kind as FlowNodeKind] || FLOW_NODE_KINDS.process;
    const ShapeCtor = SHAPE_BY_KIND[preset.shape] || ICERect;
    this.shapeComponent = new ShapeCtor({
      left: 0,
      top: 0,
      width: this.state.width,
      height: this.state.height,
      radius: preset.radius || 0,
      // BPMN：结束事件靠粗描边表达、注释框走虚线、池/泳道带名称带、事件/网关带语义属性
      lineWidth: preset.lineWidth || 1.5,
      lineDash: this.state.lineDash || preset.lineDash || [],
      eventKind: this.state.eventKind || preset.eventKind,
      trigger: this.state.trigger || preset.trigger,
      gatewayType: this.state.gatewayType || preset.gatewayType,
      taskType: this.state.taskType || preset.taskType,
      band: preset.band,
      bandSize: preset.bandSize,
      fill: !preset.transparent,
      interactive: false,
      showMinBoundingBox: false,
      showMaxBoundingBox: false,
      style: {
        fillStyle: this.state.fillColor || preset.fill,
        strokeStyle: this.state.strokeColor || preset.stroke,
        lineWidth: preset.lineWidth || 1.5,
      },
    });
    this.__buildDecorations(preset);
    const topLeftLabel = preset.labelPlacement === 'top-left';
    this.labelComponent = new ICEText({
      left: topLeftLabel ? 10 : 0,
      top: topLeftLabel ? (preset.band === 'top' ? 18 : 16) : 0,
      width: topLeftLabel ? Math.max(this.state.width - 20, 20) : this.state.width,
      height: topLeftLabel ? 18 : this.state.height,
      text: String(this.state.title || ''),
      wrap: !topLeftLabel,
      maxLines: 2,
      interactive: false,
      stroke: false,
      showMinBoundingBox: false,
      showMaxBoundingBox: false,
      style: {
        fontSize: this.state.fontSize || (topLeftLabel ? 13 : DEFAULT_FONT_SIZE),
        fillStyle: this.state.textColor || DEFAULT_TEXT_COLOR,
        textAlign: topLeftLabel ? 'left' : 'center',
        textBaseline: 'middle',
        fontWeight: topLeftLabel ? 'bold' : 'normal',
        paddingLeft: topLeftLabel ? 0 : 12,
        paddingRight: topLeftLabel ? 0 : 12,
      },
    });
    this.addChild(this.shapeComponent);
    this.addChild(this.labelComponent);
  }

  /**
   * BPMN 装饰件（任务类型角标、子流程折叠标记）。
   *
   * 它们与形状/标题一样由节点 state 派生，因此不需要单独序列化
   * （见 hasDerivedChildren：整个内部子树都是派生的）。
   */
  private __buildDecorations(preset: FlowNodePreset): void {
    const kind = this.state.kind as FlowNodeKind;
    const decorations: any[] = [];
    const strokeStyle = this.state.strokeColor || preset.stroke;

    if (kind === 'bpmnTask' || kind === 'bpmnSubprocess') {
      const taskType = this.state.taskType || preset.taskType || 'none';
      if (taskType !== 'none') {
        decorations.push(
          new BpmnTaskIcon({
            left: 8,
            top: 8,
            width: 14,
            height: 14,
            stroke: true,
            fill: false,
            interactive: false,
            showMinBoundingBox: false,
            showMaxBoundingBox: false,
            taskType,
            style: { strokeStyle, lineWidth: 1.4 },
          })
        );
      }
    }

    if (kind === 'bpmnSubprocess') {
      // 折叠子流程：底部居中的「+」标记
      decorations.push(
        new BpmnSubprocessMarker({
          left: (this.state.width - 14) / 2,
          top: this.state.height - 20,
          width: 14,
          height: 14,
          stroke: true,
          fill: false,
          interactive: false,
          showMinBoundingBox: false,
          showMaxBoundingBox: false,
          style: { strokeStyle, lineWidth: 1.4 },
        })
      );
    }

    if (decorations.length) {
      decorations.forEach((decoration) => this.addChild(decoration));
      this.decorationComponents = decorations;
    }
  }

  /** 改节点属性（标题 / 类型 / 配色 / 尺寸），必要时重建形状 */
  public applyPatch(patch: Record<string, any> = {}): this {
    const needsRebuild =
      patch.kind !== undefined ||
      patch.fillColor !== undefined ||
      patch.strokeColor !== undefined ||
      patch.textColor !== undefined ||
      patch.fontSize !== undefined ||
      patch.eventKind !== undefined ||
      patch.trigger !== undefined ||
      patch.gatewayType !== undefined ||
      patch.taskType !== undefined ||
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
}
